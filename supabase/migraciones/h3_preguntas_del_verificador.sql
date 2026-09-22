-- =====================================================================
-- ChipPet · H3 (HU-03) — Verificación con preguntas de dos orígenes
-- Aplicar UNA SOLA VEZ sobre una base que ya tiene el esquema.
-- Requiere haber aplicado antes h1_lectura_microchip.sql.
--
-- Modelo híbrido:
--   · Si la mascota tiene datos reservados (los definió su dueño al
--     registrarla), se usan esos. Es el camino de siempre.
--   · Si no los tiene —mascota nunca registrada, o hallazgo de un animal
--     desconocido— quien encontró al animal crea las preguntas mirando al
--     animal que tiene delante.
-- En ningún caso el reclamante ve una respuesta correcta.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Preguntas creadas por quien encontró al animal
-- ---------------------------------------------------------------------
create table if not exists public.preguntas_verif (
  id              uuid primary key default gen_random_uuid(),
  verificacion_id uuid not null references public.verificaciones (id) on delete cascade,
  pregunta        text not null check (char_length(btrim(pregunta)) between 5 and 200),
  respuesta       text not null check (char_length(btrim(respuesta)) between 1 and 200),
  orden           smallint not null default 0,
  creado_en       timestamptz not null default now()
);
create index if not exists preguntas_verif_idx on public.preguntas_verif (verificacion_id, orden);

-- Misma normalización que datos_reservados: minúsculas, sin tildes ni signos.
drop trigger if exists preguntas_verif_normalizar on public.preguntas_verif;
create trigger preguntas_verif_normalizar
  before insert or update on public.preguntas_verif
  for each row execute function public.normalizar_dato_reservado();

-- Nadie del cliente lee esta tabla: las respuestas solo se comparan dentro
-- de verificar_respuestas(), igual que datos_reservados.
alter table public.preguntas_verif enable row level security;
revoke all on public.preguntas_verif from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Una respuesta apunta a un dato reservado O a una pregunta creada
-- ---------------------------------------------------------------------
alter table public.respuestas_verif alter column dato_reservado_id drop not null;
alter table public.respuestas_verif
  add column if not exists pregunta_verif_id uuid references public.preguntas_verif (id) on delete cascade;
alter table public.respuestas_verif
  add constraint respuestas_verif_una_fuente
  check (num_nonnulls(dato_reservado_id, pregunta_verif_id) = 1);

-- ---------------------------------------------------------------------
-- 3. Crear la verificación ya no exige datos reservados previos
-- ---------------------------------------------------------------------
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
    -- Sin datos reservados del dueño, el primer paso lo da quien encontró al animal.
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

-- ---------------------------------------------------------------------
-- 4. Quien encontró al animal crea las preguntas
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. Las preguntas salen de cualquiera de los dos orígenes (nunca la respuesta)
-- ---------------------------------------------------------------------
drop function if exists public.preguntas_verificacion(uuid);

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

-- ---------------------------------------------------------------------
-- 6. La comparación recorre el origen que corresponda
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 7. El contacto solo se entrega con la entrega ya aprobada
--    (antes bastaba con superar las preguntas).
-- ---------------------------------------------------------------------
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
-- 8. Permisos
-- ---------------------------------------------------------------------
revoke execute on function public.crear_preguntas_verificacion(uuid, jsonb) from public, anon;
revoke execute on function public.preguntas_verificacion(uuid) from public, anon;

grant execute on function public.crear_preguntas_verificacion(uuid, jsonb) to authenticated;
grant execute on function public.preguntas_verificacion(uuid) to authenticated;

commit;
