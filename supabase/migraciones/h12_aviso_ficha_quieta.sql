-- =====================================================================
-- ChipPet · Mejora · Aviso por ficha quieta (backlog: «Propietario · aviso si
-- la ficha lleva días sin moverse», puntaje 20)
-- Aplicar UNA SOLA VEZ, después de h11. Es idempotente.
--
--   npm run db:migrar -- supabase/migraciones/h12_aviso_ficha_quieta.sql
--
-- avisar_fichas_quietas() notifica al dueño de cada caso de pérdida vivo que
-- lleva 3 días o más sin actividad (casos.ultima_actividad_en), con un enlace
-- a su ficha para volver a difundirla. No repite el aviso al mismo caso antes
-- de otros 3 días. Devuelve cuántos avisos envió.
--
-- Se programa con pg_cron todos los días a las 9:00 de Bogotá (14:00 UTC) si
-- la extensión está activa (Supabase → Database → Extensions → pg_cron). Si
-- no lo está, la migración no falla: se puede activar después y volver a
-- aplicar este archivo, o llamar la función a mano.
-- =====================================================================

begin;

create or replace function public.avisar_fichas_quietas(p_dias integer default 3)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso   record;
  v_total  integer := 0;
  v_enlace text;
begin
  for v_caso in
    select c.id, c.creador_id, c.ultima_actividad_en, m.nombre
      from public.casos c
      left join public.mascotas m on m.id = c.mascota_id
     where c.tipo = 'PERDIDA'
       and c.estado in ('ABIERTO', 'EN_VERIFICACION')
       and c.ultima_actividad_en <= now() - make_interval(days => p_dias)
  loop
    v_enlace := '/caso/' || v_caso.id;
    -- Un aviso por caso cada p_dias días, como máximo.
    continue when exists (
      select 1 from public.notificaciones n
       where n.usuario_id = v_caso.creador_id
         and n.enlace = v_enlace
         and n.titulo like 'La ficha de % está quieta'
         and n.creado_en > now() - make_interval(days => p_dias));

    perform public._notificar(
      v_caso.creador_id,
      'La ficha de ' || coalesce(v_caso.nombre, 'tu mascota') || ' está quieta',
      'Lleva ' || extract(day from now() - v_caso.ultima_actividad_en)::integer
        || ' días sin avisos. Compártela de nuevo por WhatsApp, imprime el cartel con QR o amplía el radio de búsqueda.',
      v_enlace);
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;

-- Solo la tarea programada (o un administrador desde el SQL Editor) la ejecuta.
revoke execute on function public.avisar_fichas_quietas(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'chippet_fichas_quietas';
    perform cron.schedule('chippet_fichas_quietas', '0 14 * * *', 'select public.avisar_fichas_quietas()');
  else
    raise notice 'pg_cron no está activo: avisar_fichas_quietas() quedó creada pero sin programar.';
  end if;
end
$$;

commit;
