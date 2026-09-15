-- >>>>>>>>>> schema.sql <<<<<<<<<<
-- =====================================================================
-- ChipPet · Mascotas perdidas
-- 1/4  schema.sql — tipos, tablas, restricciones, índices y vistas
-- Ejecutar en el editor SQL de Supabase ANTES que funciones.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
create type public.rol_usuario        as enum ('PROPIETARIO', 'CIUDADANO', 'VETERINARIO', 'ADMIN');
create type public.especie_animal     as enum ('PERRO', 'GATO', 'OTRO');
create type public.tamano_animal      as enum ('PEQUENO', 'MEDIANO', 'GRANDE');
create type public.sexo_animal        as enum ('MACHO', 'HEMBRA', 'DESCONOCIDO');
create type public.temperamento_animal as enum ('TRANQUILA', 'SOCIABLE', 'NERVIOSA', 'HURANA', 'PUEDE_MORDER');
create type public.tipo_caso          as enum ('PERDIDA', 'HALLAZGO');
create type public.estado_caso        as enum ('ABIERTO', 'EN_VERIFICACION', 'RESUELTO', 'CERRADO');
create type public.desenlace_caso     as enum ('REENCONTRADA', 'NO_REENCONTRADA', 'FALLECIDA');
create type public.estado_animal      as enum ('SIGUE_EN_LUGAR', 'SE_FUE', 'LO_RECOGI', 'REQUIERE_ATENCION');
create type public.estado_coincidencia as enum ('SUGERIDA', 'CONFIRMADA', 'DESCARTADA', 'NO_SEGURO');
create type public.estado_verificacion as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'BLOQUEADA');

-- ---------------------------------------------------------------------
-- perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nombre       text not null check (char_length(btrim(nombre)) between 2 and 80),
  telefono     text not null check (telefono ~ '^\+?[0-9 ]{7,15}$'),
  rol          public.rol_usuario not null default 'CIUDADANO',
  zona_lat     double precision check (zona_lat between -90 and 90),
  zona_lng     double precision check (zona_lng between -180 and 180),
  radio_km     double precision not null default 5 check (radio_km > 0 and radio_km <= 100),
  acepto_datos boolean not null check (acepto_datos),
  creado_en    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- mascotas
-- ---------------------------------------------------------------------
create table public.mascotas (
  id              uuid primary key default gen_random_uuid(),
  propietario_id  uuid not null references public.perfiles (id) on delete cascade,
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 60),
  especie         public.especie_animal not null,
  raza            text check (raza is null or char_length(raza) <= 60),
  color_principal text not null check (char_length(color_principal) between 2 and 30),
  tamano          public.tamano_animal not null,
  sexo            public.sexo_animal not null default 'DESCONOCIDO',
  microchip       text check (microchip is null or microchip ~ '^[0-9]{15}$'),
  temperamento    public.temperamento_animal not null default 'TRANQUILA',
  nota_manejo     text check (nota_manejo is null or char_length(nota_manejo) <= 300),
  creado_en       timestamptz not null default now()
);

-- Índice obligatorio y garantía de unicidad del microchip (NULL permitido varias veces)
create unique index mascotas_microchip_idx on public.mascotas (microchip);
create index mascotas_propietario_idx on public.mascotas (propietario_id);

create table public.fotos_mascota (
  id           uuid primary key default gen_random_uuid(),
  mascota_id   uuid not null references public.mascotas (id) on delete cascade,
  url          text not null check (url ~ '^https?://'),
  es_principal boolean not null default false,
  orden        smallint not null default 0 check (orden between 0 and 5)
);
create index fotos_mascota_mascota_idx on public.fotos_mascota (mascota_id, orden);

create table public.datos_reservados (
  id         uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  pregunta   text not null check (char_length(btrim(pregunta)) between 5 and 200),
  respuesta  text not null check (char_length(btrim(respuesta)) between 1 and 200)
);
create index datos_reservados_mascota_idx on public.datos_reservados (mascota_id);

-- ---------------------------------------------------------------------
-- casos
-- ---------------------------------------------------------------------
create table public.casos (
  id                  uuid primary key default gen_random_uuid(),
  mascota_id          uuid references public.mascotas (id) on delete restrict,
  creador_id          uuid not null references public.perfiles (id) on delete restrict,
  tipo                public.tipo_caso not null,
  estado              public.estado_caso not null default 'ABIERTO',
  desenlace           public.desenlace_caso,
  lat                 double precision not null check (lat between -90 and 90),
  lng                 double precision not null check (lng between -180 and 180),
  lat_publica         double precision,
  lng_publica         double precision,
  direccion_texto     text check (direccion_texto is null or char_length(direccion_texto) <= 150),
  ocurrido_en         timestamptz not null,
  descripcion         text check (descripcion is null or char_length(descripcion) <= 1000),
  radio_km            double precision not null default 5 check (radio_km > 0 and radio_km <= 50),
  ultima_actividad_en timestamptz not null default now(),
  creado_en           timestamptz not null default now(),
  constraint casos_perdida_con_mascota check (tipo <> 'PERDIDA' or mascota_id is not null),
  constraint casos_cierre_con_desenlace check ((estado = 'CERRADO') = (desenlace is not null))
);

create index casos_estado_tipo_idx on public.casos (estado, tipo);
create index casos_lat_lng_idx     on public.casos (lat, lng);
create index casos_mascota_idx     on public.casos (mascota_id);
create index casos_creador_idx     on public.casos (creador_id);

-- Una mascota no puede tener dos casos de pérdida abiertos (HU C / T-14)
create unique index casos_una_perdida_abierta_idx
  on public.casos (mascota_id)
  where tipo = 'PERDIDA' and estado in ('ABIERTO', 'EN_VERIFICACION');

-- ---------------------------------------------------------------------
-- reportes (hallazgos y avistamientos de ciudadanos)
-- ---------------------------------------------------------------------
create table public.reportes (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid not null references public.perfiles (id) on delete cascade,
  especie       public.especie_animal not null,
  raza          text check (raza is null or char_length(raza) <= 60),
  color         text check (color is null or char_length(color) <= 30),
  tamano        public.tamano_animal,
  sexo          public.sexo_animal,
  estado_animal public.estado_animal not null,
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  ocurrido_en   timestamptz not null,
  nota          text check (nota is null or char_length(nota) <= 500),
  foto_url      text not null check (foto_url ~ '^https?://'),
  creado_en     timestamptz not null default now()
);

create index reportes_lat_lng_idx     on public.reportes (lat, lng);
create index reportes_ocurrido_en_idx on public.reportes (ocurrido_en);
create index reportes_autor_idx       on public.reportes (autor_id);

-- ---------------------------------------------------------------------
-- lecturas_microchip (HU-01) — inmutables, solo anulables
-- ---------------------------------------------------------------------
create table public.lecturas_microchip (
  id               uuid primary key default gen_random_uuid(),
  veterinario_id   uuid not null references public.perfiles (id) on delete restrict,
  codigo           text not null check (codigo ~ '^[0-9]{15}$'),
  mascota_id       uuid references public.mascotas (id) on delete set null,
  caso_id          uuid references public.casos (id) on delete restrict,
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  establecimiento  text not null check (char_length(btrim(establecimiento)) between 2 and 120),
  leido_en         timestamptz not null default now(),
  anulada          boolean not null default false,
  motivo_anulacion text,
  anulada_en       timestamptz,
  creado_en        timestamptz not null default now(),
  constraint lecturas_anulacion_justificada
    check (not anulada or (motivo_anulacion is not null and char_length(btrim(motivo_anulacion)) >= 10))
);
create index lecturas_codigo_idx on public.lecturas_microchip (codigo);
create index lecturas_caso_idx   on public.lecturas_microchip (caso_id);
create index lecturas_vet_idx    on public.lecturas_microchip (veterinario_id, leido_en desc);

-- ---------------------------------------------------------------------
-- coincidencias (motor de cruce)
-- ---------------------------------------------------------------------
create table public.coincidencias (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos (id) on delete cascade,
  reporte_id  uuid not null references public.reportes (id) on delete cascade,
  puntaje     smallint not null check (puntaje between 0 and 100),
  motivos     jsonb not null default '[]'::jsonb check (jsonb_typeof(motivos) = 'array'),
  estado      public.estado_coincidencia not null default 'SUGERIDA',
  retroactiva boolean not null default false,
  creado_en   timestamptz not null default now(),
  decidida_en timestamptz,
  constraint coincidencias_unica unique (caso_id, reporte_id)
);
create index coincidencias_caso_idx on public.coincidencias (caso_id, estado);

-- ---------------------------------------------------------------------
-- verificaciones (HU-03)
-- ---------------------------------------------------------------------
create table public.verificaciones (
  id              uuid primary key default gen_random_uuid(),
  caso_id         uuid not null references public.casos (id) on delete cascade,
  reclamante_id   uuid not null references public.perfiles (id) on delete restrict,
  verificador_id  uuid not null references public.perfiles (id) on delete restrict,
  coincidencia_id uuid references public.coincidencias (id) on delete set null,
  estado          public.estado_verificacion not null default 'PENDIENTE',
  intentos        smallint not null default 0 check (intentos between 0 and 3),
  superada        boolean not null default false,
  creado_en       timestamptz not null default now(),
  resuelta_en     timestamptz,
  constraint verificaciones_partes_distintas check (reclamante_id <> verificador_id)
);
create index verificaciones_caso_idx on public.verificaciones (caso_id, reclamante_id);

-- Solo una verificación pendiente por caso y reclamante a la vez
create unique index verificaciones_una_pendiente_idx
  on public.verificaciones (caso_id, reclamante_id)
  where estado = 'PENDIENTE';

create table public.respuestas_verif (
  id                uuid primary key default gen_random_uuid(),
  verificacion_id   uuid not null references public.verificaciones (id) on delete cascade,
  dato_reservado_id uuid not null references public.datos_reservados (id) on delete cascade,
  intento           smallint not null check (intento between 1 and 3),
  respuesta_dada    text not null check (char_length(respuesta_dada) <= 200),
  coincide_auto     boolean not null,
  correcta          boolean,
  creado_en         timestamptz not null default now()
);
create index respuestas_verif_idx on public.respuestas_verif (verificacion_id, intento);

-- ---------------------------------------------------------------------
-- eventos (historial INMUTABLE del caso)
-- ---------------------------------------------------------------------
create table public.eventos (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos (id) on delete restrict,
  tipo        text not null check (tipo in (
                'CREACION', 'AVISTAMIENTO', 'LECTURA_MICROCHIP', 'LECTURA_ANULADA',
                'COINCIDENCIA_SUGERIDA', 'COINCIDENCIA_CONFIRMADA', 'COINCIDENCIA_DESCARTADA',
                'COINCIDENCIA_NO_SEGURO', 'VERIFICACION_INICIADA', 'VERIFICACION_INTENTO',
                'VERIFICACION_APROBADA', 'VERIFICACION_RECHAZADA', 'VERIFICACION_BLOQUEADA',
                'CAMBIO_DATOS', 'CAMBIO_ESTADO', 'RADIO_AMPLIADO', 'CIERRE')),
  autor_id    uuid references public.perfiles (id) on delete set null,
  descripcion text not null check (char_length(descripcion) between 1 and 500),
  creado_en   timestamptz not null default now()
);
create index eventos_caso_creado_idx on public.eventos (caso_id, creado_en);

-- ---------------------------------------------------------------------
-- notificaciones (in-app)
-- ---------------------------------------------------------------------
create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  titulo     text not null,
  cuerpo     text not null,
  enlace     text,
  leida_en   timestamptz,
  creado_en  timestamptz not null default now()
);
create index notificaciones_usuario_idx on public.notificaciones (usuario_id, creado_en desc);

-- ---------------------------------------------------------------------
-- Vistas públicas (proyecciones sin datos sensibles)
--   · perfiles_publicos: solo nombre y rol (sin teléfono)
--   · casos_publicos: sin lat/lng exactos; incluye casos cerrados para que la
--     ficha /caso/:id siga siendo consultable por enlace (HU-04.8)
-- Las vistas se ejecutan con los privilegios de su dueño, por eso solo
-- exponen columnas no sensibles.
-- ---------------------------------------------------------------------
create view public.perfiles_publicos as
  select p.id, p.nombre, p.rol
  from public.perfiles p;

create view public.casos_publicos as
  select
    c.id, c.mascota_id, c.creador_id, c.tipo, c.estado, c.desenlace,
    c.lat_publica, c.lng_publica, c.direccion_texto, c.ocurrido_en, c.descripcion,
    c.radio_km, c.ultima_actividad_en, c.creado_en,
    m.nombre          as mascota_nombre,
    m.especie         as especie,
    m.raza            as raza,
    m.color_principal as color_principal,
    m.tamano          as tamano,
    m.sexo            as sexo,
    m.temperamento    as temperamento,
    m.nota_manejo     as nota_manejo,
    (select f.url from public.fotos_mascota f
      where f.mascota_id = m.id
      order by f.es_principal desc, f.orden asc
      limit 1)        as foto_url
  from public.casos c
  left join public.mascotas m on m.id = c.mascota_id;

-- Tiempo real para la campana de notificaciones
alter publication supabase_realtime add table public.notificaciones;


-- >>>>>>>>>> funciones.sql <<<<<<<<<<
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
  if (new.codigo, new.veterinario_id, new.lat, new.lng, new.establecimiento, new.leido_en, new.creado_en)
     is distinct from
     (old.codigo, old.veterinario_id, old.lat, old.lng, old.establecimiento, old.leido_en, old.creado_en) then
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

create or replace function public.registrar_lectura(
  p_codigo text, p_lat double precision, p_lng double precision, p_establecimiento text)
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
begin
  if public.mi_rol() is distinct from 'VETERINARIO' then
    raise exception 'Solo el personal veterinario puede registrar lecturas de microchip.'
      using errcode = '42501';
  end if;
  if v_codigo !~ '^[0-9]{15}$' then
    raise exception 'El microchip debe tener 15 dígitos numéricos.';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Marca en el mapa la ubicación donde se hizo la lectura.';
  end if;
  if char_length(btrim(coalesce(p_establecimiento, ''))) < 2 then
    raise exception 'Indica el nombre del establecimiento donde se hizo la lectura.';
  end if;

  select m.id, m.nombre, m.propietario_id into v_m from public.mascotas m where m.microchip = v_codigo;

  if found then
    select c.id into v_caso from public.casos c
     where c.mascota_id = v_m.id and c.estado in ('ABIERTO', 'EN_VERIFICACION')
     order by (c.tipo = 'PERDIDA') desc, c.creado_en desc
     limit 1;

    if v_caso is null then
      insert into public.casos (mascota_id, creador_id, tipo, lat, lng, direccion_texto, ocurrido_en, descripcion)
      values (v_m.id, v_uid, 'HALLAZGO', p_lat, p_lng, btrim(p_establecimiento), now(),
              format('Caso abierto automáticamente por lectura de microchip en %s.', btrim(p_establecimiento)))
      returning id into v_caso;
      v_caso_creado := true;
    end if;
  end if;

  insert into public.lecturas_microchip (veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento)
  values (v_uid, v_codigo, v_m.id, v_caso, p_lat, p_lng, btrim(p_establecimiento))
  returning id into v_lectura;

  if v_caso is not null then
    perform public._evento(v_caso, 'LECTURA_MICROCHIP', v_uid,
      format('Lectura del microchip %s en %s.', public._enmascarar_chip(v_codigo), btrim(p_establecimiento)));
    perform public._notificar(v_m.propietario_id,
      format('Leyeron el microchip de %s', v_m.nombre),
      format('El microchip de %s fue leído en %s el %s. Revisa el caso para coordinar.',
             v_m.nombre, btrim(p_establecimiento), public._fecha_local(now())),
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
  if (select count(*) from public.datos_reservados where mascota_id = v_mascota) < 3 then
    raise exception 'La mascota no tiene datos reservados suficientes para verificar al dueño.';
  end if;

  insert into public.verificaciones (caso_id, reclamante_id, verificador_id, coincidencia_id)
  values (p_caso, p_reclamante, p_verificador, p_coincidencia)
  returning id into v_id;

  update public.casos set estado = 'EN_VERIFICACION' where id = p_caso and estado = 'ABIERTO';

  perform public._evento(p_caso, 'VERIFICACION_INICIADA', coalesce(auth.uid(), p_verificador),
    'Se inició la verificación de propiedad antes de la entrega.');
  perform public._notificar(p_reclamante, 'Verificación de propiedad iniciada',
    'Responde las 3 preguntas de seguridad sobre tu mascota para continuar con la entrega.',
    '/verificacion/' || v_id::text);
  perform public._notificar(p_verificador, 'Verificación de propiedad iniciada',
    'Cuando el reclamante responda, revisa sus respuestas y decide si apruebas la entrega.',
    '/verificacion/' || v_id::text);
  return v_id;
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

-- Preguntas (nunca respuestas) para los participantes de la verificación.
create or replace function public.preguntas_verificacion(p_verificacion uuid)
returns table (id uuid, pregunta text)
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
    select d.id, d.pregunta
      from public.verificaciones v
      join public.casos c on c.id = v.caso_id
      join public.datos_reservados d on d.mascota_id = c.mascota_id
     where v.id = p_verificacion
     order by d.id;
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
    from public.casos c join public.mascotas m on m.id = c.mascota_id where c.id = v.caso_id;

  -- Todas las preguntas deben tener respuesta antes de contar como intento
  for v_d in select d.id from public.datos_reservados d where d.mascota_id = v_c.mascota_id loop
    if public.normalizar_texto(p_respuestas ->> v_d.id::text) = '' then
      raise exception 'Responde todas las preguntas antes de enviar.';
    end if;
  end loop;

  v_intento := v.intentos + 1;
  for v_d in select d.id, d.respuesta from public.datos_reservados d where d.mascota_id = v_c.mascota_id loop
    v_dada := left(btrim(p_respuestas ->> v_d.id::text), 200);
    v_ok := public.normalizar_texto(v_dada) = v_d.respuesta;
    insert into public.respuestas_verif (verificacion_id, dato_reservado_id, intento, respuesta_dada, coincide_auto)
    values (p_verificacion, v_d.id, v_intento, v_dada, v_ok);
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
    perform public._notificar(v_c.propietario_id, 'Verificación bloqueada',
      format('Se bloqueó una verificación sobre %s tras 3 intentos fallidos. Si no fuiste tú, revisa tu cuenta.', v_c.nombre),
      '/verificacion/' || p_verificacion::text);
    if v.verificador_id <> v_c.propietario_id then
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
  if not (v.superada or v.estado = 'APROBADA') then
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
revoke execute on function public.registrar_lectura(text, double precision, double precision, text) from public, anon;
revoke execute on function public.anular_lectura(uuid, text) from public, anon;
revoke execute on function public.guardar_coincidencias(jsonb) from public, anon;
revoke execute on function public.iniciar_verificacion(uuid) from public, anon;
revoke execute on function public.preguntas_verificacion(uuid) from public, anon;
revoke execute on function public.verificar_respuestas(uuid, jsonb) from public, anon;
revoke execute on function public.resolver_verificacion(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.contactos_verificacion(uuid) from public, anon;
revoke execute on function public.ubicacion_exacta_caso(uuid) from public, anon;

grant execute on function public.guardar_mascota(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.registrar_lectura(text, double precision, double precision, text) to authenticated;
grant execute on function public.anular_lectura(uuid, text) to authenticated;
grant execute on function public.guardar_coincidencias(jsonb) to authenticated;
grant execute on function public.iniciar_verificacion(uuid) to authenticated;
grant execute on function public.preguntas_verificacion(uuid) to authenticated;
grant execute on function public.verificar_respuestas(uuid, jsonb) to authenticated;
grant execute on function public.resolver_verificacion(uuid, jsonb, boolean) to authenticated;
grant execute on function public.contactos_verificacion(uuid) to authenticated;
grant execute on function public.ubicacion_exacta_caso(uuid) to authenticated;
grant execute on function public.distancia_km(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.normalizar_texto(text) to anon, authenticated;


-- >>>>>>>>>> politicas.sql <<<<<<<<<<
-- =====================================================================
-- ChipPet · Mascotas perdidas
-- 3/4  politicas.sql — privilegios, Row Level Security y Storage
-- Ejecutar DESPUÉS de funciones.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Punto de partida: sin privilegios para los roles del cliente.
--    Luego se otorga solo lo necesario (por columna cuando aplica).
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

alter table public.perfiles           enable row level security;
alter table public.mascotas           enable row level security;
alter table public.fotos_mascota      enable row level security;
alter table public.datos_reservados   enable row level security;
alter table public.casos              enable row level security;
alter table public.reportes           enable row level security;
alter table public.lecturas_microchip enable row level security;
alter table public.coincidencias      enable row level security;
alter table public.verificaciones     enable row level security;
alter table public.respuestas_verif   enable row level security;
alter table public.eventos            enable row level security;
alter table public.notificaciones     enable row level security;

-- ---------------------------------------------------------------------
-- perfiles: cada usuario lee y edita solo el suyo.
-- Nombre y rol de otros usuarios: vista perfiles_publicos (sin teléfono).
-- El rol no es editable por el usuario.
-- ---------------------------------------------------------------------
grant select on public.perfiles to authenticated;
grant update (nombre, telefono, zona_lat, zona_lng, radio_km) on public.perfiles to authenticated;

create policy perfiles_leer_propio on public.perfiles
  for select to authenticated using (id = auth.uid());
create policy perfiles_editar_propio on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.perfiles_publicos to anon, authenticated;

-- ---------------------------------------------------------------------
-- mascotas y fotos: el dueño hace todo; el resto solo lectura.
-- ---------------------------------------------------------------------
grant select on public.mascotas to anon, authenticated;
grant insert, update, delete on public.mascotas to authenticated;

create policy mascotas_lectura_publica on public.mascotas
  for select to anon, authenticated using (true);
create policy mascotas_insertar_propietario on public.mascotas
  for insert to authenticated
  with check (propietario_id = auth.uid() and public.mi_rol() in ('PROPIETARIO', 'ADMIN'));
create policy mascotas_editar_dueno on public.mascotas
  for update to authenticated
  using (propietario_id = auth.uid()) with check (propietario_id = auth.uid());
create policy mascotas_borrar_dueno on public.mascotas
  for delete to authenticated using (propietario_id = auth.uid());

grant select on public.fotos_mascota to anon, authenticated;
grant insert, update, delete on public.fotos_mascota to authenticated;

create policy fotos_lectura_publica on public.fotos_mascota
  for select to anon, authenticated using (true);
create policy fotos_insertar_dueno on public.fotos_mascota
  for insert to authenticated with check (public.es_dueno_mascota(mascota_id));
create policy fotos_editar_dueno on public.fotos_mascota
  for update to authenticated
  using (public.es_dueno_mascota(mascota_id)) with check (public.es_dueno_mascota(mascota_id));
create policy fotos_borrar_dueno on public.fotos_mascota
  for delete to authenticated using (public.es_dueno_mascota(mascota_id));

-- ---------------------------------------------------------------------
-- datos_reservados: SOLO el dueño. Nadie más, nunca (anon sin privilegios).
-- La verificación compara respuestas dentro de verificar_respuestas().
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.datos_reservados to authenticated;

create policy reservados_solo_dueno on public.datos_reservados
  for all to authenticated
  using (public.es_dueno_mascota(mascota_id))
  with check (public.es_dueno_mascota(mascota_id));

-- ---------------------------------------------------------------------
-- casos: lectura pública de casos no cerrados (el creador ve también los suyos cerrados);
-- escritura solo del creador. lat/lng exactos NO se exponen a nadie por SELECT
-- (el creador los obtiene con ubicacion_exacta_caso()). La ficha pública usa casos_publicos.
-- ---------------------------------------------------------------------
grant select (id, mascota_id, creador_id, tipo, estado, desenlace, lat_publica, lng_publica,
              direccion_texto, ocurrido_en, descripcion, radio_km, ultima_actividad_en, creado_en)
  on public.casos to anon, authenticated;
grant insert (mascota_id, creador_id, tipo, lat, lng, direccion_texto, ocurrido_en, descripcion, radio_km)
  on public.casos to authenticated;
grant update (descripcion, direccion_texto, radio_km, estado, desenlace) on public.casos to authenticated;

create policy casos_lectura_publica on public.casos
  for select to anon, authenticated
  using (estado <> 'CERRADO' or creador_id = auth.uid());
create policy casos_insertar_perdida_propia on public.casos
  for insert to authenticated
  with check (creador_id = auth.uid() and tipo = 'PERDIDA' and public.es_dueno_mascota(mascota_id));
create policy casos_editar_creador on public.casos
  for update to authenticated
  using (creador_id = auth.uid()) with check (creador_id = auth.uid());

grant select on public.casos_publicos to anon, authenticated;

-- ---------------------------------------------------------------------
-- reportes: lectura pública; creación por cualquier autenticado; edición solo del autor.
-- ---------------------------------------------------------------------
grant select on public.reportes to anon, authenticated;
grant insert on public.reportes to authenticated;
grant update (especie, raza, color, tamano, sexo, estado_animal, nota) on public.reportes to authenticated;

create policy reportes_lectura_publica on public.reportes
  for select to anon, authenticated using (true);
create policy reportes_insertar_autenticado on public.reportes
  for insert to authenticated with check (autor_id = auth.uid());
create policy reportes_editar_autor on public.reportes
  for update to authenticated using (autor_id = auth.uid()) with check (autor_id = auth.uid());

-- ---------------------------------------------------------------------
-- lecturas_microchip: INSERT solo con rol VETERINARIO; sin UPDATE ni DELETE.
-- La anulación se hace con anular_lectura() (SECURITY DEFINER, exige justificación).
-- ---------------------------------------------------------------------
grant select on public.lecturas_microchip to anon, authenticated;
grant insert (veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento)
  on public.lecturas_microchip to authenticated;
revoke update, delete, truncate on public.lecturas_microchip from anon, authenticated;

create policy lecturas_lectura on public.lecturas_microchip
  for select to anon, authenticated
  using (caso_id is not null
         or veterinario_id = auth.uid()
         or (mascota_id is not null and public.es_dueno_mascota(mascota_id)));
create policy lecturas_insertar_veterinario on public.lecturas_microchip
  for insert to authenticated
  with check (veterinario_id = auth.uid() and public.mi_rol() = 'VETERINARIO');

-- ---------------------------------------------------------------------
-- coincidencias: solo el dueño del caso las lee y cambia su estado.
-- Se crean únicamente con guardar_coincidencias().
-- ---------------------------------------------------------------------
grant select on public.coincidencias to authenticated;
grant update (estado) on public.coincidencias to authenticated;

create policy coincidencias_leer_dueno_caso on public.coincidencias
  for select to authenticated using (public.es_dueno_caso(caso_id));
create policy coincidencias_decidir_dueno_caso on public.coincidencias
  for update to authenticated
  using (public.es_dueno_caso(caso_id)) with check (public.es_dueno_caso(caso_id));

-- ---------------------------------------------------------------------
-- verificaciones: las partes (reclamante, quien encontró) y el dueño del caso.
-- Las escrituras solo ocurren mediante funciones.
-- ---------------------------------------------------------------------
grant select on public.verificaciones to authenticated;

create policy verificaciones_leer_participantes on public.verificaciones
  for select to authenticated
  using (auth.uid() in (reclamante_id, verificador_id) or public.es_dueno_caso(caso_id));

-- respuestas_verif: quien verifica las ve siempre; el reclamante solo cuando se resolvió
-- (así no puede ir descubriendo cuáles acertó entre intentos).
grant select on public.respuestas_verif to authenticated;

create policy respuestas_leer on public.respuestas_verif
  for select to authenticated
  using (exists (
    select 1 from public.verificaciones v
     where v.id = verificacion_id
       and (v.verificador_id = auth.uid()
            or (v.reclamante_id = auth.uid() and v.estado in ('APROBADA', 'RECHAZADA')))));

-- ---------------------------------------------------------------------
-- eventos: lectura pública; INSERT permitido; UPDATE y DELETE revocados para todos.
-- Además, un trigger impide cualquier UPDATE/DELETE/TRUNCATE incluso a roles de servicio.
-- ---------------------------------------------------------------------
grant select on public.eventos to anon, authenticated;
grant insert (caso_id, tipo, autor_id, descripcion) on public.eventos to authenticated;
revoke update, delete, truncate on public.eventos from public, anon, authenticated, service_role;

create policy eventos_lectura_publica on public.eventos
  for select to anon, authenticated using (true);
create policy eventos_insertar on public.eventos
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and (tipo = 'AVISTAMIENTO' or (tipo = 'CAMBIO_DATOS' and public.es_dueno_caso(caso_id))));

-- ---------------------------------------------------------------------
-- notificaciones: cada usuario solo las suyas (y solo puede marcarlas como leídas).
-- ---------------------------------------------------------------------
grant select on public.notificaciones to authenticated;
grant update (leida_en) on public.notificaciones to authenticated;

create policy notificaciones_leer_propias on public.notificaciones
  for select to authenticated using (usuario_id = auth.uid());
create policy notificaciones_marcar_propias on public.notificaciones
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage: bucket "fotos" público de lectura, máx. 5 MB, JPG/PNG/WEBP.
-- Cada usuario sube solo dentro de su carpeta <uid>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "fotos: lectura publica" on storage.objects
  for select to anon, authenticated using (bucket_id = 'fotos');
create policy "fotos: subir en carpeta propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos: borrar propias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);


-- >>>>>>>>>> seed.sql <<<<<<<<<<
-- =====================================================================
-- ChipPet · Mascotas perdidas
-- 4/4  seed.sql — datos de prueba para la sustentación
-- Ejecutar UNA sola vez, DESPUÉS de politicas.sql, sobre una base limpia.
--
-- Usuarios (contraseña para todos: Prueba2026!)
--   propietario@chippet.test  · PROPIETARIO  · Laura Gómez
--   ciudadano@chippet.test    · CIUDADANO    · Andrés Ruiz
--   veterinario@chippet.test  · VETERINARIO  · Dra. Paula Ortiz
--   admin@chippet.test        · ADMIN        · Administración ChipPet
--
-- Punto central: Pasto, Nariño (1.2136, -77.2811). Fechas relativas a now().
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Usuarios (auth.users + auth.identities). El trigger crea los perfiles.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'propietario@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Laura Gómez","telefono":"3001112233","rol":"PROPIETARIO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'ciudadano@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Andrés Ruiz","telefono":"3104445566","rol":"CIUDADANO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'veterinario@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Dra. Paula Ortiz","telefono":"3207778899","rol":"VETERINARIO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'admin@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Administración ChipPet","telefono":"3000000000","rol":"CIUDADANO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', '');

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');

-- ADMIN no se autoasigna en el registro: se promueve aquí.
update public.perfiles set rol = 'ADMIN' where id = '44444444-4444-4444-4444-444444444444';
update public.perfiles set zona_lat = 1.2136, zona_lng = -77.2811;

-- ---------------------------------------------------------------------
-- Mascotas (5), todas de Laura. Fotos de ejemplo externas.
-- ---------------------------------------------------------------------
insert into public.mascotas (id, propietario_id, nombre, especie, raza, color_principal, tamano, sexo, microchip, temperamento, nota_manejo, creado_en) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Max',   'PERRO', 'Pastor alemán', 'Negro',      'GRANDE',  'MACHO',  '981098102458912', 'SOCIABLE',     'Es amigable, responde a su nombre. Tiene collar rojo.', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Luna',  'GATO',  'Siamés',        'Crema',      'PEQUENO', 'HEMBRA', '985112000000456', 'HURANA',       'Se esconde en lugares altos. No la persiga: avise y espere.', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Rocky', 'PERRO', 'Mestizo',       'Café claro', 'MEDIANO', 'MACHO',  null,              'PUEDE_MORDER', 'Muerde si lo toman del cuello. Ofrézcale comida y llame al dueño.', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Nina',  'PERRO', 'Labrador',      'Dorado',     'GRANDE',  'HEMBRA', '900164000123789', 'TRANQUILA',    null, now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Simón', 'GATO',  'Mestizo',       'Atigrado',   'MEDIANO', 'MACHO',  null,              'NERVIOSA',     'Se asusta con ruidos fuertes.', now() - interval '25 days');

insert into public.fotos_mascota (mascota_id, url, es_principal, orden) values
  ('a0000000-0000-0000-0000-000000000001', 'https://loremflickr.com/800/600/germanshepherd?lock=11', true, 0),
  ('a0000000-0000-0000-0000-000000000001', 'https://loremflickr.com/800/600/germanshepherd?lock=12', false, 1),
  ('a0000000-0000-0000-0000-000000000002', 'https://loremflickr.com/800/600/siamese,cat?lock=21', true, 0),
  ('a0000000-0000-0000-0000-000000000003', 'https://loremflickr.com/800/600/mutt,dog?lock=31', true, 0),
  ('a0000000-0000-0000-0000-000000000004', 'https://loremflickr.com/800/600/labrador?lock=41', true, 0),
  ('a0000000-0000-0000-0000-000000000005', 'https://loremflickr.com/800/600/tabby,cat?lock=51', true, 0);

-- 3 datos reservados por mascota (el trigger normaliza las respuestas)
insert into public.datos_reservados (mascota_id, pregunta, respuesta) values
  ('a0000000-0000-0000-0000-000000000001', '¿Cómo se llama su juguete favorito?',            'Pato amarillo'),
  ('a0000000-0000-0000-0000-000000000001', '¿En qué parte del cuerpo tiene una cicatriz?',   'Oreja izquierda'),
  ('a0000000-0000-0000-0000-000000000001', '¿Qué palabra lo hace venir corriendo?',          'Galleta'),
  ('a0000000-0000-0000-0000-000000000002', '¿Cómo se llama su juguete favorito?',            'Ratón gris'),
  ('a0000000-0000-0000-0000-000000000002', '¿Qué marca particular tiene y dónde?',           'Mancha en la cola'),
  ('a0000000-0000-0000-0000-000000000002', '¿Con qué sonido o palabra responde?',            'Michi'),
  ('a0000000-0000-0000-0000-000000000003', '¿Cuál es su juguete favorito?',                  'Pelota roja'),
  ('a0000000-0000-0000-0000-000000000003', '¿Qué pata tiene una marca blanca?',              'Trasera derecha'),
  ('a0000000-0000-0000-0000-000000000003', '¿Qué palabra lo emociona?',                      'Paseo'),
  ('a0000000-0000-0000-0000-000000000004', '¿De qué color es el lazo que usa en casa?',      'Azul'),
  ('a0000000-0000-0000-0000-000000000004', '¿Dónde tiene un lunar?',                         'En el pecho'),
  ('a0000000-0000-0000-0000-000000000004', '¿Cómo se llama la veterinaria donde la vacunan?','San Roque'),
  ('a0000000-0000-0000-0000-000000000005', '¿Cuál es su juguete favorito?',                  'Pluma'),
  ('a0000000-0000-0000-0000-000000000005', '¿Qué rasgo físico particular tiene?',            'Bigote cortado'),
  ('a0000000-0000-0000-0000-000000000005', '¿Qué comida lo hace salir de su escondite?',     'Atún');

-- ---------------------------------------------------------------------
-- Casos. Se desactiva el trigger que genera el evento de creación con now()
-- para registrar el historial con sus fechas reales.
-- ---------------------------------------------------------------------
alter table public.casos disable trigger casos_despues_insertar;

insert into public.casos (id, mascota_id, creador_id, tipo, estado, lat, lng, direccion_texto, ocurrido_en, descripcion, radio_km, ultima_actividad_en, creado_en) values
  -- K1 · Max · par de puntaje ALTO con R1
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'ABIERTO',
   1.2136, -77.2811, 'Parque Infantil', now() - interval '24 hours',
   'Se soltó de la correa mientras paseábamos en el parque. Lleva collar rojo sin placa.', 5, now() - interval '23 hours', now() - interval '23 hours'),
  -- K2 · Luna · par por DEBAJO del umbral con R2; verificación bloqueada
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'ABIERTO',
   1.2230, -77.2750, 'Barrio Las Cuadras', now() - interval '48 hours',
   'Salió por la ventana del segundo piso durante la noche.', 5, now() - interval '47 hours', now() - interval '47 hours'),
  -- K3 · Rocky
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'ABIERTO',
   1.1950, -77.3000, 'Sector Potrerillo', now() - interval '74 hours',
   'Se asustó con pólvora y saltó la reja.', 3, now() - interval '73 hours', now() - interval '73 hours'),
  -- K4 · Nina · resuelto con verificación aprobada
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'RESUELTO',
   1.2350, -77.2950, 'Avenida Panamericana', now() - interval '6 days',
   'Se perdió cerca de la avenida al abrirse el portón.', 5, now() - interval '4 days', now() - interval '6 days' + interval '1 hour');

alter table public.casos enable trigger casos_despues_insertar;

-- ---------------------------------------------------------------------
-- Reportes (8) de Andrés alrededor del punto central
-- ---------------------------------------------------------------------
insert into public.reportes (id, autor_id, especie, raza, color, tamano, sexo, estado_animal, lat, lng, ocurrido_en, nota, foto_url, creado_en) values
  -- R1 · 1 km al este de K1, 6 h después → puntaje 93
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'PERRO', 'Pastor alemán', 'Negro', 'GRANDE', 'MACHO', 'SIGUE_EN_LUGAR',
   1.2136, -77.272115, now() - interval '18 hours', 'Collar rojo, está echado frente a una panadería.', 'https://loremflickr.com/800/600/germanshepherd?lock=13', now() - interval '17 hours'),
  -- R2 · 4 km al sur de K2, gato distinto → puntaje ≈ 20 (no se guarda)
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'GATO', 'Persa', 'Blanco', 'GRANDE', 'MACHO', 'SE_FUE',
   1.187027, -77.2750, now() - interval '1 hour', 'Gato blanco de pelo largo cruzando la calle.', 'https://loremflickr.com/800/600/persian,cat?lock=22', now() - interval '50 minutes'),
  -- R3 · 1,5 km al sur de K3 (se descubre al recalcular K3)
  ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'PERRO', 'Mestizo', 'Café claro', 'MEDIANO', null, 'SE_FUE',
   1.181510, -77.3000, now() - interval '54 hours', 'Perro asustado corriendo hacia el río.', 'https://loremflickr.com/800/600/mutt,dog?lock=32', now() - interval '50 hours'),
  -- R4 · 500 m al este de K2 → coincidencia confirmada (verificación bloqueada)
  ('b0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'GATO', 'Siamés', 'Crema', 'PEQUENO', 'HEMBRA', 'LO_RECOGI',
   1.2230, -77.270502, now() - interval '38 hours', 'La tengo en casa, está tranquila.', 'https://loremflickr.com/800/600/siamese,cat?lock=23', now() - interval '37 hours'),
  -- R5 · 1,5 km al norte de K1, publicado ANTES del caso → coincidencia retroactiva (70)
  ('b0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'PERRO', null, 'Negro', 'GRANDE', null, 'SE_FUE',
   1.227090, -77.2811, now() - interval '72 hours', 'Perro grande negro sin collar.', 'https://loremflickr.com/800/600/blackdog?lock=14', now() - interval '71 hours'),
  -- R6 · conejo
  ('b0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'OTRO', 'Conejo', 'Blanco', 'PEQUENO', null, 'LO_RECOGI',
   1.2000, -77.2700, now() - interval '5 days', 'Conejo blanco en un jardín.', 'https://loremflickr.com/800/600/rabbit?lock=61', now() - interval '5 days'),
  -- R7 · gato atigrado
  ('b0000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'GATO', 'Mestizo', 'Atigrado', 'MEDIANO', 'MACHO', 'REQUIERE_ATENCION',
   1.2400, -77.2650, now() - interval '7 days', 'Tiene una pata lastimada.', 'https://loremflickr.com/800/600/tabby,cat?lock=52', now() - interval '7 days' + interval '2 hours'),
  -- R8 · 800 m al oeste de K4 → coincidencia confirmada (verificación aprobada)
  ('b0000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'PERRO', 'Labrador', 'Dorado', 'GRANDE', 'HEMBRA', 'LO_RECOGI',
   1.2350, -77.302196, now() - interval '5 days', 'Labradora muy dócil, la llevé a la veterinaria.', 'https://loremflickr.com/800/600/labrador?lock=42', now() - interval '5 days' + interval '1 hour');

-- ---------------------------------------------------------------------
-- Lecturas de microchip: 1 de mascota registrada (Nina) y 1 huérfana
-- ---------------------------------------------------------------------
insert into public.lecturas_microchip (id, veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento, leido_en, creado_en) values
  ('f0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '900164000123789',
   'a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004',
   1.2320, -77.3010, 'Clínica Veterinaria San Roque', now() - interval '5 days' + interval '3 hours', now() - interval '5 days' + interval '3 hours'),
  ('f0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', '999000111222333',
   null, null,
   1.2090, -77.2850, 'Clínica Veterinaria San Roque', now() - interval '2 days', now() - interval '2 days');

-- ---------------------------------------------------------------------
-- Coincidencias
-- ---------------------------------------------------------------------
insert into public.coincidencias (id, caso_id, reporte_id, puntaje, motivos, estado, retroactiva, creado_en, decidida_en) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 93,
   '[{"criterio":"DISTANCIA","aporte":24,"detalle":"a 1 km"},{"criterio":"TIEMPO","aporte":19.3,"detalle":"6 horas después de la pérdida"},{"criterio":"RAZA","aporte":20,"detalle":"misma raza"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"},{"criterio":"SEXO","aporte":5,"detalle":"mismo sexo"}]',
   'SUGERIDA', false, now() - interval '17 hours', null),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 70,
   '[{"criterio":"DISTANCIA","aporte":21,"detalle":"a 1,5 km"},{"criterio":"TIEMPO","aporte":14.3,"detalle":"2 días antes de la pérdida"},{"criterio":"RAZA","aporte":10,"detalle":"raza compatible (mestizo o sin dato)"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"}]',
   'SUGERIDA', true, now() - interval '23 hours', null),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 96,
   '[{"criterio":"DISTANCIA","aporte":27,"detalle":"a 500 m"},{"criterio":"TIEMPO","aporte":18.8,"detalle":"10 horas después de la pérdida"},{"criterio":"RAZA","aporte":20,"detalle":"misma raza"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"},{"criterio":"SEXO","aporte":5,"detalle":"mismo sexo"}]',
   'CONFIRMADA', false, now() - interval '37 hours', now() - interval '36 hours'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000008', 92,
   '[{"criterio":"DISTANCIA","aporte":25.2,"detalle":"a 800 m"},{"criterio":"TIEMPO","aporte":17.1,"detalle":"24 horas después de la pérdida"},{"criterio":"RAZA","aporte":20,"detalle":"misma raza"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"},{"criterio":"SEXO","aporte":5,"detalle":"mismo sexo"}]',
   'CONFIRMADA', false, now() - interval '5 days' + interval '1 hour', now() - interval '4 days');

-- ---------------------------------------------------------------------
-- Verificaciones: 1 aprobada (Nina) y 1 bloqueada por 3 intentos (Luna)
-- ---------------------------------------------------------------------
insert into public.verificaciones (id, caso_id, reclamante_id, verificador_id, coincidencia_id, estado, intentos, superada, creado_en, resuelta_en) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000004', 'APROBADA', 1, true, now() - interval '4 days', now() - interval '4 days' + interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000003', 'BLOQUEADA', 3, false, now() - interval '36 hours', now() - interval '33 hours');

-- Respuestas de la verificación aprobada (intento 1, las 3 correctas)
insert into public.respuestas_verif (verificacion_id, dato_reservado_id, intento, respuesta_dada, coincide_auto, correcta, creado_en)
select 'e0000000-0000-0000-0000-000000000001', d.id, 1, x.dada, true, true, now() - interval '4 days' + interval '1 hour'
  from public.datos_reservados d
  join (values ('azul', 'Azul'), ('en el pecho', 'En el pecho'), ('san roque', 'San Roque')) as x(resp, dada) on x.resp = d.respuesta
 where d.mascota_id = 'a0000000-0000-0000-0000-000000000004';

-- Respuestas de la verificación bloqueada (3 intentos fallidos)
insert into public.respuestas_verif (verificacion_id, dato_reservado_id, intento, respuesta_dada, coincide_auto, correcta, creado_en)
select 'e0000000-0000-0000-0000-000000000002', d.id, i.n,
       case i.n when 1 then 'Pelota' when 2 then 'Cascabel' else 'No recuerdo' end,
       false, null, now() - interval '36 hours' + (i.n || ' hours')::interval
  from public.datos_reservados d
 cross join (values (1), (2), (3)) as i(n)
 where d.mascota_id = 'a0000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------
-- Historial (eventos) con fechas reales
-- ---------------------------------------------------------------------
insert into public.eventos (caso_id, tipo, autor_id, descripcion, creado_en) values
  -- K1 · Max
  ('c0000000-0000-0000-0000-000000000001', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Max.', now() - interval '23 hours'),
  ('c0000000-0000-0000-0000-000000000001', 'COINCIDENCIA_SUGERIDA', '11111111-1111-1111-1111-111111111111', 'Posible coincidencia con un reporte de avistamiento (puntaje 70/100), publicado antes del caso.', now() - interval '23 hours' + interval '1 minute'),
  ('c0000000-0000-0000-0000-000000000001', 'COINCIDENCIA_SUGERIDA', '22222222-2222-2222-2222-222222222222', 'Posible coincidencia con un reporte de avistamiento (puntaje 93/100).', now() - interval '17 hours'),
  -- K2 · Luna
  ('c0000000-0000-0000-0000-000000000002', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Luna.', now() - interval '47 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'COINCIDENCIA_SUGERIDA', '22222222-2222-2222-2222-222222222222', 'Posible coincidencia con un reporte de hallazgo (puntaje 96/100).', now() - interval '37 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'COINCIDENCIA_CONFIRMADA', '11111111-1111-1111-1111-111111111111', 'El propietario confirmó que el reporte corresponde a Luna (puntaje 96/100).', now() - interval '36 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_INICIADA', '11111111-1111-1111-1111-111111111111', 'Se inició la verificación de propiedad antes de la entrega.', now() - interval '36 hours' + interval '1 second'),
  ('c0000000-0000-0000-0000-000000000002', 'CAMBIO_ESTADO', '11111111-1111-1111-1111-111111111111', 'Estado del caso: abierto → en verificación.', now() - interval '36 hours' + interval '2 seconds'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_INTENTO', '11111111-1111-1111-1111-111111111111', 'Intento de verificación fallido (1 de 3).', now() - interval '35 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_INTENTO', '11111111-1111-1111-1111-111111111111', 'Intento de verificación fallido (2 de 3).', now() - interval '34 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_BLOQUEADA', '11111111-1111-1111-1111-111111111111', 'Verificación bloqueada tras 3 intentos fallidos del mismo reclamante.', now() - interval '33 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'CAMBIO_ESTADO', null, 'Estado del caso: en verificación → abierto.', now() - interval '33 hours' + interval '1 second'),
  -- K3 · Rocky
  ('c0000000-0000-0000-0000-000000000003', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Rocky.', now() - interval '73 hours'),
  -- K4 · Nina
  ('c0000000-0000-0000-0000-000000000004', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Nina.', now() - interval '6 days' + interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'COINCIDENCIA_SUGERIDA', '22222222-2222-2222-2222-222222222222', 'Posible coincidencia con un reporte de hallazgo (puntaje 92/100).', now() - interval '5 days' + interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'LECTURA_MICROCHIP', '33333333-3333-3333-3333-333333333333', 'Lectura del microchip •••••••••••3789 en Clínica Veterinaria San Roque.', now() - interval '5 days' + interval '3 hours'),
  ('c0000000-0000-0000-0000-000000000004', 'COINCIDENCIA_CONFIRMADA', '11111111-1111-1111-1111-111111111111', 'El propietario confirmó que el reporte corresponde a Nina (puntaje 92/100).', now() - interval '4 days'),
  ('c0000000-0000-0000-0000-000000000004', 'VERIFICACION_INICIADA', '11111111-1111-1111-1111-111111111111', 'Se inició la verificación de propiedad antes de la entrega.', now() - interval '4 days' + interval '1 second'),
  ('c0000000-0000-0000-0000-000000000004', 'CAMBIO_ESTADO', '11111111-1111-1111-1111-111111111111', 'Estado del caso: abierto → en verificación.', now() - interval '4 days' + interval '2 seconds'),
  ('c0000000-0000-0000-0000-000000000004', 'VERIFICACION_INTENTO', '11111111-1111-1111-1111-111111111111', 'El reclamante respondió las preguntas de seguridad (intento 1 de 3). Pendiente de revisión.', now() - interval '4 days' + interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'VERIFICACION_APROBADA', '22222222-2222-2222-2222-222222222222', 'Entrega aprobada: 3 de 3 respuestas marcadas como correctas.', now() - interval '4 days' + interval '2 hours'),
  ('c0000000-0000-0000-0000-000000000004', 'CAMBIO_ESTADO', '22222222-2222-2222-2222-222222222222', 'Estado del caso: en verificación → resuelto.', now() - interval '4 days' + interval '2 hours' + interval '1 second');

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
insert into public.notificaciones (usuario_id, titulo, cuerpo, enlace, leida_en, creado_en) values
  ('11111111-1111-1111-1111-111111111111', 'Posible coincidencia para Max', 'Encontramos un reporte con puntaje 93/100. Revísalo y decide si es tu mascota.', '/caso/c0000000-0000-0000-0000-000000000001#coincidencias', null, now() - interval '17 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Posible coincidencia para Max', 'Encontramos un reporte con puntaje 70/100. Revísalo y decide si es tu mascota.', '/caso/c0000000-0000-0000-0000-000000000001#coincidencias', null, now() - interval '23 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Verificación bloqueada', 'Se bloqueó una verificación sobre Luna tras 3 intentos fallidos. Si no fuiste tú, revisa tu cuenta.', '/verificacion/e0000000-0000-0000-0000-000000000002', null, now() - interval '33 hours'),
  ('22222222-2222-2222-2222-222222222222', 'Verificación bloqueada', 'El reclamante falló 3 intentos. No entregues al animal a esta persona.', '/verificacion/e0000000-0000-0000-0000-000000000002', now() - interval '30 hours', now() - interval '33 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Leyeron el microchip de Nina', 'El microchip de Nina fue leído en Clínica Veterinaria San Roque.', '/caso/c0000000-0000-0000-0000-000000000004', now() - interval '5 days', now() - interval '5 days' + interval '3 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Verificación aprobada', 'Quien encontró a Nina aprobó la entrega. Coordinen en un lugar público o una veterinaria.', '/verificacion/e0000000-0000-0000-0000-000000000001', now() - interval '4 days', now() - interval '4 days' + interval '2 hours');

commit;


