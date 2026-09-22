-- =====================================================================
-- ChipPet · Mascotas perdidas
-- 2/4  funciones.sql — funciones, triggers y RPC
-- Ejecutar DESPUÉS de schema.sql y ANTES de politicas.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades puras
-- ---------------------------------------------------------------------

-- Minúsculas, sin tildes, sin signos y con espacios colapsados.
create or replace function public.normalizar_texto(t text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
           regexp_replace(
             translate(lower(coalesce(t, '')), 'áéíóúüñàèìòùäëïöâêîôû', 'aeiouunaeiouaeioaeiou'),
             '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g'))
$$;

-- Distancia Haversine en kilómetros.
create or replace function public.distancia_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371.0088 * asin(least(1, sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

-- Rol del usuario autenticado (usado por las políticas RLS).
create or replace function public.mi_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select p.rol from public.perfiles p where p.id = auth.uid()
$$;

-- ¿El usuario autenticado es el dueño de la mascota?
create or replace function public.es_dueno_mascota(p_mascota uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.mascotas m
                 where m.id = p_mascota and m.propietario_id = auth.uid())
$$;

-- ¿El usuario autenticado es el creador del caso?
create or replace function public.es_dueno_caso(p_caso uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.casos c
                 where c.id = p_caso and c.creador_id = auth.uid())
$$;

-- ¿El usuario participa en la verificación (reclamante, verificador o dueño del caso)?
create or replace function public.participa_verificacion(p_verificacion uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.verificaciones v
    join public.casos c on c.id = v.caso_id
    where v.id = p_verificacion
      and auth.uid() in (v.reclamante_id, v.verificador_id, c.creador_id))
$$;

-- ---------------------------------------------------------------------
-- Ayudantes internos (no invocables desde el cliente)
-- ---------------------------------------------------------------------
create or replace function public._notificar(p_usuario uuid, p_titulo text, p_cuerpo text, p_enlace text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notificaciones (usuario_id, titulo, cuerpo, enlace)
  values (p_usuario, p_titulo, p_cuerpo, p_enlace);
$$;

create or replace function public._evento(p_caso uuid, p_tipo text, p_autor uuid, p_descripcion text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.eventos (caso_id, tipo, autor_id, descripcion)
  values (p_caso, p_tipo, p_autor, left(p_descripcion, 500));
$$;

create or replace function public._fecha_local(p timestamptz)
returns text
language sql
stable
as $$
  select to_char(p at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI')
$$;

create or replace function public._enmascarar_chip(p_codigo text)
returns text
language sql
immutable
as $$
  select '•••••••••••' || right(p_codigo, 4)
$$;

-- ---------------------------------------------------------------------
-- Perfil automático al registrarse (lee los metadatos del signUp)
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.rol_usuario;
begin
  if coalesce((new.raw_user_meta_data ->> 'acepto_datos')::boolean, false) is not true then
    raise exception 'Debes aceptar el tratamiento de datos personales para registrarte.';
  end if;

  -- ADMIN nunca se autoasigna desde el registro
  v_rol := case upper(coalesce(new.raw_user_meta_data ->> 'rol', 'CIUDADANO'))
             when 'PROPIETARIO' then 'PROPIETARIO'::public.rol_usuario
             when 'VETERINARIO' then 'VETERINARIO'::public.rol_usuario
             else 'CIUDADANO'::public.rol_usuario
           end;

  insert into public.perfiles (id, nombre, telefono, rol, acepto_datos)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'telefono'), ''), '0000000'),
    v_rol,
    true);
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------
-- Mascotas: normalización, integridad y guardado atómico
-- ---------------------------------------------------------------------
create or replace function public.normalizar_dato_reservado()
returns trigger
language plpgsql
as $$
begin
  new.pregunta := btrim(new.pregunta);
  new.respuesta := public.normalizar_texto(new.respuesta);
  if new.respuesta = '' then
    raise exception 'La respuesta del dato reservado no puede quedar vacía.';
  end if;
  return new;
end;
$$;

create trigger datos_reservados_normalizar
  before insert or update on public.datos_reservados
  for each row execute function public.normalizar_dato_reservado();

-- Al cerrar la transacción: mínimo 3 datos reservados y entre 1 y 6 fotos.
create or replace function public.validar_integridad_mascota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mascota uuid;
  v_reservados int;
  v_fotos int;
begin
  -- Sentencias separadas: PL/pgSQL no permite referir old.mascota_id cuando el trigger es de "mascotas".
  if tg_table_name = 'mascotas' then
    v_mascota := new.id;
  else
    v_mascota := old.mascota_id;
  end if;

  if not exists (select 1 from public.mascotas where id = v_mascota) then
    return null; -- la mascota fue eliminada en cascada
  end if;

  select count(*) into v_reservados from public.datos_reservados where mascota_id = v_mascota;
  if v_reservados < 3 then
    raise exception 'La mascota debe tener al menos 3 datos reservados (tiene %).', v_reservados
      using errcode = 'check_violation';
  end if;

  select count(*) into v_fotos from public.fotos_mascota where mascota_id = v_mascota;
  if v_fotos < 1 then
    raise exception 'La mascota debe tener al menos 1 foto.' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger mascotas_integridad
  after insert on public.mascotas
  deferrable initially deferred
  for each row execute function public.validar_integridad_mascota();

create constraint trigger datos_reservados_minimo
  after delete on public.datos_reservados
  deferrable initially deferred
  for each row execute function public.validar_integridad_mascota();

create constraint trigger fotos_mascota_minimo
  after delete on public.fotos_mascota
  deferrable initially deferred
  for each row execute function public.validar_integridad_mascota();

create or replace function public.limitar_fotos_mascota()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.fotos_mascota where mascota_id = new.mascota_id) >= 6 then
    raise exception 'Una mascota puede tener como máximo 6 fotos.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger fotos_mascota_maximo
  before insert on public.fotos_mascota
  for each row execute function public.limitar_fotos_mascota();

-- Alta / edición atómica de mascota + fotos + datos reservados.
-- SECURITY INVOKER: todas las escrituras pasan por RLS.
--   p_mascota:    {nombre, especie, raza, color_principal, tamano, sexo, microchip, temperamento, nota_manejo}
--   p_fotos:      [{url, es_principal}]
--   p_reservados: [{id?, pregunta, respuesta}]
create or replace function public.guardar_mascota(
  p_id uuid, p_mascota jsonb, p_fotos jsonb, p_reservados jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_item jsonb;
  v_orden int := 0;
  v_ids_conservar uuid[] := '{}';
  v_chip text := nullif(btrim(p_mascota ->> 'microchip'), '');
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar una mascota.';
  end if;
  if jsonb_typeof(p_reservados) <> 'array' or jsonb_array_length(p_reservados) < 3 then
    raise exception 'Debes registrar al menos 3 datos reservados (pregunta y respuesta).'
      using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_fotos) <> 'array' or jsonb_array_length(p_fotos) not between 1 and 6 then
    raise exception 'Debes subir entre 1 y 6 fotos de la mascota.' using errcode = 'check_violation';
  end if;
  if (select count(distinct public.normalizar_texto(x ->> 'pregunta')) from jsonb_array_elements(p_reservados) x)
     < jsonb_array_length(p_reservados) then
    raise exception 'Las preguntas de los datos reservados no pueden repetirse.';
  end if;
  if v_chip is not null and v_chip !~ '^[0-9]{15}$' then
    raise exception 'El microchip debe tener 15 dígitos numéricos.';
  end if;

  if v_id is null then
    insert into public.mascotas (propietario_id, nombre, especie, raza, color_principal, tamano, sexo,
                                 microchip, temperamento, nota_manejo)
    values (auth.uid(),
            btrim(p_mascota ->> 'nombre'),
            (p_mascota ->> 'especie')::public.especie_animal,
            nullif(btrim(p_mascota ->> 'raza'), ''),
            p_mascota ->> 'color_principal',
            (p_mascota ->> 'tamano')::public.tamano_animal,
            coalesce(p_mascota ->> 'sexo', 'DESCONOCIDO')::public.sexo_animal,
            v_chip,
            coalesce(p_mascota ->> 'temperamento', 'TRANQUILA')::public.temperamento_animal,
            nullif(btrim(p_mascota ->> 'nota_manejo'), ''))
    returning id into v_id;
  else
    update public.mascotas set
      nombre          = btrim(p_mascota ->> 'nombre'),
      especie         = (p_mascota ->> 'especie')::public.especie_animal,
      raza            = nullif(btrim(p_mascota ->> 'raza'), ''),
      color_principal = p_mascota ->> 'color_principal',
      tamano          = (p_mascota ->> 'tamano')::public.tamano_animal,
      sexo            = coalesce(p_mascota ->> 'sexo', 'DESCONOCIDO')::public.sexo_animal,
      microchip       = v_chip,
      temperamento    = coalesce(p_mascota ->> 'temperamento', 'TRANQUILA')::public.temperamento_animal,
      nota_manejo     = nullif(btrim(p_mascota ->> 'nota_manejo'), '')
    where id = v_id;
    if not found then
      raise exception 'La mascota no existe o no eres su propietario.' using errcode = '42501';
    end if;
  end if;

  -- Fotos: se reemplaza el listado completo
  delete from public.fotos_mascota where mascota_id = v_id;
  for v_item in select * from jsonb_array_elements(p_fotos) loop
    insert into public.fotos_mascota (mascota_id, url, es_principal, orden)
    values (v_id, v_item ->> 'url', coalesce((v_item ->> 'es_principal')::boolean, v_orden = 0), v_orden);
    v_orden := v_orden + 1;
  end loop;

  -- Datos reservados: se actualizan los existentes, se crean los nuevos y se borran los omitidos
  for v_item in select * from jsonb_array_elements(p_reservados) loop
    if nullif(v_item ->> 'id', '') is not null then
      update public.datos_reservados
         set pregunta = v_item ->> 'pregunta', respuesta = v_item ->> 'respuesta'
       where id = (v_item ->> 'id')::uuid and mascota_id = v_id;
      v_ids_conservar := v_ids_conservar || (v_item ->> 'id')::uuid;
    end if;
  end loop;
  delete from public.datos_reservados
   where mascota_id = v_id and not (id = any (v_ids_conservar));
  for v_item in select * from jsonb_array_elements(p_reservados) loop
    if nullif(v_item ->> 'id', '') is null then
      insert into public.datos_reservados (mascota_id, pregunta, respuesta)
      values (v_id, v_item ->> 'pregunta', v_item ->> 'respuesta');
    end if;
  end loop;

  return v_id;
end;
$$;

-- Asocia lecturas de microchip huérfanas a una mascota (y a su caso abierto si existe).
create or replace function public._vincular_lecturas(p_mascota uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m record;
  v_caso uuid;
  v_l record;
begin
  select id, nombre, microchip, propietario_id into v_m from public.mascotas where id = p_mascota;
  if not found or v_m.microchip is null then
    return;
  end if;

  select c.id into v_caso from public.casos c
   where c.mascota_id = p_mascota and c.estado in ('ABIERTO', 'EN_VERIFICACION')
   order by (c.tipo = 'PERDIDA') desc, c.creado_en desc
   limit 1;

  for v_l in
    update public.lecturas_microchip l
       set mascota_id = p_mascota,
           caso_id = coalesce(l.caso_id, v_caso)
     where l.codigo = v_m.microchip
       and not l.anulada
       and (l.mascota_id is null or (l.caso_id is null and v_caso is not null))
    returning l.*
  loop
    if v_caso is not null then
      perform public._evento(v_caso, 'LECTURA_MICROCHIP', v_l.veterinario_id,
        format('Lectura previa del microchip en %s (%s) asociada al caso.',
               v_l.establecimiento, public._fecha_local(v_l.leido_en)));
    end if;
    perform public._notificar(v_m.propietario_id,
      format('Leyeron el microchip de %s', v_m.nombre),
      format('El microchip de %s fue leído en %s el %s.', v_m.nombre, v_l.establecimiento,
             public._fecha_local(v_l.leido_en)),
      coalesce('/caso/' || v_caso::text, '/panel'));
  end loop;
end;
$$;

create or replace function public.mascotas_despues_guardar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso record;
begin
  if tg_op = 'UPDATE' then
    if (new.nombre, new.especie, new.raza, new.color_principal, new.tamano, new.sexo,
        new.temperamento, new.nota_manejo, new.microchip)
       is distinct from
       (old.nombre, old.especie, old.raza, old.color_principal, old.tamano, old.sexo,
        old.temperamento, old.nota_manejo, old.microchip) then
      for v_caso in select id from public.casos
                     where mascota_id = new.id and estado <> 'CERRADO' loop
        perform public._evento(v_caso.id, 'CAMBIO_DATOS', auth.uid(),
          format('El propietario actualizó los datos de %s.', new.nombre));
      end loop;
    end if;
  end if;

  if new.microchip is not null and (tg_op = 'INSERT' or new.microchip is distinct from old.microchip) then
    perform public._vincular_lecturas(new.id);
  end if;
  return null;
end;
$$;

create trigger mascotas_despues_guardar
  after insert or update on public.mascotas
  for each row execute function public.mascotas_despues_guardar();

-- ---------------------------------------------------------------------
-- Casos
-- ---------------------------------------------------------------------
create or replace function public.casos_antes_insertar()
returns trigger
language plpgsql
as $$
declare
  v_dist double precision;
  v_ang double precision;
  v_cliente boolean := current_user in ('anon', 'authenticated');
begin
  if new.ocurrido_en > now() + interval '5 minutes' then
    raise exception 'La fecha y hora no puede estar en el futuro.' using errcode = 'check_violation';
  end if;
  if new.ocurrido_en < now() - interval '1 year' then
    raise exception 'La fecha no puede ser de hace más de un año.' using errcode = 'check_violation';
  end if;

  if v_cliente then
    new.estado := 'ABIERTO';
    new.desenlace := null;
    new.creado_en := now();
    new.ultima_actividad_en := now();
  end if;

  -- Ubicación pública: desplazamiento aleatorio entre 100 y 300 m, calculado una sola vez
  if v_cliente or new.lat_publica is null or new.lng_publica is null then
    v_dist := 100 + 200 * sqrt(random());
    v_ang := 2 * pi() * random();
    new.lat_publica := new.lat + (v_dist * cos(v_ang)) / 111320.0;
    new.lng_publica := new.lng + (v_dist * sin(v_ang)) / (111320.0 * greatest(cos(radians(new.lat)), 0.01));
  end if;
  return new;
end;
$$;

create trigger casos_antes_insertar
  before insert on public.casos
  for each row execute function public.casos_antes_insertar();

-- SECURITY INVOKER a propósito: current_user distingue al cliente de las funciones internas.
create or replace function public.casos_antes_actualizar()
returns trigger
language plpgsql
as $$
declare
  v_cliente boolean := current_user in ('anon', 'authenticated');
begin
  -- Campos que nunca cambian (la ubicación pública no se recalcula)
  new.lat := old.lat;
  new.lng := old.lng;
  new.lat_publica := old.lat_publica;
  new.lng_publica := old.lng_publica;
  new.tipo := old.tipo;
  new.mascota_id := old.mascota_id;
  new.creador_id := old.creador_id;
  new.creado_en := old.creado_en;
  new.ocurrido_en := old.ocurrido_en;

  if v_cliente then
    if old.estado = 'CERRADO' then
      raise exception 'El caso está cerrado y ya no se puede modificar.';
    end if;
    if new.estado is distinct from old.estado and new.estado <> 'CERRADO' then
      raise exception 'Solo puedes cambiar el estado del caso cerrándolo con un desenlace.';
    end if;
  end if;

  if new.estado = 'CERRADO' and new.desenlace is null then
    raise exception 'Para cerrar el caso indica el desenlace: reencontrada, no reencontrada o fallecida.';
  end if;
  if new.estado <> 'CERRADO' then
    new.desenlace := null;
  end if;
  return new;
end;
$$;

create trigger casos_antes_actualizar
  before update on public.casos
  for each row execute function public.casos_antes_actualizar();

create or replace function public.casos_despues_insertar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  select nombre into v_nombre from public.mascotas where id = new.mascota_id;

  perform public._evento(new.id, 'CREACION', new.creador_id,
    case new.tipo
      when 'PERDIDA' then format('Se reportó la pérdida de %s.', coalesce(v_nombre, 'la mascota'))
      else format('Se abrió un caso de hallazgo%s.', coalesce(' de ' || v_nombre, ''))
    end);

  if new.tipo = 'PERDIDA' then
    perform public._vincular_lecturas(new.mascota_id);
  end if;
  return null;
end;
$$;

create trigger casos_despues_insertar
  after insert on public.casos
  for each row execute function public.casos_despues_insertar();

create or replace function public.casos_despues_actualizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etiquetas constant jsonb := '{"ABIERTO":"abierto","EN_VERIFICACION":"en verificación","RESUELTO":"resuelto","CERRADO":"cerrado","REENCONTRADA":"reencontrada","NO_REENCONTRADA":"no reencontrada","FALLECIDA":"fallecida"}';
begin
  if new.radio_km is distinct from old.radio_km then
    perform public._evento(new.id, 'RADIO_AMPLIADO', auth.uid(),
      format('Radio de búsqueda %s de %s km a %s km.',
             case when new.radio_km > old.radio_km then 'ampliado' else 'reducido' end,
             trim(to_char(old.radio_km, 'FM990.0')), trim(to_char(new.radio_km, 'FM990.0'))));
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'CERRADO' then
      perform public._evento(new.id, 'CIERRE', auth.uid(),
        format('Caso cerrado. Desenlace: %s.', v_etiquetas ->> new.desenlace::text));
    else
      perform public._evento(new.id, 'CAMBIO_ESTADO', auth.uid(),
        format('Estado del caso: %s → %s.', v_etiquetas ->> old.estado::text, v_etiquetas ->> new.estado::text));
    end if;
  end if;

  if (new.descripcion, new.direccion_texto) is distinct from (old.descripcion, old.direccion_texto) then
    perform public._evento(new.id, 'CAMBIO_DATOS', auth.uid(), 'Se actualizó la descripción o la zona del caso.');
  end if;
  return null;
end;
$$;

create trigger casos_despues_actualizar
  after update on public.casos
  for each row execute function public.casos_despues_actualizar();

-- Cambio de perfil sin perder la sesión.
-- Una misma persona puede encontrar un animal hoy y perder el suyo mañana: el
-- rol es una etiqueta de lo que viene a hacer, no un privilegio. Se permiten
-- los mismos tres que en el registro; ADMIN nunca se autoasigna.
create or replace function public.cambiar_rol(p_rol text)
returns public.rol_usuario
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol public.rol_usuario;
begin
  if auth.uid() is null then
    raise exception 'Necesitas una sesión para cambiar de perfil.';
  end if;

  v_rol := case upper(btrim(coalesce(p_rol, '')))
             when 'PROPIETARIO' then 'PROPIETARIO'::public.rol_usuario
             when 'VETERINARIO' then 'VETERINARIO'::public.rol_usuario
             when 'CIUDADANO'   then 'CIUDADANO'::public.rol_usuario
             else null
           end;
  if v_rol is null then
    raise exception 'Perfil no válido. El perfil de administrador no se puede elegir.';
  end if;
  if public.mi_rol() = 'ADMIN' then
    raise exception 'Un administrador no cambia su perfil desde la aplicación.';
  end if;

  update public.perfiles set rol = v_rol where id = auth.uid();
  return v_rol;
end;
$$;

-- Contacto de quien reportó un avistamiento, para el dueño del caso.
-- Va en un solo sentido: el dueño ve a quién llamar, pero su propio teléfono
-- NO se publica. Solo se entrega si ese reporte figura como coincidencia de un
-- caso suyo, así que nadie puede sondear reportes ajenos.
create or replace function public.contacto_reporte(p_reporte uuid)
returns table (nombre text, telefono text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.coincidencias co
      join public.casos c on c.id = co.caso_id
     where co.reporte_id = p_reporte and c.creador_id = auth.uid()) then
    raise exception 'Solo el dueño del caso puede ver el contacto de quien reportó.' using errcode = '42501';
  end if;
  return query
    select p.nombre, p.telefono
      from public.reportes r
      join public.perfiles p on p.id = r.autor_id
     where r.id = p_reporte;
end;
$$;

-- Contacto del dueño de un caso vivo: público, para que quien vea al animal
-- pueda llamar sin trámite previo. Se entrega caso por caso (la vista
-- casos_publicos no trae el teléfono) y deja de entregarse al cerrar el caso.
create or replace function public.contacto_caso(p_caso uuid)
returns table (nombre text, telefono text)
language sql
stable
security definer
set search_path = public
as $$
  select p.nombre, p.telefono
    from public.casos c
    join public.perfiles p on p.id = c.creador_id
   where c.id = p_caso
     and c.estado in ('ABIERTO', 'EN_VERIFICACION')
$$;

-- Ubicación exacta: solo para el creador del caso.
create or replace function public.ubicacion_exacta_caso(p_caso uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select c.lat, c.lng from public.casos c
   where c.id = p_caso and c.creador_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Reportes
-- ---------------------------------------------------------------------
create or replace function public.reportes_antes_guardar()
returns trigger
language plpgsql
as $$
begin
  if new.ocurrido_en > now() + interval '5 minutes' then
    raise exception 'La fecha y hora no puede estar en el futuro.' using errcode = 'check_violation';
  end if;
  if new.ocurrido_en < now() - interval '1 year' then
    raise exception 'La fecha no puede ser de hace más de un año.' using errcode = 'check_violation';
  end if;
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.creado_en := now();
    else
      new.creado_en := old.creado_en;
      new.autor_id := old.autor_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger reportes_antes_guardar
  before insert or update on public.reportes
  for each row execute function public.reportes_antes_guardar();

-- ---------------------------------------------------------------------
-- Eventos: inmutables
-- ---------------------------------------------------------------------
create or replace function public.eventos_inmutables()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El historial del caso es inmutable: los eventos no se pueden modificar ni borrar.'
    using errcode = '42501';
end;
$$;

create trigger eventos_sin_update_delete
  before update or delete on public.eventos
  for each row execute function public.eventos_inmutables();

create trigger eventos_sin_truncate
  before truncate on public.eventos
  for each statement execute function public.eventos_inmutables();

create or replace function public.eventos_antes_insertar()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.creado_en := now();
  end if;
  return new;
end;
$$;

create trigger eventos_antes_insertar
  before insert on public.eventos
  for each row execute function public.eventos_antes_insertar();

create or replace function public.eventos_actualizar_actividad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.casos set ultima_actividad_en = new.creado_en
   where id = new.caso_id and ultima_actividad_en < new.creado_en;
  return null;
end;
$$;

create trigger eventos_actualizar_actividad
  after insert on public.eventos
  for each row execute function public.eventos_actualizar_actividad();

-- ---------------------------------------------------------------------
-- Lecturas de microchip (HU-01)
-- ---------------------------------------------------------------------
create or replace function public.lecturas_antes_insertar()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.leido_en := now();   -- no editable por el cliente, nunca futura
    new.creado_en := now();
    new.anulada := false;
    new.motivo_anulacion := null;
    new.anulada_en := null;
  end if;
  if new.leido_en > now() + interval '1 minute' then
    raise exception 'La fecha de lectura no puede estar en el futuro.';
  end if;
  return new;
end;
$$;

create trigger lecturas_antes_insertar
  before insert on public.lecturas_microchip
  for each row execute function public.lecturas_antes_insertar();

create or replace function public.lecturas_proteger()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las lecturas de microchip no se pueden borrar; anúlalas con una justificación.'
      using errcode = '42501';
  end if;
  if (new.codigo, new.veterinario_id, new.lat, new.lng, new.establecimiento, new.leido_por,
      new.leido_en, new.creado_en)
     is distinct from
     (old.codigo, old.veterinario_id, old.lat, old.lng, old.establecimiento, old.leido_por,
      old.leido_en, old.creado_en) then
    raise exception 'Las lecturas de microchip son inmutables.' using errcode = '42501';
  end if;
  if old.anulada and (new.anulada is distinct from old.anulada
                      or new.motivo_anulacion is distinct from old.motivo_anulacion) then
    raise exception 'La lectura ya fue anulada.';
  end if;
  if old.caso_id is not null and new.caso_id is distinct from old.caso_id then
    raise exception 'La lectura ya está asociada a un caso.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger lecturas_proteger
  before update or delete on public.lecturas_microchip
  for each row execute function public.lecturas_proteger();

-- Consulta previa: resuelve el microchip ANTES de guardar nada, para que el
-- auxiliar vea qué está registrando. Solo lee de mascotas, que ya es de lectura
-- pública, así que no expone ningún dato nuevo.
create or replace function public.consultar_microchip(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m record;
  v_caso record;
  v_codigo text := btrim(coalesce(p_codigo, ''));
begin
  if public.mi_rol() is distinct from 'VETERINARIO' then
    raise exception 'Solo el personal veterinario puede consultar microchips.' using errcode = '42501';
  end if;
  if v_codigo !~ '^[0-9]{15}$' then
    raise exception 'El microchip debe tener 15 dígitos numéricos.';
  end if;

  select m.id, m.nombre, m.especie, m.raza, m.color_principal, m.tamano, m.sexo,
         m.temperamento, m.nota_manejo,
         (select f.url from public.fotos_mascota f
           where f.mascota_id = m.id
           order by f.es_principal desc, f.orden asc limit 1) as foto_url
    into v_m
    from public.mascotas m
   where m.microchip = v_codigo;

  if not found then
    return jsonb_build_object('codigo', v_codigo, 'registrada', false, 'creara_caso', false);
  end if;

  select c.id, c.tipo, c.estado into v_caso
    from public.casos c
   where c.mascota_id = v_m.id and c.estado in ('ABIERTO', 'EN_VERIFICACION')
   order by (c.tipo = 'PERDIDA') desc, c.creado_en desc
   limit 1;

  return jsonb_build_object(
    'codigo',          v_codigo,
    'registrada',      true,
    'mascota_id',      v_m.id,
    'mascota_nombre',  v_m.nombre,
    'especie',         v_m.especie,
    'raza',            v_m.raza,
    'color_principal', v_m.color_principal,
    'tamano',          v_m.tamano,
    'sexo',            v_m.sexo,
    'temperamento',    v_m.temperamento,
    'nota_manejo',     v_m.nota_manejo,
    'foto_url',        v_m.foto_url,
    'caso_id',         v_caso.id,
    'caso_tipo',       v_caso.tipo,
    'caso_estado',     v_caso.estado,
    'creara_caso',     v_caso.id is null);
end;
$$;

-- La firma cambió (ubicación opcional + leido_por): se elimina la anterior para
-- no dejar una sobrecarga colgando si se vuelve a ejecutar este archivo.
drop function if exists public.registrar_lectura(text, double precision, double precision, text);

create or replace function public.registrar_lectura(
  p_codigo text,
  p_establecimiento text,
  p_leido_por text,
  p_lat double precision default null,
  p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m record;
  v_caso uuid;
  v_caso_creado boolean := false;
  v_lectura uuid;
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_lugar text := btrim(coalesce(p_establecimiento, ''));
  v_quien text := btrim(coalesce(p_leido_por, ''));
begin
  if public.mi_rol() is distinct from 'VETERINARIO' then
    raise exception 'Solo el personal veterinario puede registrar lecturas de microchip.'
      using errcode = '42501';
  end if;
  if v_codigo !~ '^[0-9]{15}$' then
    raise exception 'El microchip debe tener 15 dígitos numéricos.';
  end if;
  if char_length(v_lugar) < 2 then
    raise exception 'Indica el nombre de la veterinaria donde se hizo la lectura.';
  end if;
  if char_length(v_quien) < 2 then
    raise exception 'Indica quién hizo la lectura.';
  end if;

  select m.id, m.nombre, m.propietario_id into v_m from public.mascotas m where m.microchip = v_codigo;

  if found then
    select c.id into v_caso from public.casos c
     where c.mascota_id = v_m.id and c.estado in ('ABIERTO', 'EN_VERIFICACION')
     order by (c.tipo = 'PERDIDA') desc, c.creado_en desc
     limit 1;

    -- Única rama que necesita coordenadas: abrir el caso de hallazgo.
    if v_caso is null then
      if p_lat is null or p_lng is null then
        raise exception 'Esta mascota no tiene un caso abierto. Marca en el mapa dónde apareció para abrir el caso de hallazgo.';
      end if;
      insert into public.casos (mascota_id, creador_id, tipo, lat, lng, direccion_texto, ocurrido_en, descripcion)
      values (v_m.id, v_uid, 'HALLAZGO', p_lat, p_lng, v_lugar, now(),
              format('Caso abierto automáticamente por lectura de microchip en %s.', v_lugar))
      returning id into v_caso;
      v_caso_creado := true;
    end if;
  end if;

  insert into public.lecturas_microchip
    (veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento, leido_por)
  values (v_uid, v_codigo, v_m.id, v_caso, p_lat, p_lng, v_lugar, v_quien)
  returning id into v_lectura;

  if v_caso is not null then
    perform public._evento(v_caso, 'LECTURA_MICROCHIP', v_uid,
      format('Lectura del microchip %s en %s, por %s.',
             public._enmascarar_chip(v_codigo), v_lugar, v_quien));
    perform public._notificar(v_m.propietario_id,
      format('Leyeron el microchip de %s', v_m.nombre),
      format('El microchip de %s fue leído en %s el %s. Revisa el caso para coordinar.',
             v_m.nombre, v_lugar, public._fecha_local(now())),
      '/caso/' || v_caso::text);
  end if;

  return jsonb_build_object(
    'lectura_id', v_lectura,
    'registrada', v_m.id is not null,
    'mascota_nombre', v_m.nombre,
    'caso_id', v_caso,
    'caso_creado', v_caso_creado);
end;
$$;

create or replace function public.anular_lectura(p_lectura uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l record;
begin
  select * into v_l from public.lecturas_microchip where id = p_lectura for update;
  if not found then
    raise exception 'La lectura no existe.';
  end if;
  if v_l.veterinario_id <> auth.uid() and public.mi_rol() is distinct from 'ADMIN' then
    raise exception 'Solo quien registró la lectura puede anularla.' using errcode = '42501';
  end if;
  if v_l.anulada then
    raise exception 'La lectura ya fue anulada.';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'La justificación de la anulación debe tener al menos 10 caracteres.';
  end if;

  update public.lecturas_microchip
     set anulada = true, motivo_anulacion = btrim(p_motivo), anulada_en = now()
   where id = p_lectura;

  if v_l.caso_id is not null then
    perform public._evento(v_l.caso_id, 'LECTURA_ANULADA', auth.uid(),
      format('Lectura de microchip del %s anulada. Motivo: %s', public._fecha_local(v_l.leido_en), btrim(p_motivo)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Coincidencias (HU-02 y motor)
-- ---------------------------------------------------------------------
-- El motor corre en el cliente (src/lib/matching.ts); esta función valida y persiste.
-- Las coincidencias existentes (incluidas las DESCARTADAS) nunca se sobrescriben.
create or replace function public.guardar_coincidencias(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_it record;
  v_caso record;
  v_rep record;
  v_id uuid;
  v_n int := 0;
  v_etiquetas constant jsonb := '{"SIGUE_EN_LUGAR":"avistamiento","SE_FUE":"avistamiento","LO_RECOGI":"hallazgo","REQUIERE_ATENCION":"hallazgo (requiere atención)"}';
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  for v_it in
    select * from jsonb_to_recordset(p_items)
      as x(caso_id uuid, reporte_id uuid, puntaje int, motivos jsonb, retroactiva boolean)
  loop
    select c.id, c.creador_id, m.especie, m.nombre, m.propietario_id into v_caso
      from public.casos c join public.mascotas m on m.id = c.mascota_id
     where c.id = v_it.caso_id and c.tipo = 'PERDIDA' and c.estado in ('ABIERTO', 'EN_VERIFICACION');
    continue when not found;

    select r.id, r.autor_id, r.especie, r.estado_animal into v_rep
      from public.reportes r where r.id = v_it.reporte_id;
    continue when not found;

    if auth.uid() is distinct from v_caso.creador_id and auth.uid() is distinct from v_rep.autor_id then
      raise exception 'No puedes registrar coincidencias de casos o reportes ajenos.' using errcode = '42501';
    end if;
    continue when v_rep.especie <> v_caso.especie;
    continue when v_it.puntaje is null or v_it.puntaje < 35 or v_it.puntaje > 100;

    v_id := null;
    insert into public.coincidencias (caso_id, reporte_id, puntaje, motivos, retroactiva)
    values (v_it.caso_id, v_it.reporte_id, v_it.puntaje,
            coalesce(v_it.motivos, '[]'::jsonb), coalesce(v_it.retroactiva, false))
    on conflict (caso_id, reporte_id) do nothing
    returning id into v_id;

    if v_id is not null then
      v_n := v_n + 1;
      perform public._evento(v_caso.id, 'COINCIDENCIA_SUGERIDA', auth.uid(),
        format('Posible coincidencia con un reporte de %s (puntaje %s/100)%s.',
               v_etiquetas ->> v_rep.estado_animal::text, v_it.puntaje,
               case when coalesce(v_it.retroactiva, false) then ', publicado antes del caso' else '' end));
      perform public._notificar(v_caso.creador_id,
        format('Posible coincidencia para %s', v_caso.nombre),
        format('Encontramos un reporte con puntaje %s/100. Revísalo y decide si es tu mascota.', v_it.puntaje),
        '/caso/' || v_caso.id::text || '#coincidencias');
    end if;
  end loop;
  return v_n;
end;
$$;

-- Validación de transiciones (SECURITY INVOKER para distinguir al cliente).
create or replace function public.coincidencias_antes_actualizar()
returns trigger
language plpgsql
as $$
begin
  if new.estado is distinct from old.estado then
    if current_user in ('anon', 'authenticated') then
      if new.estado = 'SUGERIDA' then
        raise exception 'Una coincidencia no puede volver al estado "sugerida".';
      end if;
      if old.estado in ('CONFIRMADA', 'DESCARTADA') then
        raise exception 'Esta coincidencia ya fue decidida y no puede cambiarse.';
      end if;
    end if;
    new.decidida_en := now();
  end if;
  return new;
end;
$$;

create trigger coincidencias_antes_actualizar
  before update on public.coincidencias
  for each row execute function public.coincidencias_antes_actualizar();

-- Crea (o devuelve) la verificación pendiente de un caso para un reclamante.
create or replace function public._crear_verificacion(
  p_caso uuid, p_reclamante uuid, p_verificador uuid, p_coincidencia uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_mascota uuid;
  v_tiene_reservados boolean;
begin
  if exists (select 1 from public.verificaciones
              where caso_id = p_caso and reclamante_id = p_reclamante and estado = 'BLOQUEADA') then
    raise exception 'La verificación de este reclamante está bloqueada tras 3 intentos fallidos.'
      using errcode = '42501';
  end if;

  select id into v_id from public.verificaciones
   where caso_id = p_caso and reclamante_id = p_reclamante and estado = 'PENDIENTE';
  if found then
    return v_id;
  end if;

  select mascota_id into v_mascota from public.casos where id = p_caso;
  -- Sin datos reservados no se aborta: las preguntas las creará quien encontró al animal.
  v_tiene_reservados := v_mascota is not null
    and (select count(*) from public.datos_reservados where mascota_id = v_mascota) >= 3;

  insert into public.verificaciones (caso_id, reclamante_id, verificador_id, coincidencia_id)
  values (p_caso, p_reclamante, p_verificador, p_coincidencia)
  returning id into v_id;

  update public.casos set estado = 'EN_VERIFICACION' where id = p_caso and estado = 'ABIERTO';

  perform public._evento(p_caso, 'VERIFICACION_INICIADA', coalesce(auth.uid(), p_verificador),
    'Se inició la verificación de propiedad antes de la entrega.');

  if v_tiene_reservados then
    perform public._notificar(p_reclamante, 'Verificación de propiedad iniciada',
      'Responde las preguntas de seguridad sobre tu mascota para continuar con la entrega.',
      '/verificacion/' || v_id::text);
    perform public._notificar(p_verificador, 'Verificación de propiedad iniciada',
      'Cuando el reclamante responda, revisa sus respuestas y decide si apruebas la entrega.',
      '/verificacion/' || v_id::text);
  else
    perform public._notificar(p_verificador, 'Crea las preguntas de verificación',
      'Esta mascota no tiene datos reservados. Mira al animal y escribe 3 preguntas que solo su dueño sabría responder.',
      '/verificacion/' || v_id::text);
    perform public._notificar(p_reclamante, 'Verificación de propiedad iniciada',
      'Quien encontró al animal está preparando las preguntas. Te avisamos en cuanto estén listas.',
      '/verificacion/' || v_id::text);
  end if;
  return v_id;
end;
$$;

-- Quien encontró al animal crea las preguntas cuando la mascota no tiene datos reservados.
create or replace function public.crear_preguntas_verificacion(p_verificacion uuid, p_preguntas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_mascota uuid;
  v_item jsonb;
  v_orden int := 0;
begin
  select * into v from public.verificaciones where id = p_verificacion for update;
  if not found then
    raise exception 'La verificación no existe.';
  end if;
  if v.verificador_id is distinct from auth.uid() then
    raise exception 'Solo quien encontró al animal puede crear las preguntas.' using errcode = '42501';
  end if;
  if v.estado <> 'PENDIENTE' then
    raise exception 'Esta verificación ya fue resuelta.';
  end if;
  if v.intentos > 0 then
    raise exception 'El reclamante ya respondió: las preguntas no se pueden cambiar.';
  end if;
  if exists (select 1 from public.preguntas_verif where verificacion_id = p_verificacion) then
    raise exception 'Las preguntas de esta verificación ya fueron creadas.';
  end if;

  select mascota_id into v_mascota from public.casos where id = v.caso_id;
  if v_mascota is not null
     and (select count(*) from public.datos_reservados where mascota_id = v_mascota) >= 3 then
    raise exception 'Esta mascota ya tiene los datos reservados de su dueño: no hace falta crear preguntas.';
  end if;

  if jsonb_typeof(p_preguntas) <> 'array' or jsonb_array_length(p_preguntas) < 3 then
    raise exception 'Debes crear al menos 3 preguntas con su respuesta.' using errcode = 'check_violation';
  end if;
  if (select count(distinct public.normalizar_texto(x ->> 'pregunta'))
        from jsonb_array_elements(p_preguntas) x) < jsonb_array_length(p_preguntas) then
    raise exception 'Las preguntas no pueden repetirse.';
  end if;

  for v_item in select * from jsonb_array_elements(p_preguntas) loop
    insert into public.preguntas_verif (verificacion_id, pregunta, respuesta, orden)
    values (p_verificacion, v_item ->> 'pregunta', v_item ->> 'respuesta', v_orden);
    v_orden := v_orden + 1;
  end loop;

  perform public._evento(v.caso_id, 'VERIFICACION_INICIADA', auth.uid(),
    format('Quien encontró al animal creó %s preguntas de seguridad.', v_orden));
  perform public._notificar(v.reclamante_id, 'Preguntas listas para responder',
    'Quien encontró al animal ya preparó las preguntas. Respóndelas para continuar con la entrega.',
    '/verificacion/' || p_verificacion::text);
  return v_orden;
end;
$$;

create or replace function public.coincidencias_despues_actualizar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso record;
  v_autor uuid;
  v_tipo text;
  v_desc text;
begin
  if new.estado is not distinct from old.estado then
    return null;
  end if;

  select c.id, c.creador_id, m.nombre into v_caso
    from public.casos c join public.mascotas m on m.id = c.mascota_id where c.id = new.caso_id;
  select autor_id into v_autor from public.reportes where id = new.reporte_id;

  v_tipo := case new.estado
              when 'CONFIRMADA' then 'COINCIDENCIA_CONFIRMADA'
              when 'DESCARTADA' then 'COINCIDENCIA_DESCARTADA'
              else 'COINCIDENCIA_NO_SEGURO' end;
  v_desc := case new.estado
              when 'CONFIRMADA' then format('El propietario confirmó que el reporte corresponde a %s (puntaje %s/100).', v_caso.nombre, new.puntaje)
              when 'DESCARTADA' then format('El propietario descartó un reporte (puntaje %s/100). No volverá a sugerirse.', new.puntaje)
              else format('El propietario no está seguro de un reporte (puntaje %s/100).', new.puntaje) end;

  perform public._evento(new.caso_id, v_tipo, auth.uid(), v_desc);

  if v_autor is not null and v_autor <> v_caso.creador_id then
    perform public._notificar(v_autor,
      case new.estado
        when 'CONFIRMADA' then 'El dueño reconoció al animal que reportaste'
        when 'DESCARTADA' then 'El dueño revisó tu reporte'
        else 'El dueño revisó tu reporte' end,
      case new.estado
        when 'CONFIRMADA' then 'El propietario confirmó la coincidencia. Antes de entregar, verifica que sea el dueño.'
        when 'DESCARTADA' then format('El propietario de %s indicó que no es su mascota. ¡Gracias por reportar!', v_caso.nombre)
        else format('El propietario de %s aún no está seguro. Podría contactarte más adelante.', v_caso.nombre) end,
      '/caso/' || new.caso_id::text);
  end if;

  if new.estado = 'CONFIRMADA' then
    perform public._notificar(v_caso.creador_id, 'Coincidencia confirmada',
      format('Confirmaste una coincidencia para %s. Se inicia la verificación de propiedad.', v_caso.nombre),
      '/caso/' || new.caso_id::text);
    if v_autor is not null and v_autor <> v_caso.creador_id then
      perform public._crear_verificacion(new.caso_id, v_caso.creador_id, v_autor, new.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger coincidencias_despues_actualizar
  after update on public.coincidencias
  for each row execute function public.coincidencias_despues_actualizar();

-- ---------------------------------------------------------------------
-- Verificación de propiedad (HU-03)
-- ---------------------------------------------------------------------

-- Quien encontró al animal inicia la verificación desde la ficha.
create or replace function public.iniciar_verificacion(p_caso uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_coinc uuid;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para iniciar una verificación.';
  end if;

  select c.id, c.tipo, c.estado, c.creador_id, m.propietario_id into v_c
    from public.casos c join public.mascotas m on m.id = c.mascota_id
   where c.id = p_caso;
  if not found then
    raise exception 'El caso no existe o no tiene una mascota registrada asociada.';
  end if;
  if v_c.estado in ('RESUELTO', 'CERRADO') then
    raise exception 'El caso ya está resuelto o cerrado.';
  end if;
  if v_c.propietario_id = v_uid then
    raise exception 'Eres el propietario: la verificación la inicia quien encontró al animal.';
  end if;

  select co.id into v_coinc
    from public.coincidencias co join public.reportes r on r.id = co.reporte_id
   where co.caso_id = p_caso and co.estado = 'CONFIRMADA' and r.autor_id = v_uid
   limit 1;

  if v_coinc is null
     and not (v_c.tipo = 'HALLAZGO' and v_c.creador_id = v_uid)
     and not exists (select 1 from public.lecturas_microchip l
                      where l.caso_id = p_caso and l.veterinario_id = v_uid and not l.anulada) then
    raise exception 'Solo quien encontró al animal (reporte confirmado o lectura de microchip) puede iniciar la verificación.'
      using errcode = '42501';
  end if;

  return public._crear_verificacion(p_caso, v_c.propietario_id, v_uid, v_coinc);
end;
$$;

-- Preguntas (nunca respuestas) para los participantes, de cualquiera de los dos orígenes.
create or replace function public.preguntas_verificacion(p_verificacion uuid)
returns table (id uuid, pregunta text, origen text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.verificaciones v
                  where v.id = p_verificacion and auth.uid() in (v.reclamante_id, v.verificador_id)) then
    raise exception 'Solo los participantes de la verificación pueden ver las preguntas.' using errcode = '42501';
  end if;
  return query
    with fuentes as (
      select d.id, d.pregunta, 'MASCOTA'::text as origen, 0 as orden
        from public.verificaciones v
        join public.casos c on c.id = v.caso_id
        join public.datos_reservados d on d.mascota_id = c.mascota_id
       where v.id = p_verificacion
      union all
      select q.id, q.pregunta, 'VERIFICADOR'::text, q.orden::int
        from public.preguntas_verif q
       where q.verificacion_id = p_verificacion
    )
    select f.id, f.pregunta, f.origen from fuentes f order by f.origen, f.orden, f.id;
end;
$$;

-- Compara las respuestas contra datos_reservados sin exponerlos.
--   p_respuestas: {"<dato_reservado_id>": "respuesta", ...}
create or replace function public.verificar_respuestas(p_verificacion uuid, p_respuestas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_c record;
  v_d record;
  v_intento int;
  v_total int := 0;
  v_aciertos int := 0;
  v_dada text;
  v_ok boolean;
  v_superada boolean;
  v_estado public.estado_verificacion;
begin
  select * into v from public.verificaciones where id = p_verificacion for update;
  if not found then
    raise exception 'La verificación no existe.';
  end if;
  if v.reclamante_id is distinct from auth.uid() then
    raise exception 'Solo el reclamante puede responder esta verificación.' using errcode = '42501';
  end if;
  if v.estado = 'BLOQUEADA' then
    raise exception 'Verificación bloqueada tras 3 intentos fallidos. No se permiten nuevos intentos.';
  end if;
  if v.estado <> 'PENDIENTE' then
    raise exception 'Esta verificación ya fue resuelta.';
  end if;
  if v.superada then
    raise exception 'Ya respondiste correctamente. Espera la decisión de quien encontró al animal.';
  end if;

  select c.id, c.mascota_id, m.nombre, m.propietario_id into v_c
    from public.casos c left join public.mascotas m on m.id = c.mascota_id where c.id = v.caso_id;

  if not exists (
    select 1 from public.datos_reservados d where d.mascota_id = v_c.mascota_id
    union all
    select 1 from public.preguntas_verif q where q.verificacion_id = p_verificacion) then
    raise exception 'Todavía no hay preguntas: quien encontró al animal debe crearlas primero.';
  end if;

  -- Todas las preguntas deben tener respuesta antes de contar como intento
  for v_d in
    select d.id from public.datos_reservados d where d.mascota_id = v_c.mascota_id
    union all
    select q.id from public.preguntas_verif q where q.verificacion_id = p_verificacion
  loop
    if public.normalizar_texto(p_respuestas ->> v_d.id::text) = '' then
      raise exception 'Responde todas las preguntas antes de enviar.';
    end if;
  end loop;

  v_intento := v.intentos + 1;
  for v_d in
    select d.id, d.respuesta, 'MASCOTA'::text as origen
      from public.datos_reservados d where d.mascota_id = v_c.mascota_id
    union all
    select q.id, q.respuesta, 'VERIFICADOR'::text
      from public.preguntas_verif q where q.verificacion_id = p_verificacion
  loop
    v_dada := left(btrim(p_respuestas ->> v_d.id::text), 200);
    v_ok := public.normalizar_texto(v_dada) = v_d.respuesta;
    insert into public.respuestas_verif
      (verificacion_id, dato_reservado_id, pregunta_verif_id, intento, respuesta_dada, coincide_auto)
    values (p_verificacion,
            case when v_d.origen = 'MASCOTA' then v_d.id end,
            case when v_d.origen = 'VERIFICADOR' then v_d.id end,
            v_intento, v_dada, v_ok);
    v_total := v_total + 1;
    if v_ok then
      v_aciertos := v_aciertos + 1;
    end if;
  end loop;

  v_superada := v_aciertos >= greatest(2, ceil(v_total * 2.0 / 3.0)::int);
  v_estado := case when not v_superada and v_intento >= 3 then 'BLOQUEADA' else 'PENDIENTE' end;

  update public.verificaciones
     set intentos = v_intento,
         superada = v_superada,
         estado = v_estado,
         resuelta_en = case when v_estado = 'BLOQUEADA' then now() else null end
   where id = p_verificacion;

  if v_superada then
    perform public._evento(v.caso_id, 'VERIFICACION_INTENTO', auth.uid(),
      format('El reclamante respondió las preguntas de seguridad (intento %s de 3). Pendiente de revisión.', v_intento));
    perform public._notificar(v.verificador_id, 'Respuestas listas para revisar',
      'El reclamante respondió las preguntas de seguridad. Revisa y decide la entrega.',
      '/verificacion/' || p_verificacion::text);
  elsif v_estado = 'BLOQUEADA' then
    perform public._evento(v.caso_id, 'VERIFICACION_BLOQUEADA', auth.uid(),
      'Verificación bloqueada tras 3 intentos fallidos del mismo reclamante.');
    if v_c.propietario_id is not null then
      perform public._notificar(v_c.propietario_id, 'Verificación bloqueada',
        format('Se bloqueó una verificación sobre %s tras 3 intentos fallidos. Si no fuiste tú, revisa tu cuenta.',
               coalesce(v_c.nombre, 'la mascota')),
        '/verificacion/' || p_verificacion::text);
    end if;
    if v.verificador_id is distinct from v_c.propietario_id then
      perform public._notificar(v.verificador_id, 'Verificación bloqueada',
        'El reclamante falló 3 intentos. No entregues al animal a esta persona.',
        '/verificacion/' || p_verificacion::text);
    end if;
    update public.casos set estado = 'ABIERTO'
     where id = v.caso_id and estado = 'EN_VERIFICACION'
       and not exists (select 1 from public.verificaciones x where x.caso_id = v.caso_id and x.estado = 'PENDIENTE');
  else
    perform public._evento(v.caso_id, 'VERIFICACION_INTENTO', auth.uid(),
      format('Intento de verificación fallido (%s de 3).', v_intento));
  end if;

  return jsonb_build_object(
    'aciertos', v_aciertos, 'total', v_total, 'intentos', v_intento,
    'superada', v_superada, 'estado', v_estado);
end;
$$;

-- Quien encontró al animal marca cada respuesta y aprueba o rechaza la entrega.
--   p_marcas: {"<respuesta_verif_id>": true|false, ...}
create or replace function public.resolver_verificacion(p_verificacion uuid, p_marcas jsonb, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_c record;
  v_correctas int;
begin
  select * into v from public.verificaciones where id = p_verificacion for update;
  if not found then
    raise exception 'La verificación no existe.';
  end if;
  if v.verificador_id is distinct from auth.uid() then
    raise exception 'Solo quien encontró al animal puede aprobar o rechazar la entrega.' using errcode = '42501';
  end if;
  if v.estado <> 'PENDIENTE' then
    raise exception 'Esta verificación ya fue resuelta.';
  end if;
  if v.intentos = 0 then
    raise exception 'El reclamante aún no ha respondido las preguntas.';
  end if;

  update public.respuestas_verif r
     set correcta = (p_marcas ->> r.id::text)::boolean
   where r.verificacion_id = p_verificacion and r.intento = v.intentos and p_marcas ? r.id::text;

  if exists (select 1 from public.respuestas_verif r
              where r.verificacion_id = p_verificacion and r.intento = v.intentos and r.correcta is null) then
    raise exception 'Marca cada respuesta como correcta o incorrecta antes de decidir.';
  end if;

  select count(*) into v_correctas from public.respuestas_verif r
   where r.verificacion_id = p_verificacion and r.intento = v.intentos and r.correcta;

  if p_aprobar and v_correctas < 2 then
    raise exception 'Para aprobar la entrega deben estar marcadas como correctas al menos 2 respuestas.';
  end if;

  update public.verificaciones
     set estado = case when p_aprobar then 'APROBADA'::public.estado_verificacion
                       else 'RECHAZADA'::public.estado_verificacion end,
         resuelta_en = now()
   where id = p_verificacion;

  select c.id, c.creador_id, m.nombre, m.propietario_id into v_c
    from public.casos c join public.mascotas m on m.id = c.mascota_id where c.id = v.caso_id;

  if p_aprobar then
    update public.casos set estado = 'RESUELTO' where id = v.caso_id and estado in ('ABIERTO', 'EN_VERIFICACION');
    perform public._evento(v.caso_id, 'VERIFICACION_APROBADA', auth.uid(),
      format('Entrega aprobada: %s de %s respuestas marcadas como correctas.', v_correctas,
             (select count(*) from public.respuestas_verif r where r.verificacion_id = p_verificacion and r.intento = v.intentos)));
    perform public._notificar(v.reclamante_id, 'Verificación aprobada',
      format('Quien encontró a %s aprobó la entrega. Coordinen en un lugar público o una veterinaria.', v_c.nombre),
      '/verificacion/' || p_verificacion::text);
  else
    update public.casos set estado = 'ABIERTO'
     where id = v.caso_id and estado = 'EN_VERIFICACION'
       and not exists (select 1 from public.verificaciones x where x.caso_id = v.caso_id and x.estado = 'PENDIENTE');
    perform public._evento(v.caso_id, 'VERIFICACION_RECHAZADA', auth.uid(),
      'Quien encontró al animal rechazó la entrega tras revisar las respuestas.');
    perform public._notificar(v.reclamante_id, 'Verificación rechazada',
      format('Quien encontró a %s rechazó la entrega tras revisar tus respuestas.', v_c.nombre),
      '/verificacion/' || p_verificacion::text);
  end if;

  if v_c.propietario_id <> v.reclamante_id then
    perform public._notificar(v_c.propietario_id,
      case when p_aprobar then 'Verificación aprobada' else 'Verificación rechazada' end,
      format('Se resolvió una verificación sobre %s.', v_c.nombre),
      '/verificacion/' || p_verificacion::text);
  end if;
end;
$$;

-- Contacto entre las partes, solo una vez superadas las preguntas o aprobada la entrega.
create or replace function public.contactos_verificacion(p_verificacion uuid)
returns table (papel text, nombre text, telefono text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.verificaciones where id = p_verificacion;
  if not found or auth.uid() not in (v.reclamante_id, v.verificador_id) then
    raise exception 'Solo los participantes de la verificación pueden ver los contactos.' using errcode = '42501';
  end if;
  -- Solo con la entrega ya aprobada: superar las preguntas no basta.
  if v.estado <> 'APROBADA' then
    return;
  end if;
  return query
    select 'Reclamante'::text, p.nombre, p.telefono from public.perfiles p where p.id = v.reclamante_id
    union all
    select 'Quien encontró'::text, p.nombre, p.telefono from public.perfiles p where p.id = v.verificador_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function public._notificar(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public._evento(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public._vincular_lecturas(uuid) from public, anon, authenticated;
revoke execute on function public._crear_verificacion(uuid, uuid, uuid, uuid) from public, anon, authenticated;

revoke execute on function public.guardar_mascota(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.consultar_microchip(text) from public, anon;
revoke execute on function public.registrar_lectura(text, text, text, double precision, double precision) from public, anon;
revoke execute on function public.anular_lectura(uuid, text) from public, anon;
revoke execute on function public.guardar_coincidencias(jsonb) from public, anon;
revoke execute on function public.iniciar_verificacion(uuid) from public, anon;
revoke execute on function public.preguntas_verificacion(uuid) from public, anon;
revoke execute on function public.crear_preguntas_verificacion(uuid, jsonb) from public, anon;
revoke execute on function public.verificar_respuestas(uuid, jsonb) from public, anon;
revoke execute on function public.resolver_verificacion(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.contactos_verificacion(uuid) from public, anon;
revoke execute on function public.ubicacion_exacta_caso(uuid) from public, anon;
revoke execute on function public.cambiar_rol(text) from public, anon;
revoke execute on function public.contacto_reporte(uuid) from public, anon;
revoke execute on function public.contacto_caso(uuid) from public;

grant execute on function public.guardar_mascota(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.consultar_microchip(text) to authenticated;
grant execute on function public.registrar_lectura(text, text, text, double precision, double precision) to authenticated;
grant execute on function public.anular_lectura(uuid, text) to authenticated;
grant execute on function public.guardar_coincidencias(jsonb) to authenticated;
grant execute on function public.iniciar_verificacion(uuid) to authenticated;
grant execute on function public.preguntas_verificacion(uuid) to authenticated;
grant execute on function public.crear_preguntas_verificacion(uuid, jsonb) to authenticated;
grant execute on function public.verificar_respuestas(uuid, jsonb) to authenticated;
grant execute on function public.resolver_verificacion(uuid, jsonb, boolean) to authenticated;
grant execute on function public.contactos_verificacion(uuid) to authenticated;
grant execute on function public.ubicacion_exacta_caso(uuid) to authenticated;
grant execute on function public.cambiar_rol(text) to authenticated;
grant execute on function public.contacto_reporte(uuid) to authenticated;
-- Público a propósito: quien ve al animal llama al dueño sin trámite previo.
grant execute on function public.contacto_caso(uuid) to anon, authenticated;
grant execute on function public.distancia_km(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.normalizar_texto(text) to anon, authenticated;
