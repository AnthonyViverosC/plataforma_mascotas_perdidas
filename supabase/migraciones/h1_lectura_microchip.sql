-- =====================================================================
-- ChipPet · H1 (HU-01) — Lectura de microchip, versión simplificada
-- Aplicar UNA SOLA VEZ sobre una base que ya tiene el esquema.
-- En instalaciones limpias esto ya viene en schema.sql y funciones.sql.
--
-- Cambios:
--   1. La ubicación de la lectura deja de ser obligatoria.
--   2. Se registra a mano quién hizo la lectura (leido_por).
--   3. registrar_lectura() se parte en dos: consultar antes, guardar después.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. La ubicación pasa a ser opcional
-- ---------------------------------------------------------------------
alter table public.lecturas_microchip alter column lat drop not null;
alter table public.lecturas_microchip alter column lng drop not null;

-- ---------------------------------------------------------------------
-- 2. Quién hizo la lectura (texto libre; se rellena con el nombre del perfil)
-- ---------------------------------------------------------------------
alter table public.lecturas_microchip add column if not exists leido_por text;

update public.lecturas_microchip l
   set leido_por = coalesce(
         (select btrim(p.nombre) from public.perfiles p where p.id = l.veterinario_id),
         'Sin registrar')
 where leido_por is null;

alter table public.lecturas_microchip
  add constraint lecturas_leido_por_check
  check (char_length(btrim(leido_por)) between 2 and 80);

alter table public.lecturas_microchip alter column leido_por set not null;

grant insert (veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento, leido_por)
  on public.lecturas_microchip to authenticated;

-- ---------------------------------------------------------------------
-- 3. leido_por también es inmutable
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Consulta previa: resuelve el microchip ANTES de guardar nada.
--    Solo lee de mascotas, que ya es de lectura pública; no expone datos nuevos.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. registrar_lectura con la firma nueva (ubicación opcional + leido_por)
-- ---------------------------------------------------------------------
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

  select m.id, m.nombre, m.propietario_id into v_m
    from public.mascotas m where m.microchip = v_codigo;

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
    'lectura_id',     v_lectura,
    'registrada',     v_m.id is not null,
    'mascota_nombre', v_m.nombre,
    'caso_id',        v_caso,
    'caso_creado',    v_caso_creado);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos de las funciones nuevas
-- ---------------------------------------------------------------------
revoke execute on function public.consultar_microchip(text) from public, anon;
revoke execute on function public.registrar_lectura(text, text, text, double precision, double precision)
  from public, anon;

grant execute on function public.consultar_microchip(text) to authenticated;
grant execute on function public.registrar_lectura(text, text, text, double precision, double precision)
  to authenticated;

commit;
