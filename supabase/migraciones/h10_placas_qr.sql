-- =====================================================================
-- ChipPet · Sprint 3 · HU-11 — placa con código QR para la mascota
-- Aplicar UNA SOLA VEZ. Es idempotente.
--
--   npm run db:migrar -- supabase/migraciones/h10_placas_qr.sql
--
-- Qué entra:
--   · placas_qr: la solicitud del propietario (datos de envío y estado del
--     pedido). Su `codigo` es lo que lleva el QR: /placa/<codigo>.
--   · avisos_placa: lo que deja quien escanea una placa de una mascota que no
--     tiene caso abierto. Sirve también para limitar el abuso (3 por hora).
--   · solicitar_placa(), cancelar_placa(), placa_publica(), avisar_dueno_placa().
--
-- Privacidad: la página pública de la placa NUNCA muestra el teléfono del
-- dueño ni los datos reservados. Solo foto, nombre y rasgos de la mascota.
-- Si hay un caso de pérdida abierto, se enlaza a la ficha del caso, que ya
-- sabe qué mostrar (HU-04). Si no lo hay, quien escanea deja un aviso y el
-- dueño lo recibe como notificación con el contacto de esa persona.
-- =====================================================================

begin;

create table if not exists public.placas_qr (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique check (codigo ~ '^[a-z0-9]{10}$'),
  mascota_id      uuid not null references public.mascotas (id) on delete cascade,
  solicitante_id  uuid not null references public.perfiles (id) on delete cascade,
  estado          text not null default 'SOLICITADA'
                    check (estado in ('SOLICITADA', 'EN_PRODUCCION', 'ENVIADA', 'ENTREGADA', 'CANCELADA')),
  nombre_envio    text not null check (char_length(btrim(nombre_envio)) between 2 and 80),
  direccion_envio text not null check (char_length(btrim(direccion_envio)) between 8 and 200),
  ciudad          text not null check (char_length(btrim(ciudad)) between 2 and 60),
  telefono_envio  text not null check (telefono_envio ~ '^\+?[0-9 ]{7,15}$'),
  notas           text check (notas is null or char_length(notas) <= 200),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists placas_mascota_idx on public.placas_qr (mascota_id, creado_en desc);

-- Una mascota no puede tener dos pedidos en trámite a la vez.
create unique index if not exists placas_una_en_tramite_idx
  on public.placas_qr (mascota_id)
  where estado in ('SOLICITADA', 'EN_PRODUCCION', 'ENVIADA');

create table if not exists public.avisos_placa (
  id         uuid primary key default gen_random_uuid(),
  placa_id   uuid not null references public.placas_qr (id) on delete cascade,
  autor_id   uuid not null references public.perfiles (id) on delete cascade,
  mensaje    text not null check (char_length(btrim(mensaje)) between 5 and 300),
  creado_en  timestamptz not null default now()
);
create index if not exists avisos_placa_idx on public.avisos_placa (placa_id, autor_id, creado_en desc);

alter table public.placas_qr    enable row level security;
alter table public.avisos_placa enable row level security;

-- El propietario lee sus pedidos; solo ADMIN cambia el estado. No hay INSERT
-- directo: los pedidos se crean con solicitar_placa().
grant select on public.placas_qr to authenticated;
grant update (estado, actualizado_en) on public.placas_qr to authenticated;
grant select on public.avisos_placa to authenticated;

drop policy if exists placas_leer_dueno on public.placas_qr;
create policy placas_leer_dueno on public.placas_qr
  for select to authenticated
  using (solicitante_id = auth.uid() or public.es_dueno_mascota(mascota_id));

drop policy if exists placas_admin_actualizar on public.placas_qr;
create policy placas_admin_actualizar on public.placas_qr
  for update to authenticated
  using (public.mi_rol() = 'ADMIN') with check (public.mi_rol() = 'ADMIN');

drop policy if exists avisos_placa_leer_dueno on public.avisos_placa;
create policy avisos_placa_leer_dueno on public.avisos_placa
  for select to authenticated
  using (exists (select 1 from public.placas_qr p
                  where p.id = placa_id and public.es_dueno_mascota(p.mascota_id)));

-- ---------------------------------------------------------------------
-- solicitar_placa: crea el pedido y genera el código del QR
-- ---------------------------------------------------------------------
create or replace function public.solicitar_placa(
  p_mascota   uuid,
  p_nombre    text,
  p_direccion text,
  p_ciudad    text,
  p_telefono  text,
  p_notas     text default null)
returns public.placas_qr
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mascota public.mascotas;
  v_placa   public.placas_qr;
  v_codigo  text;
begin
  if auth.uid() is null then
    raise exception 'Necesitas una sesión para solicitar la placa.' using errcode = '42501';
  end if;
  select * into v_mascota from public.mascotas where id = p_mascota;
  if not found or v_mascota.propietario_id <> auth.uid() then
    raise exception 'Solo el propietario puede solicitar la placa de su mascota.' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Escribe el nombre de quien recibe la placa.';
  end if;
  if char_length(btrim(coalesce(p_direccion, ''))) < 8 then
    raise exception 'Escribe la dirección de envío completa (mínimo 8 caracteres).';
  end if;
  if char_length(btrim(coalesce(p_ciudad, ''))) < 2 then
    raise exception 'Escribe la ciudad de envío.';
  end if;
  if coalesce(p_telefono, '') !~ '^\+?[0-9 ]{7,15}$' then
    raise exception 'El teléfono de envío debe tener entre 7 y 15 dígitos.';
  end if;

  -- Código corto e impredecible (gen_random_uuid es criptográficamente aleatorio).
  loop
    v_codigo := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10);
    exit when not exists (select 1 from public.placas_qr where codigo = v_codigo);
  end loop;

  begin
    insert into public.placas_qr (codigo, mascota_id, solicitante_id, nombre_envio, direccion_envio,
                                  ciudad, telefono_envio, notas)
    values (v_codigo, p_mascota, auth.uid(), btrim(p_nombre), btrim(p_direccion),
            btrim(p_ciudad), btrim(p_telefono), nullif(btrim(coalesce(p_notas, '')), ''))
    returning * into v_placa;
  exception when unique_violation then
    raise exception 'Esta mascota ya tiene una placa en trámite. Cancélala o espera a que llegue.';
  end;

  perform public._notificar(
    auth.uid(),
    'Placa QR solicitada',
    'Recibimos tu pedido de la placa de ' || v_mascota.nombre || '. Ya puedes ver y descargar su código QR.',
    '/mascotas/' || v_mascota.id || '/placa');
  return v_placa;
end;
$$;

-- ---------------------------------------------------------------------
-- cancelar_placa: solo mientras el pedido sigue en SOLICITADA
-- ---------------------------------------------------------------------
create or replace function public.cancelar_placa(p_placa uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa public.placas_qr;
begin
  select * into v_placa from public.placas_qr where id = p_placa;
  if not found or v_placa.solicitante_id <> auth.uid() then
    raise exception 'Solo quien hizo el pedido puede cancelarlo.' using errcode = '42501';
  end if;
  if v_placa.estado <> 'SOLICITADA' then
    raise exception 'El pedido ya está en producción o fue enviado: no se puede cancelar.';
  end if;
  update public.placas_qr set estado = 'CANCELADA', actualizado_en = now() where id = p_placa;
end;
$$;

-- ---------------------------------------------------------------------
-- placa_publica: lo que ve quien escanea el QR (sin sesión)
-- ---------------------------------------------------------------------
create or replace function public.placa_publica(p_codigo text)
returns table (
  codigo          text,
  mascota_nombre  text,
  especie         public.especie_animal,
  raza            text,
  color_principal text,
  tamano          public.tamano_animal,
  temperamento    public.temperamento_animal,
  nota_manejo     text,
  foto_url        text,
  caso_id         uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.codigo, m.nombre, m.especie, m.raza, m.color_principal, m.tamano, m.temperamento, m.nota_manejo,
         (select f.url from public.fotos_mascota f
           where f.mascota_id = m.id order by f.es_principal desc, f.orden asc limit 1),
         (select c.id from public.casos c
           where c.mascota_id = m.id and c.tipo = 'PERDIDA' and c.estado in ('ABIERTO', 'EN_VERIFICACION')
           order by c.creado_en desc limit 1)
    from public.placas_qr p
    join public.mascotas m on m.id = p.mascota_id
   where p.codigo = lower(btrim(coalesce(p_codigo, '')))
     and p.estado <> 'CANCELADA'
$$;

-- ---------------------------------------------------------------------
-- avisar_dueno_placa: quien escanea una placa sin caso abierto avisa al dueño
-- ---------------------------------------------------------------------
create or replace function public.avisar_dueno_placa(p_codigo text, p_mensaje text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa  public.placas_qr;
  v_nombre text;
  v_autor  public.perfiles;
begin
  if auth.uid() is null then
    raise exception 'Necesitas dejar tu nombre y celular para avisar al dueño.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_mensaje, ''))) < 5 then
    raise exception 'Cuéntale al dueño dónde y cómo está su mascota (mínimo 5 caracteres).';
  end if;
  if char_length(p_mensaje) > 300 then
    raise exception 'El mensaje admite máximo 300 caracteres.';
  end if;

  select * into v_placa from public.placas_qr
   where codigo = lower(btrim(coalesce(p_codigo, ''))) and estado <> 'CANCELADA';
  if not found then
    raise exception 'Esta placa no existe o fue cancelada.';
  end if;
  if v_placa.solicitante_id = auth.uid() then
    raise exception 'Esta es tu propia placa.';
  end if;
  if (select count(*) from public.avisos_placa
       where placa_id = v_placa.id and autor_id = auth.uid()
         and creado_en > now() - interval '1 hour') >= 3 then
    raise exception 'Ya avisaste varias veces en la última hora. Espera un momento.';
  end if;

  select * into v_autor from public.perfiles where id = auth.uid();
  select nombre into v_nombre from public.mascotas where id = v_placa.mascota_id;

  insert into public.avisos_placa (placa_id, autor_id, mensaje) values (v_placa.id, auth.uid(), btrim(p_mensaje));

  perform public._notificar(
    v_placa.solicitante_id,
    'Escanearon la placa de ' || v_nombre,
    v_autor.nombre || ' (' || v_autor.telefono || ') escaneó la placa y dice: «' || btrim(p_mensaje) || '»',
    '/mascotas/' || v_placa.mascota_id || '/placa');
end;
$$;

revoke execute on function public.solicitar_placa(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.cancelar_placa(uuid) from public, anon;
revoke execute on function public.avisar_dueno_placa(text, text) from public, anon;
grant execute on function public.solicitar_placa(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.cancelar_placa(uuid) to authenticated;
grant execute on function public.avisar_dueno_placa(text, text) to authenticated;
-- Público a propósito: quien escanea el QR no tiene sesión.
revoke execute on function public.placa_publica(text) from public;
grant execute on function public.placa_publica(text) to anon, authenticated;

commit;
