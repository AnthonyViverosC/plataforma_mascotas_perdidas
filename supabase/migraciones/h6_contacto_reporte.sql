-- =====================================================================
-- ChipPet · El dueño puede llamar a quien avistó a su mascota
-- Aplicar UNA SOLA VEZ. Es idempotente (create or replace).
--
-- Decisión: el contacto viaja en UN SOLO SENTIDO, del avistador hacia el
-- dueño. Quien reporta ya deja su nombre y su teléfono en el paso 1 de
-- Reportar; lo que faltaba era que el dueño pudiera verlos para llamar.
--
-- El teléfono del DUEÑO sigue sin publicarse: si se mostrara en la ficha,
-- cualquiera podría sacarlo y la verificación de propiedad (HU-03) se
-- quedaría sin motivo, porque ya no haría falta demostrar nada para llegar
-- al contacto.
--
-- El filtro es estrecho a propósito: solo se entrega el contacto de un
-- reporte que figure como coincidencia de un caso de quien pregunta. Así
-- nadie puede ir sondeando reportes ajenos uno por uno.
-- =====================================================================

begin;

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

revoke execute on function public.contacto_reporte(uuid) from public, anon;
grant execute on function public.contacto_reporte(uuid) to authenticated;

commit;
