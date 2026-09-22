-- =====================================================================
-- ChipPet · Fixture de demostración para la rama nueva de HU-03
-- Aplicar UNA SOLA VEZ, sobre una base que YA tiene el seed cargado.
-- Requiere h1 y h3 aplicadas.
--
-- Las dos verificaciones del seed son terminales (aprobada y bloqueada),
-- así que no servían para enseñar en vivo el caso en que quien encontró al
-- animal crea las preguntas. Esto añade ese escenario:
--
--   K5 · hallazgo de un perro SIN registrar (mascota_id null) abierto por
--        Andrés, con una verificación PENDIENTE que reclama Laura.
--        Al abrirla como Andrés aparece "Crea las preguntas de seguridad".
--
-- Es idempotente: si ya existe, no hace nada.
-- =====================================================================

begin;

insert into public.casos
  (id, mascota_id, creador_id, tipo, estado, lat, lng, direccion_texto, ocurrido_en, descripcion, radio_km, ultima_actividad_en, creado_en)
values
  ('c0000000-0000-0000-0000-000000000005', null, '22222222-2222-2222-2222-222222222222', 'HALLAZGO', 'EN_VERIFICACION',
   1.2100, -77.2900, 'Parque Bolívar', now() - interval '8 hours',
   'Perro mediano sin placa ni collar. Lo tengo en casa mientras aparece su dueño.', 5,
   now() - interval '7 hours', now() - interval '8 hours')
on conflict (id) do nothing;

insert into public.verificaciones
  (id, caso_id, reclamante_id, verificador_id, coincidencia_id, estado, intentos, superada, creado_en, resuelta_en)
values
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   null, 'PENDIENTE', 0, false, now() - interval '6 hours', null)
on conflict (id) do nothing;

-- Aviso para que el escenario se vea también desde la campana.
insert into public.notificaciones (usuario_id, titulo, cuerpo, enlace, leida_en, creado_en)
select '22222222-2222-2222-2222-222222222222',
       'Crea las preguntas de verificación',
       'Esta mascota no tiene datos reservados. Mira al animal y escribe 3 preguntas que solo su dueño sabría responder.',
       '/verificacion/e0000000-0000-0000-0000-000000000003',
       null, now() - interval '6 hours'
 where not exists (
   select 1 from public.notificaciones
    where usuario_id = '22222222-2222-2222-2222-222222222222'
      and enlace = '/verificacion/e0000000-0000-0000-0000-000000000003');

commit;
