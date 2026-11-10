-- =====================================================================
-- ChipPet · Sprint 2 · HU-07 — importar casos de grupos de WhatsApp
-- Aplicar UNA SOLA VEZ, DESPUÉS de h8. Es idempotente.
--
--   npm run db:migrar -- supabase/migraciones/h9_importar_whatsapp.sql
--
-- Qué cambia:
--   · reportes.origen / origen_nombre / origen_ref: de dónde viene el reporte
--     ('APP' o 'WHATSAPP'), qué fundación o grupo lo publicó y una huella del
--     mensaje original. La huella impide importar dos veces el mismo mensaje.
--   · Solo el perfil COORDINADOR puede insertar reportes con origen distinto
--     de 'APP'. Nadie puede cambiar el origen de un reporte ya publicado.
--   · crear_perfil_nuevo_usuario() y cambiar_rol() aceptan COORDINADOR.
--     El rol sigue siendo una etiqueta, no un privilegio: lo único que habilita
--     es marcar reportes como importados.
-- =====================================================================

begin;

alter table public.reportes
  add column if not exists origen        text not null default 'APP'
    constraint reportes_origen_check check (origen in ('APP', 'WHATSAPP')),
  add column if not exists origen_nombre text
    constraint reportes_origen_nombre_check
      check (origen_nombre is null or char_length(btrim(origen_nombre)) between 2 and 80),
  add column if not exists origen_ref    text
    constraint reportes_origen_ref_check
      check (origen_ref is null or char_length(origen_ref) between 8 and 80);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reportes_origen_coherente') then
    alter table public.reportes
      add constraint reportes_origen_coherente
      check (origen = 'APP' or (origen_nombre is not null and origen_ref is not null));
  end if;
end $$;

-- Un mismo mensaje no se importa dos veces por la misma persona (HU-07, criterio 6).
create unique index if not exists reportes_origen_ref_idx on public.reportes (autor_id, origen_ref);

-- ---------------------------------------------------------------------
-- Perfil automático: acepta COORDINADOR
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
             when 'PROPIETARIO'  then 'PROPIETARIO'::public.rol_usuario
             when 'VETERINARIO'  then 'VETERINARIO'::public.rol_usuario
             when 'COORDINADOR'  then 'COORDINADOR'::public.rol_usuario
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

-- ---------------------------------------------------------------------
-- Cambiar de perfil sin perder la sesión: acepta COORDINADOR
-- ---------------------------------------------------------------------
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
             when 'COORDINADOR' then 'COORDINADOR'::public.rol_usuario
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

-- ---------------------------------------------------------------------
-- Reportes: solo el coordinador importa; el origen no se puede cambiar después
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
      if new.origen <> 'APP' and public.mi_rol() is distinct from 'COORDINADOR' then
        raise exception 'Solo un coordinador de fundación puede importar casos de WhatsApp.'
          using errcode = '42501';
      end if;
    else
      new.creado_en := old.creado_en;
      new.autor_id := old.autor_id;
      new.origen := old.origen;
      new.origen_nombre := old.origen_nombre;
      new.origen_ref := old.origen_ref;
    end if;
  end if;
  return new;
end;
$$;

commit;
