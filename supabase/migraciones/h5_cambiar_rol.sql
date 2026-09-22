-- =====================================================================
-- ChipPet · Cambiar de perfil sin perder la sesión
-- Aplicar UNA SOLA VEZ. Es idempotente (create or replace).
--
-- Problema que resuelve: quien ya entró como Ciudadano y luego pulsa
-- "Perdí mi mascota" chocaba con "Esta sección no es para tu perfil", sin
-- ninguna salida — al ciudadano no se le muestra el botón de cambiar perfil.
--
-- El rol es una etiqueta de lo que la persona viene a hacer, no un privilegio:
-- se puede cambiar entre los mismos tres que ofrece el registro. ADMIN sigue
-- sin poder autoasignarse, igual que en crear_perfil_nuevo_usuario().
-- =====================================================================

begin;

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

revoke execute on function public.cambiar_rol(text) from public, anon;
grant execute on function public.cambiar_rol(text) to authenticated;

commit;
