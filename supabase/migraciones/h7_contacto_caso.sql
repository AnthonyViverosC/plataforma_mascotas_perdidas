-- =====================================================================
-- ChipPet · El teléfono del dueño se publica en la ficha del caso
-- Aplicar UNA SOLA VEZ. Es idempotente (create or replace).
--
--   npm run db:migrar -- supabase/migraciones/h7_contacto_caso.sql
--
-- Cambia la decisión que tomaba h6: hasta ahora el contacto viajaba en un
-- solo sentido (del avistador hacia el dueño) y quien encontraba al animal
-- tenía que pasar la verificación de propiedad para llegar al teléfono.
-- Ahora el número del dueño aparece en la ficha, como en un cartel pegado
-- en un poste: quien ve al animal llama de una vez.
--
-- Lo que se conserva:
--   · Solo casos vivos (ABIERTO o EN_VERIFICACION). Al cerrar el caso el
--     teléfono deja de entregarse.
--   · Se pide caso por caso, nunca en lote: la vista casos_publicos sigue
--     sin traer el teléfono, así que un listado de búsqueda no lo expone.
--   · La verificación de propiedad (HU-03) sigue en pie. Ya no es la puerta
--     para conseguir un teléfono, pero sigue siendo lo que decide a quién se
--     le ENTREGA el animal, que es lo que de verdad importa.
-- =====================================================================

begin;

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

revoke execute on function public.contacto_caso(uuid) from public;
grant execute on function public.contacto_caso(uuid) to anon, authenticated;

commit;
