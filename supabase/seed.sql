-- =====================================================================
-- ChipPet · Mascotas perdidas
-- 4/4  seed.sql — datos de prueba para la sustentación
-- Ejecutar UNA sola vez, DESPUÉS de politicas.sql, sobre una base limpia.
--
-- Usuarios (contraseña para todos: Prueba2026!)
--   propietario@chippet.test  · PROPIETARIO  · Laura Gómez
--   ciudadano@chippet.test    · CIUDADANO    · Andrés Ruiz
--   veterinario@chippet.test  · VETERINARIO  · Dra. Paula Ortiz
--   admin@chippet.test        · ADMIN        · Administración ChipPet
--
-- Punto central: Pasto, Nariño (1.2136, -77.2811). Fechas relativas a now().
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- Usuarios (auth.users + auth.identities). El trigger crea los perfiles.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'propietario@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Laura Gómez","telefono":"3001112233","rol":"PROPIETARIO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'ciudadano@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Andrés Ruiz","telefono":"3104445566","rol":"CIUDADANO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'veterinario@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Dra. Paula Ortiz","telefono":"3207778899","rol":"VETERINARIO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
   'admin@chippet.test', extensions.crypt('Prueba2026!', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   '{"nombre":"Administración ChipPet","telefono":"3000000000","rol":"CIUDADANO","acepto_datos":true}',
   now() - interval '30 days', now(), '', '', '', '', '', '');

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');

-- ADMIN no se autoasigna en el registro: se promueve aquí.
update public.perfiles set rol = 'ADMIN' where id = '44444444-4444-4444-4444-444444444444';
update public.perfiles set zona_lat = 1.2136, zona_lng = -77.2811;

-- ---------------------------------------------------------------------
-- Mascotas (5), todas de Laura. Fotos de ejemplo externas.
-- ---------------------------------------------------------------------
insert into public.mascotas (id, propietario_id, nombre, especie, raza, color_principal, tamano, sexo, microchip, temperamento, nota_manejo, creado_en) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Max',   'PERRO', 'Pastor alemán', 'Negro',      'GRANDE',  'MACHO',  '981098102458912', 'SOCIABLE',     'Es amigable, responde a su nombre. Tiene collar rojo.', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Luna',  'GATO',  'Siamés',        'Crema',      'PEQUENO', 'HEMBRA', '985112000000456', 'HURANA',       'Se esconde en lugares altos. No la persiga: avise y espere.', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Rocky', 'PERRO', 'Mestizo',       'Café claro', 'MEDIANO', 'MACHO',  null,              'PUEDE_MORDER', 'Muerde si lo toman del cuello. Ofrézcale comida y llame al dueño.', now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Nina',  'PERRO', 'Labrador',      'Dorado',     'GRANDE',  'HEMBRA', '900164000123789', 'TRANQUILA',    null, now() - interval '25 days'),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Simón', 'GATO',  'Mestizo',       'Atigrado',   'MEDIANO', 'MACHO',  null,              'NERVIOSA',     'Se asusta con ruidos fuertes.', now() - interval '25 days');

insert into public.fotos_mascota (mascota_id, url, es_principal, orden) values
  ('a0000000-0000-0000-0000-000000000001', 'https://loremflickr.com/800/600/germanshepherd?lock=11', true, 0),
  ('a0000000-0000-0000-0000-000000000001', 'https://loremflickr.com/800/600/germanshepherd?lock=12', false, 1),
  ('a0000000-0000-0000-0000-000000000002', 'https://loremflickr.com/800/600/siamese,cat?lock=21', true, 0),
  ('a0000000-0000-0000-0000-000000000003', 'https://loremflickr.com/800/600/mutt,dog?lock=31', true, 0),
  ('a0000000-0000-0000-0000-000000000004', 'https://loremflickr.com/800/600/labrador?lock=41', true, 0),
  ('a0000000-0000-0000-0000-000000000005', 'https://loremflickr.com/800/600/tabby,cat?lock=51', true, 0);

-- 3 datos reservados por mascota (el trigger normaliza las respuestas)
insert into public.datos_reservados (mascota_id, pregunta, respuesta) values
  ('a0000000-0000-0000-0000-000000000001', '¿Cómo se llama su juguete favorito?',            'Pato amarillo'),
  ('a0000000-0000-0000-0000-000000000001', '¿En qué parte del cuerpo tiene una cicatriz?',   'Oreja izquierda'),
  ('a0000000-0000-0000-0000-000000000001', '¿Qué palabra lo hace venir corriendo?',          'Galleta'),
  ('a0000000-0000-0000-0000-000000000002', '¿Cómo se llama su juguete favorito?',            'Ratón gris'),
  ('a0000000-0000-0000-0000-000000000002', '¿Qué marca particular tiene y dónde?',           'Mancha en la cola'),
  ('a0000000-0000-0000-0000-000000000002', '¿Con qué sonido o palabra responde?',            'Michi'),
  ('a0000000-0000-0000-0000-000000000003', '¿Cuál es su juguete favorito?',                  'Pelota roja'),
  ('a0000000-0000-0000-0000-000000000003', '¿Qué pata tiene una marca blanca?',              'Trasera derecha'),
  ('a0000000-0000-0000-0000-000000000003', '¿Qué palabra lo emociona?',                      'Paseo'),
  ('a0000000-0000-0000-0000-000000000004', '¿De qué color es el lazo que usa en casa?',      'Azul'),
  ('a0000000-0000-0000-0000-000000000004', '¿Dónde tiene un lunar?',                         'En el pecho'),
  ('a0000000-0000-0000-0000-000000000004', '¿Cómo se llama la veterinaria donde la vacunan?','San Roque'),
  ('a0000000-0000-0000-0000-000000000005', '¿Cuál es su juguete favorito?',                  'Pluma'),
  ('a0000000-0000-0000-0000-000000000005', '¿Qué rasgo físico particular tiene?',            'Bigote cortado'),
  ('a0000000-0000-0000-0000-000000000005', '¿Qué comida lo hace salir de su escondite?',     'Atún');

-- ---------------------------------------------------------------------
-- Casos. Se desactiva el trigger que genera el evento de creación con now()
-- para registrar el historial con sus fechas reales.
-- ---------------------------------------------------------------------
alter table public.casos disable trigger casos_despues_insertar;

insert into public.casos (id, mascota_id, creador_id, tipo, estado, lat, lng, direccion_texto, ocurrido_en, descripcion, radio_km, ultima_actividad_en, creado_en) values
  -- K1 · Max · par de puntaje ALTO con R1
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'ABIERTO',
   1.2136, -77.2811, 'Parque Infantil', now() - interval '24 hours',
   'Se soltó de la correa mientras paseábamos en el parque. Lleva collar rojo sin placa.', 5, now() - interval '23 hours', now() - interval '23 hours'),
  -- K2 · Luna · par por DEBAJO del umbral con R2; verificación bloqueada
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'ABIERTO',
   1.2230, -77.2750, 'Barrio Las Cuadras', now() - interval '48 hours',
   'Salió por la ventana del segundo piso durante la noche.', 5, now() - interval '47 hours', now() - interval '47 hours'),
  -- K3 · Rocky
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'ABIERTO',
   1.1950, -77.3000, 'Sector Potrerillo', now() - interval '74 hours',
   'Se asustó con pólvora y saltó la reja.', 3, now() - interval '73 hours', now() - interval '73 hours'),
  -- K4 · Nina · resuelto con verificación aprobada
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'PERDIDA', 'RESUELTO',
   1.2350, -77.2950, 'Avenida Panamericana', now() - interval '6 days',
   'Se perdió cerca de la avenida al abrirse el portón.', 5, now() - interval '4 days', now() - interval '6 days' + interval '1 hour'),
  -- K5 · hallazgo de un animal SIN registrar: aquí las preguntas las crea
  -- quien lo encontró, porque no hay datos reservados de ningún dueño (HU-03).
  ('c0000000-0000-0000-0000-000000000005', null, '22222222-2222-2222-2222-222222222222', 'HALLAZGO', 'EN_VERIFICACION',
   1.2100, -77.2900, 'Parque Bolívar', now() - interval '8 hours',
   'Perro mediano sin placa ni collar. Lo tengo en casa mientras aparece su dueño.', 5, now() - interval '7 hours', now() - interval '8 hours');

alter table public.casos enable trigger casos_despues_insertar;

-- ---------------------------------------------------------------------
-- Reportes (8) de Andrés alrededor del punto central
-- ---------------------------------------------------------------------
insert into public.reportes (id, autor_id, especie, raza, color, tamano, sexo, estado_animal, lat, lng, ocurrido_en, nota, foto_url, creado_en) values
  -- R1 · 1 km al este de K1, 6 h después → puntaje 93
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'PERRO', 'Pastor alemán', 'Negro', 'GRANDE', 'MACHO', 'SIGUE_EN_LUGAR',
   1.2136, -77.272115, now() - interval '18 hours', 'Collar rojo, está echado frente a una panadería.', 'https://loremflickr.com/800/600/germanshepherd?lock=13', now() - interval '17 hours'),
  -- R2 · 4 km al sur de K2, gato distinto → puntaje ≈ 20 (no se guarda)
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'GATO', 'Persa', 'Blanco', 'GRANDE', 'MACHO', 'SE_FUE',
   1.187027, -77.2750, now() - interval '1 hour', 'Gato blanco de pelo largo cruzando la calle.', 'https://loremflickr.com/800/600/persian,cat?lock=22', now() - interval '50 minutes'),
  -- R3 · 1,5 km al sur de K3 (se descubre al recalcular K3)
  ('b0000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'PERRO', 'Mestizo', 'Café claro', 'MEDIANO', null, 'SE_FUE',
   1.181510, -77.3000, now() - interval '54 hours', 'Perro asustado corriendo hacia el río.', 'https://loremflickr.com/800/600/mutt,dog?lock=32', now() - interval '50 hours'),
  -- R4 · 500 m al este de K2 → coincidencia confirmada (verificación bloqueada)
  ('b0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'GATO', 'Siamés', 'Crema', 'PEQUENO', 'HEMBRA', 'LO_RECOGI',
   1.2230, -77.270502, now() - interval '38 hours', 'La tengo en casa, está tranquila.', 'https://loremflickr.com/800/600/siamese,cat?lock=23', now() - interval '37 hours'),
  -- R5 · 1,5 km al norte de K1, publicado ANTES del caso → coincidencia retroactiva (70)
  ('b0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'PERRO', null, 'Negro', 'GRANDE', null, 'SE_FUE',
   1.227090, -77.2811, now() - interval '72 hours', 'Perro grande negro sin collar.', 'https://loremflickr.com/800/600/blackdog?lock=14', now() - interval '71 hours'),
  -- R6 · conejo
  ('b0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'OTRO', 'Conejo', 'Blanco', 'PEQUENO', null, 'LO_RECOGI',
   1.2000, -77.2700, now() - interval '5 days', 'Conejo blanco en un jardín.', 'https://loremflickr.com/800/600/rabbit?lock=61', now() - interval '5 days'),
  -- R7 · gato atigrado
  ('b0000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'GATO', 'Mestizo', 'Atigrado', 'MEDIANO', 'MACHO', 'REQUIERE_ATENCION',
   1.2400, -77.2650, now() - interval '7 days', 'Tiene una pata lastimada.', 'https://loremflickr.com/800/600/tabby,cat?lock=52', now() - interval '7 days' + interval '2 hours'),
  -- R8 · 800 m al oeste de K4 → coincidencia confirmada (verificación aprobada)
  ('b0000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'PERRO', 'Labrador', 'Dorado', 'GRANDE', 'HEMBRA', 'LO_RECOGI',
   1.2350, -77.302196, now() - interval '5 days', 'Labradora muy dócil, la llevé a la veterinaria.', 'https://loremflickr.com/800/600/labrador?lock=42', now() - interval '5 days' + interval '1 hour');

-- ---------------------------------------------------------------------
-- Lecturas de microchip: 1 de mascota registrada (Nina) y 1 huérfana
-- ---------------------------------------------------------------------
insert into public.lecturas_microchip (id, veterinario_id, codigo, mascota_id, caso_id, lat, lng, establecimiento, leido_por, leido_en, creado_en) values
  ('f0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '900164000123789',
   'a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004',
   1.2320, -77.3010, 'Clínica Veterinaria San Roque', 'Dra. Paula Ortiz', now() - interval '5 days' + interval '3 hours', now() - interval '5 days' + interval '3 hours'),
  -- Lectura huérfana y sin ubicación: se hizo en el mostrador de la clínica.
  ('f0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', '999000111222333',
   null, null,
   null, null, 'Clínica Veterinaria San Roque', 'Dra. Paula Ortiz', now() - interval '2 days', now() - interval '2 days');

-- ---------------------------------------------------------------------
-- Coincidencias
-- ---------------------------------------------------------------------
insert into public.coincidencias (id, caso_id, reporte_id, puntaje, motivos, estado, retroactiva, creado_en, decidida_en) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 93,
   '[{"criterio":"DISTANCIA","aporte":24,"detalle":"a 1 km"},{"criterio":"TIEMPO","aporte":19.3,"detalle":"6 horas después de la pérdida"},{"criterio":"RAZA","aporte":20,"detalle":"misma raza"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"},{"criterio":"SEXO","aporte":5,"detalle":"mismo sexo"}]',
   'SUGERIDA', false, now() - interval '17 hours', null),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', 70,
   '[{"criterio":"DISTANCIA","aporte":21,"detalle":"a 1,5 km"},{"criterio":"TIEMPO","aporte":14.3,"detalle":"2 días antes de la pérdida"},{"criterio":"RAZA","aporte":10,"detalle":"raza compatible (mestizo o sin dato)"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"}]',
   'SUGERIDA', true, now() - interval '23 hours', null),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 96,
   '[{"criterio":"DISTANCIA","aporte":27,"detalle":"a 500 m"},{"criterio":"TIEMPO","aporte":18.8,"detalle":"10 horas después de la pérdida"},{"criterio":"RAZA","aporte":20,"detalle":"misma raza"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"},{"criterio":"SEXO","aporte":5,"detalle":"mismo sexo"}]',
   'CONFIRMADA', false, now() - interval '37 hours', now() - interval '36 hours'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000008', 92,
   '[{"criterio":"DISTANCIA","aporte":25.2,"detalle":"a 800 m"},{"criterio":"TIEMPO","aporte":17.1,"detalle":"24 horas después de la pérdida"},{"criterio":"RAZA","aporte":20,"detalle":"misma raza"},{"criterio":"COLOR","aporte":15,"detalle":"mismo color"},{"criterio":"TAMANO","aporte":10,"detalle":"mismo tamaño"},{"criterio":"SEXO","aporte":5,"detalle":"mismo sexo"}]',
   'CONFIRMADA', false, now() - interval '5 days' + interval '1 hour', now() - interval '4 days');

-- ---------------------------------------------------------------------
-- Verificaciones: 1 aprobada (Nina) y 1 bloqueada por 3 intentos (Luna)
-- ---------------------------------------------------------------------
insert into public.verificaciones (id, caso_id, reclamante_id, verificador_id, coincidencia_id, estado, intentos, superada, creado_en, resuelta_en) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000004', 'APROBADA', 1, true, now() - interval '4 days', now() - interval '4 days' + interval '2 hours'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000003', 'BLOQUEADA', 3, false, now() - interval '36 hours', now() - interval '33 hours'),
  -- Pendiente sobre K5: Andrés todavía no ha creado las preguntas. Es el
  -- fixture de la rama nueva de HU-03 para la sustentación.
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   null, 'PENDIENTE', 0, false, now() - interval '6 hours', null);

-- Respuestas de la verificación aprobada (intento 1, las 3 correctas)
insert into public.respuestas_verif (verificacion_id, dato_reservado_id, intento, respuesta_dada, coincide_auto, correcta, creado_en)
select 'e0000000-0000-0000-0000-000000000001', d.id, 1, x.dada, true, true, now() - interval '4 days' + interval '1 hour'
  from public.datos_reservados d
  join (values ('azul', 'Azul'), ('en el pecho', 'En el pecho'), ('san roque', 'San Roque')) as x(resp, dada) on x.resp = d.respuesta
 where d.mascota_id = 'a0000000-0000-0000-0000-000000000004';

-- Respuestas de la verificación bloqueada (3 intentos fallidos)
insert into public.respuestas_verif (verificacion_id, dato_reservado_id, intento, respuesta_dada, coincide_auto, correcta, creado_en)
select 'e0000000-0000-0000-0000-000000000002', d.id, i.n,
       case i.n when 1 then 'Pelota' when 2 then 'Cascabel' else 'No recuerdo' end,
       false, null, now() - interval '36 hours' + (i.n || ' hours')::interval
  from public.datos_reservados d
 cross join (values (1), (2), (3)) as i(n)
 where d.mascota_id = 'a0000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------
-- Historial (eventos) con fechas reales
-- ---------------------------------------------------------------------
insert into public.eventos (caso_id, tipo, autor_id, descripcion, creado_en) values
  -- K1 · Max
  ('c0000000-0000-0000-0000-000000000001', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Max.', now() - interval '23 hours'),
  ('c0000000-0000-0000-0000-000000000001', 'COINCIDENCIA_SUGERIDA', '11111111-1111-1111-1111-111111111111', 'Posible coincidencia con un reporte de avistamiento (puntaje 70/100), publicado antes del caso.', now() - interval '23 hours' + interval '1 minute'),
  ('c0000000-0000-0000-0000-000000000001', 'COINCIDENCIA_SUGERIDA', '22222222-2222-2222-2222-222222222222', 'Posible coincidencia con un reporte de avistamiento (puntaje 93/100).', now() - interval '17 hours'),
  -- K2 · Luna
  ('c0000000-0000-0000-0000-000000000002', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Luna.', now() - interval '47 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'COINCIDENCIA_SUGERIDA', '22222222-2222-2222-2222-222222222222', 'Posible coincidencia con un reporte de hallazgo (puntaje 96/100).', now() - interval '37 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'COINCIDENCIA_CONFIRMADA', '11111111-1111-1111-1111-111111111111', 'El propietario confirmó que el reporte corresponde a Luna (puntaje 96/100).', now() - interval '36 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_INICIADA', '11111111-1111-1111-1111-111111111111', 'Se inició la verificación de propiedad antes de la entrega.', now() - interval '36 hours' + interval '1 second'),
  ('c0000000-0000-0000-0000-000000000002', 'CAMBIO_ESTADO', '11111111-1111-1111-1111-111111111111', 'Estado del caso: abierto → en verificación.', now() - interval '36 hours' + interval '2 seconds'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_INTENTO', '11111111-1111-1111-1111-111111111111', 'Intento de verificación fallido (1 de 3).', now() - interval '35 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_INTENTO', '11111111-1111-1111-1111-111111111111', 'Intento de verificación fallido (2 de 3).', now() - interval '34 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'VERIFICACION_BLOQUEADA', '11111111-1111-1111-1111-111111111111', 'Verificación bloqueada tras 3 intentos fallidos del mismo reclamante.', now() - interval '33 hours'),
  ('c0000000-0000-0000-0000-000000000002', 'CAMBIO_ESTADO', null, 'Estado del caso: en verificación → abierto.', now() - interval '33 hours' + interval '1 second'),
  -- K3 · Rocky
  ('c0000000-0000-0000-0000-000000000003', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Rocky.', now() - interval '73 hours'),
  -- K4 · Nina
  ('c0000000-0000-0000-0000-000000000004', 'CREACION', '11111111-1111-1111-1111-111111111111', 'Se reportó la pérdida de Nina.', now() - interval '6 days' + interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'COINCIDENCIA_SUGERIDA', '22222222-2222-2222-2222-222222222222', 'Posible coincidencia con un reporte de hallazgo (puntaje 92/100).', now() - interval '5 days' + interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'LECTURA_MICROCHIP', '33333333-3333-3333-3333-333333333333', 'Lectura del microchip •••••••••••3789 en Clínica Veterinaria San Roque.', now() - interval '5 days' + interval '3 hours'),
  ('c0000000-0000-0000-0000-000000000004', 'COINCIDENCIA_CONFIRMADA', '11111111-1111-1111-1111-111111111111', 'El propietario confirmó que el reporte corresponde a Nina (puntaje 92/100).', now() - interval '4 days'),
  ('c0000000-0000-0000-0000-000000000004', 'VERIFICACION_INICIADA', '11111111-1111-1111-1111-111111111111', 'Se inició la verificación de propiedad antes de la entrega.', now() - interval '4 days' + interval '1 second'),
  ('c0000000-0000-0000-0000-000000000004', 'CAMBIO_ESTADO', '11111111-1111-1111-1111-111111111111', 'Estado del caso: abierto → en verificación.', now() - interval '4 days' + interval '2 seconds'),
  ('c0000000-0000-0000-0000-000000000004', 'VERIFICACION_INTENTO', '11111111-1111-1111-1111-111111111111', 'El reclamante respondió las preguntas de seguridad (intento 1 de 3). Pendiente de revisión.', now() - interval '4 days' + interval '1 hour'),
  ('c0000000-0000-0000-0000-000000000004', 'VERIFICACION_APROBADA', '22222222-2222-2222-2222-222222222222', 'Entrega aprobada: 3 de 3 respuestas marcadas como correctas.', now() - interval '4 days' + interval '2 hours'),
  ('c0000000-0000-0000-0000-000000000004', 'CAMBIO_ESTADO', '22222222-2222-2222-2222-222222222222', 'Estado del caso: en verificación → resuelto.', now() - interval '4 days' + interval '2 hours' + interval '1 second');

-- ---------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------
insert into public.notificaciones (usuario_id, titulo, cuerpo, enlace, leida_en, creado_en) values
  ('11111111-1111-1111-1111-111111111111', 'Posible coincidencia para Max', 'Encontramos un reporte con puntaje 93/100. Revísalo y decide si es tu mascota.', '/caso/c0000000-0000-0000-0000-000000000001#coincidencias', null, now() - interval '17 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Posible coincidencia para Max', 'Encontramos un reporte con puntaje 70/100. Revísalo y decide si es tu mascota.', '/caso/c0000000-0000-0000-0000-000000000001#coincidencias', null, now() - interval '23 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Verificación bloqueada', 'Se bloqueó una verificación sobre Luna tras 3 intentos fallidos. Si no fuiste tú, revisa tu cuenta.', '/verificacion/e0000000-0000-0000-0000-000000000002', null, now() - interval '33 hours'),
  ('22222222-2222-2222-2222-222222222222', 'Verificación bloqueada', 'El reclamante falló 3 intentos. No entregues al animal a esta persona.', '/verificacion/e0000000-0000-0000-0000-000000000002', now() - interval '30 hours', now() - interval '33 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Leyeron el microchip de Nina', 'El microchip de Nina fue leído en Clínica Veterinaria San Roque.', '/caso/c0000000-0000-0000-0000-000000000004', now() - interval '5 days', now() - interval '5 days' + interval '3 hours'),
  ('11111111-1111-1111-1111-111111111111', 'Verificación aprobada', 'Quien encontró a Nina aprobó la entrega. Coordinen en un lugar público o una veterinaria.', '/verificacion/e0000000-0000-0000-0000-000000000001', now() - interval '4 days', now() - interval '4 days' + interval '2 hours');

commit;
