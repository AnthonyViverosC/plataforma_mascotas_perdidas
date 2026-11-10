-- =====================================================================
-- ChipPet · Mejora · Jornadas de búsqueda (backlog: «Propietario · convocar
-- una jornada de búsqueda», puntaje 24)
-- Aplicar UNA SOLA VEZ, después de h10. Es idempotente.
--
--   npm run db:migrar -- supabase/migraciones/h11_jornadas_busqueda.sql
--
-- Qué entra:
--   · jornadas_busqueda: el dueño de un caso de pérdida vivo convoca a buscar
--     a su mascota un día, a una hora y en un punto de encuentro.
--   · jornada_asistentes: quién dijo «voy». Solo su nombre público.
--   · convocar_jornada(), cancelar_jornada(), apuntarse_jornada(),
--     salir_jornada() y jornadas_caso() (lectura pública con el conteo).
--   · Tipo de evento 'JORNADA' en el historial del caso.
--
-- Privacidad: el punto de encuentro lo escribe el dueño y es público a
-- propósito. Nunca se usa la ubicación exacta del caso. Los teléfonos no se
-- exponen: a quien se apunta solo le llega la hora y el punto.
-- =====================================================================

begin;

-- El historial acepta el nuevo tipo de evento.
alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check check (tipo in (
  'CREACION', 'AVISTAMIENTO', 'LECTURA_MICROCHIP', 'LECTURA_ANULADA',
  'COINCIDENCIA_SUGERIDA', 'COINCIDENCIA_CONFIRMADA', 'COINCIDENCIA_DESCARTADA',
  'COINCIDENCIA_NO_SEGURO', 'VERIFICACION_INICIADA', 'VERIFICACION_INTENTO',
  'VERIFICACION_APROBADA', 'VERIFICACION_RECHAZADA', 'VERIFICACION_BLOQUEADA',
  'CAMBIO_DATOS', 'CAMBIO_ESTADO', 'RADIO_AMPLIADO', 'CIERRE', 'JORNADA'));

create table if not exists public.jornadas_busqueda (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete cascade,
  organizador_id uuid not null references public.perfiles (id) on delete cascade,
  inicia_en      timestamptz not null,
  punto_texto    text not null check (char_length(btrim(punto_texto)) between 4 and 120),
  nota           text check (nota is null or char_length(nota) <= 300),
  cancelada      boolean not null default false,
  creado_en      timestamptz not null default now()
);
create index if not exists jornadas_caso_idx on public.jornadas_busqueda (caso_id, inicia_en);

create table if not exists public.jornada_asistentes (
  jornada_id uuid not null references public.jornadas_busqueda (id) on delete cascade,
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  creado_en  timestamptz not null default now(),
  primary key (jornada_id, perfil_id)
);

-- Sin acceso directo: todo pasa por las funciones de abajo.
alter table public.jornadas_busqueda  enable row level security;
alter table public.jornada_asistentes enable row level security;
revoke all on public.jornadas_busqueda  from anon, authenticated;
revoke all on public.jornada_asistentes from anon, authenticated;

-- ---------------------------------------------------------------------
-- jornadas_caso: lectura pública de las jornadas de un caso
-- ---------------------------------------------------------------------
create or replace function public.jornadas_caso(p_caso uuid)
returns table (
  id           uuid,
  inicia_en    timestamptz,
  punto_texto  text,
  nota         text,
  cancelada    boolean,
  organizador  text,
  asistentes   integer,
  yo_asisto    boolean,
  es_mia       boolean)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.inicia_en, j.punto_texto, j.nota, j.cancelada,
         p.nombre,
         (select count(*)::integer from public.jornada_asistentes a where a.jornada_id = j.id),
         exists (select 1 from public.jornada_asistentes a where a.jornada_id = j.id and a.perfil_id = auth.uid()),
         j.organizador_id = auth.uid()
    from public.jornadas_busqueda j
    join public.perfiles p on p.id = j.organizador_id
   where j.caso_id = p_caso
     -- Las pasadas solo se muestran el mismo día, para no llenar la ficha.
     and j.inicia_en > now() - interval '12 hours'
   order by j.inicia_en
$$;

-- ---------------------------------------------------------------------
-- convocar_jornada: solo el dueño de un caso de pérdida vivo
-- ---------------------------------------------------------------------
create or replace function public.convocar_jornada(
  p_caso   uuid,
  p_inicia timestamptz,
  p_punto  text,
  p_nota   text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso    public.casos;
  v_nombre  text;
  v_id      uuid;
  v_aviso   uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitas una sesión para convocar una jornada.' using errcode = '42501';
  end if;
  select * into v_caso from public.casos where id = p_caso;
  if not found or v_caso.creador_id <> auth.uid() then
    raise exception 'Solo quien publicó el caso puede convocar una jornada.' using errcode = '42501';
  end if;
  if v_caso.tipo <> 'PERDIDA' or v_caso.estado not in ('ABIERTO', 'EN_VERIFICACION') then
    raise exception 'Solo se convocan jornadas para casos de pérdida abiertos.';
  end if;
  if p_inicia is null or p_inicia < now() + interval '30 minutes' then
    raise exception 'La jornada debe empezar al menos 30 minutos después de ahora.';
  end if;
  if p_inicia > now() + interval '30 days' then
    raise exception 'La jornada debe ser dentro de los próximos 30 días.';
  end if;
  if char_length(btrim(coalesce(p_punto, ''))) < 4 then
    raise exception 'Escribe el punto de encuentro (mínimo 4 caracteres).';
  end if;
  if char_length(btrim(p_punto)) > 120 then
    raise exception 'El punto de encuentro admite máximo 120 caracteres.';
  end if;
  if char_length(coalesce(p_nota, '')) > 300 then
    raise exception 'La nota admite máximo 300 caracteres.';
  end if;
  if (select count(*) from public.jornadas_busqueda
       where caso_id = p_caso and not cancelada and inicia_en > now()) >= 3 then
    raise exception 'Ya tienes 3 jornadas próximas para este caso. Cancela una antes de convocar otra.';
  end if;

  insert into public.jornadas_busqueda (caso_id, organizador_id, inicia_en, punto_texto, nota)
  values (p_caso, auth.uid(), p_inicia, btrim(p_punto), nullif(btrim(coalesce(p_nota, '')), ''))
  returning id into v_id;

  select m.nombre into v_nombre from public.mascotas m where m.id = v_caso.mascota_id;

  perform public._evento(p_caso, 'JORNADA', auth.uid(),
    'Jornada de búsqueda convocada para el ' || public._fecha_local(p_inicia) || ' en ' || btrim(p_punto) || '.');

  -- Avisa a quienes ya reportaron haberla visto: son los que mejor conocen la zona.
  for v_aviso in
    select distinct r.autor_id
      from public.coincidencias c
      join public.reportes r on r.id = c.reporte_id
     where c.caso_id = p_caso and c.estado <> 'DESCARTADA' and r.autor_id <> auth.uid()
  loop
    perform public._notificar(
      v_aviso,
      'Jornada para buscar a ' || coalesce(v_nombre, 'una mascota'),
      'Su familia convoca una búsqueda el ' || public._fecha_local(p_inicia) || ' en ' || btrim(p_punto) || '. Tú la viste: tu ayuda vale mucho.',
      '/caso/' || p_caso);
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- cancelar_jornada: el organizador; avisa a quienes se apuntaron
-- ---------------------------------------------------------------------
create or replace function public.cancelar_jornada(p_jornada uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j public.jornadas_busqueda;
  v_a uuid;
begin
  select * into v_j from public.jornadas_busqueda where id = p_jornada;
  if not found or v_j.organizador_id <> auth.uid() then
    raise exception 'Solo quien convocó la jornada puede cancelarla.' using errcode = '42501';
  end if;
  if v_j.cancelada then
    return;
  end if;
  update public.jornadas_busqueda set cancelada = true where id = p_jornada;
  perform public._evento(v_j.caso_id, 'JORNADA', auth.uid(),
    'Jornada del ' || public._fecha_local(v_j.inicia_en) || ' cancelada.');
  for v_a in select perfil_id from public.jornada_asistentes where jornada_id = p_jornada loop
    perform public._notificar(v_a, 'Jornada cancelada',
      'Se canceló la jornada de búsqueda del ' || public._fecha_local(v_j.inicia_en) || ' en ' || v_j.punto_texto || '.',
      '/caso/' || v_j.caso_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- apuntarse_jornada / salir_jornada
-- ---------------------------------------------------------------------
create or replace function public.apuntarse_jornada(p_jornada uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_j      public.jornadas_busqueda;
  v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Déjanos tu nombre y celular para apuntarte.' using errcode = '42501';
  end if;
  select * into v_j from public.jornadas_busqueda where id = p_jornada;
  if not found or v_j.cancelada then
    raise exception 'Esta jornada no existe o fue cancelada.';
  end if;
  if v_j.inicia_en < now() - interval '2 hours' then
    raise exception 'Esta jornada ya pasó.';
  end if;
  if v_j.organizador_id = auth.uid() then
    raise exception 'Eres quien convoca la jornada.';
  end if;

  insert into public.jornada_asistentes (jornada_id, perfil_id) values (p_jornada, auth.uid())
  on conflict do nothing;
  if not found then
    return; -- ya estaba apuntado: no se repite el aviso
  end if;

  select nombre into v_nombre from public.perfiles where id = auth.uid();
  perform public._notificar(v_j.organizador_id, 'Alguien se sumó a la búsqueda',
    v_nombre || ' irá a la jornada del ' || public._fecha_local(v_j.inicia_en) || '.',
    '/caso/' || v_j.caso_id);
end;
$$;

create or replace function public.salir_jornada(p_jornada uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.jornada_asistentes where jornada_id = p_jornada and perfil_id = auth.uid();
$$;

revoke execute on function public.convocar_jornada(uuid, timestamptz, text, text) from public, anon;
revoke execute on function public.cancelar_jornada(uuid) from public, anon;
revoke execute on function public.apuntarse_jornada(uuid) from public, anon;
revoke execute on function public.salir_jornada(uuid) from public, anon;
grant execute on function public.convocar_jornada(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.cancelar_jornada(uuid) to authenticated;
grant execute on function public.apuntarse_jornada(uuid) to authenticated;
grant execute on function public.salir_jornada(uuid) to authenticated;
-- Público a propósito: la ficha del caso se ve sin sesión.
revoke execute on function public.jornadas_caso(uuid) from public;
grant execute on function public.jornadas_caso(uuid) to anon, authenticated;

commit;
