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
alter table public.preguntas_verif    enable row level security;
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
grant insert (veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento, leido_por)
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

-- preguntas_verif: NADIE del cliente la lee, igual que datos_reservados.
-- Las preguntas se obtienen con preguntas_verificacion() y las respuestas solo
-- se comparan dentro de verificar_respuestas(), ambas SECURITY DEFINER.
revoke all on public.preguntas_verif from anon, authenticated;

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
