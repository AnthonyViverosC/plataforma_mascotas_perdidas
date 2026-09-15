# ChipPet · Plataforma de mascotas perdidas

Aplicación web para encontrar mascotas perdidas: los dueños reportan la pérdida, los ciudadanos reportan hallazgos, un **motor de coincidencias** cruza ambos reportes y, antes de entregar al animal, el sistema **verifica al dueño** con preguntas reservadas que nunca salen de la base de datos.

**Stack:** React 18 + Vite + TypeScript + Tailwind CSS · Supabase (Auth, PostgreSQL, Storage, RLS, Realtime) · Leaflet + OpenStreetMap · Zod · Vitest.
No hay servidor propio: toda la lógica sensible vive en PostgreSQL (RLS, triggers y funciones `SECURITY DEFINER`).

---

## 1. Decisiones tomadas

1. **El motor corre en el cliente** (`src/lib/matching.ts`, funciones puras) y se persiste con la RPC `guardar_coincidencias()`, que vuelve a validar especie, umbral (≥ 35) y que quien llama sea dueño del caso o autor del reporte. Usa `ON CONFLICT DO NOTHING`, así una coincidencia **descartada nunca vuelve a sugerirse**.
2. **Retroactividad.** Un cruce es retroactivo cuando el reporte se **publicó antes de crearse el caso**. En ese modo la ventana de descarte pasa de 7 a 90 días. Así se resuelve la contradicción entre la regla de los 7 días y la prueba T-03 (hallazgo 30 días antes → coincidencia retroactiva).
3. El criterio de tiempo usa la diferencia absoluta en horas. En raza, “mestizo” o vacía (10 puntos) tiene prioridad sobre la coincidencia exacta. El puntaje se redondea a entero; los motivos muestran 1 decimal.
4. **Ubicación exacta protegida por privilegios de columna.** Ningún rol del cliente puede leer `casos.lat` ni `casos.lng`. El creador los obtiene con `ubicacion_exacta_caso()`. La ficha pública usa la vista `casos_publicos`, que incluye los casos cerrados para que la URL `/caso/:id` siga funcionando después del cierre.
5. El desplazamiento público es de **100 a 300 m** (el mínimo de 100 m evita que el punto público quede sobre el real). Se calcula una sola vez en un trigger y no se puede modificar después.
6. `perfiles_publicos` (solo `id`, `nombre`, `rol`) es legible también para visitantes anónimos, para mostrar la autoría en la ficha pública. El teléfono **nunca** se expone; solo lo ven las dos partes de una verificación superada, con `contactos_verificacion()`.
7. **Columnas añadidas** al modelo pedido: `verificaciones.verificador_id`, `coincidencia_id` y `superada`; `respuestas_verif.intento` y `coincide_auto`; `lecturas_microchip.anulada_en`; `coincidencias.creado_en`.
8. **Roles en la verificación:** el *reclamante* es el propietario registrado de la mascota. El *verificador* es quien encontró al animal: el autor del reporte confirmado, el veterinario que leyó el microchip o el creador del caso de hallazgo. El intento se supera con ≥ 2 de 3 aciertos. Además, quien encontró al animal marca cada respuesta a mano antes de aprobar.
9. Si se lee el microchip de una mascota registrada que **no** tiene caso abierto, se crea un caso de tipo `HALLAZGO` a nombre del veterinario y se notifica al propietario.
10. Solo los roles `PROPIETARIO` y `ADMIN` pueden registrar mascotas y crear casos de pérdida (lo exige RLS). El rol `ADMIN` no se puede elegir al registrarse.
11. **Estados:** confirmar una coincidencia deja el caso en `EN_VERIFICACION`; aprobar la entrega lo pasa a `RESUELTO`; el dueño lo cierra con un desenlace (`CERRADO`). Un rechazo o un bloqueo lo devuelven a `ABIERTO`.
12. **Los eventos y las notificaciones se generan en la base de datos** con triggers y funciones. El cliente solo puede insertar eventos `AVISTAMIENTO` y `CAMBIO_DATOS`. Un trigger bloquea `UPDATE`, `DELETE` y `TRUNCATE` sobre `eventos` para cualquier rol, incluidos `service_role` y `postgres`.
13. El mínimo de 3 datos reservados y el rango de 1 a 6 fotos se garantizan con *constraint triggers* diferidos y con la RPC atómica `guardar_mascota()`. Esta RPC es `SECURITY INVOKER`, así que también pasa por RLS.
14. Las respuestas reservadas se guardan normalizadas: minúsculas, sin tildes ni signos y con los espacios colapsados.
15. Los colores salen de una lista fija para que el criterio de color sea comparable.
16. El “estado en tiempo real” de la verificación se actualiza consultando cada 8 s. Las notificaciones usan Supabase Realtime.
17. Zona horaria `America/Bogota`. El centro de los mapas y de los datos de prueba es Pasto, Nariño.
18. Las fotos del *seed* son URLs públicas de ejemplo (loremflickr). Las fotos que suben los usuarios van al bucket `fotos`.
19. El diseño visual sigue la captura de referencia: tarjetas blancas, etiquetas en mayúsculas, botón primario negro, acentos verde azulado y rojo.

---

## 2. Requisitos

- Node.js 18 o superior (probado con Node 24) y npm.
- Una cuenta gratuita en [supabase.com](https://supabase.com).

## 3. Crear el proyecto en Supabase

1. Crea un proyecto nuevo en Supabase y espera a que termine de aprovisionarse.
2. **Authentication → Sign In / Providers → Email**: deja activo *Email* y **desactiva “Confirm email”** para la demo. Si lo dejas activo, cada cuenta nueva debe confirmar su correo antes de entrar.
3. **SQL Editor**: pega y ejecuta cada archivo **en este orden**, uno por uno:

   | Orden | Archivo | Contenido |
   |---|---|---|
   | 1 | `supabase/schema.sql` | Enums, tablas, restricciones, índices y vistas |
   | 2 | `supabase/funciones.sql` | `distancia_km`, `verificar_respuestas`, triggers y RPC |
   | 3 | `supabase/politicas.sql` | Privilegios, RLS y bucket `fotos` con sus políticas |
   | 4 | `supabase/seed.sql` | Datos de prueba (ejecútalo **una sola vez**) |

4. **Project Settings → API**: copia la *Project URL* y la clave *anon public*.

> `schema.sql` añade la tabla `notificaciones` a la publicación `supabase_realtime`. Si tu proyecto no tiene esa publicación, actívala en **Database → Publications**.

## 4. Variables de entorno

Copia `.env.example` como `.env` y completa los valores:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

## 5. Levantar el proyecto

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # pruebas del motor (Vitest)
npm run lint       # ESLint
npm run build      # verificación de tipos + build de producción
```

### Despliegue en Vercel

El proyecto ya incluye `vercel.json` (build de Vite y *rewrite* SPA para que `/caso/:id` funcione al recargar).

1. Crea el `.env` con `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `SUPABASE_DB_URL` (*Session pooler*, en **Connect** dentro del panel de Supabase). Luego ejecuta `npm run db:aplicar`: aplica los 4 SQL en orden y se niega a correr si el esquema ya existe.
2. En Vercel, agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en *Production*, *Preview* y *Development*. `SUPABASE_DB_URL` **no** va a Vercel.
3. Despliega con `vercel --prod` o haz *push* a `main` (el repo está conectado).
4. En Supabase, en **Authentication → URL Configuration**, pon la URL de Vercel como *Site URL*.

## 6. Credenciales de prueba

Todas las cuentas usan la contraseña **`Prueba2026!`**

| Rol | Correo | Nombre |
|---|---|---|
| Propietario | `propietario@chippet.test` | Laura Gómez |
| Ciudadano | `ciudadano@chippet.test` | Andrés Ruiz |
| Veterinario | `veterinario@chippet.test` | Dra. Paula Ortiz |
| Administrador | `admin@chippet.test` | Administración ChipPet |

**Datos sembrados**

| Id | Qué es |
|---|---|
| `c0000000-0000-0000-0000-000000000001` | **Max** (perdido). Coincidencias con R1 = **93** (misma raza, 1 km, 6 h) y R5 = **70** (retroactiva) |
| `c0000000-0000-0000-0000-000000000002` | **Luna** (perdida). R2 da ≈ 20 puntos (**debajo del umbral**, no se guarda) · verificación **BLOQUEADA** |
| `c0000000-0000-0000-0000-000000000003` | **Rocky** (perdido). Al pulsar *Recalcular* aparece R3 (≈ 68) |
| `c0000000-0000-0000-0000-000000000004` | **Nina** (resuelto). Lectura de microchip + verificación **APROBADA** con constancia |
| `e0000000-0000-0000-0000-000000000001` | Verificación aprobada (Nina) |
| `e0000000-0000-0000-0000-000000000002` | Verificación bloqueada tras 3 intentos (Luna) |

**Respuestas reservadas**, necesarias para la demo de HU-03:

| Mascota | Respuestas |
|---|---|
| Max | pato amarillo · oreja izquierda · galleta |
| Luna | ratón gris · mancha en la cola · michi |
| Rocky | pelota roja · trasera derecha · paseo |
| Nina | azul · en el pecho · san roque |
| Simón | pluma · bigote cortado · atún |

**Microchips:** Max `981098102458912` · Luna `985112000000456` · Nina `900164000123789`. Lectura huérfana sembrada: `999000111222333`.

---

## 7. Guion de la sustentación

### HU-01 · Registrar la lectura de un microchip

1. Entra como **ciudadano** y abre `/veterinario`. Aparece *“No tienes permisos para esta sección”* (criterio 1). La RPC también lo rechaza: prueba T-09.
2. Cierra sesión y entra como **veterinario**. Abre *Lectura de microchip*.
3. Escribe `12345` y pulsa *Registrar*. Aparece *“El microchip debe tener 15 dígitos numéricos.”* (criterio 2).
4. Muestra que la fecha y hora es automática y no se puede editar (criterio 3). Escribe `981098102458912` (Max), el establecimiento *Clínica San Roque* y marca el punto en el mapa. Pulsa *Registrar lectura*.
5. Aparece el aviso *“Microchip registrado: Max · la lectura se asoció a su caso abierto y se notificó al propietario”*. Pulsa *Ver caso*: el historial muestra **Lectura de microchip** (criterio 4).
6. Registra `123456789012345`. Aparece *“Microchip no registrado… hallazgo huérfano”* (criterio 5).
7. En *Mis lecturas* pulsa *Anular lectura* sobre una de ellas. Una justificación de menos de 10 caracteres da error. Con una válida, la lectura se muestra **tachada** con el motivo, sigue en la lista y el caso registra el evento *Lectura anulada* (criterio 6).
8. Entra como **propietario**: la campana muestra *“Leyeron el microchip de Max”*.

### HU-02 · Confirmar o descartar coincidencias

1. Entra como **propietario** y abre la ficha de Max (`/caso/c0000000-0000-0000-0000-000000000001`).
2. En **Coincidencias sugeridas** hay dos tarjetas. Cada una muestra foto, zona, fecha, puntaje y el desglose en lenguaje natural (*“misma raza · mismo color · … · a 1 km · 6 horas después de la pérdida”*). La de 70 lleva la etiqueta **Retroactiva** (criterio 1).
3. En la tarjeta de 70, pulsa **No es mi mascota**. Sale de *Activas* y aparece en *Histórico*. Pulsa **Recalcular coincidencias**: no vuelve a aparecer (criterio 3, prueba T-13).
4. En la tarjeta de 93, pulsa **Es mi mascota**. Aparece el aviso con el enlace *Abrir verificación*. El caso pasa a **En verificación**, no se cierra (criterios 2 y 4).
5. El historial muestra *Coincidencia descartada*, *Coincidencia confirmada* y *Verificación iniciada*. Entra como **ciudadano**: la campana tiene *“El dueño reconoció al animal que reportaste”* (criterio 5).
6. Criterio 6: como ciudadano, la ficha de Max no muestra el bloque de coincidencias. Además, RLS devuelve 0 filas en `coincidencias` y rechaza el `UPDATE` (ver la sección 8).

### HU-03 · Verificar al dueño antes de la entrega

1. Sigue desde HU-02. Como **propietario**, abre la verificación (desde el aviso o desde *Notificaciones*). Se ven solo las 3 preguntas, nunca las respuestas.
2. Responde `pato amarillo`, `Oreja Izquierda` y `galletá` (mayúsculas y tildes no importan). Pulsa *Validar respuestas* y aparece *“Respuestas enviadas”*. Muestra en DevTools → Network que la respuesta de `verificar_respuestas` solo trae el conteo (criterio 2).
3. Entra como **ciudadano** y abre la misma verificación. Se ven las respuestas dadas con la indicación *Registro: coincide*. Marca cada una como correcta o incorrecta y pulsa **Aprobar entrega** (criterio 3).
4. Aparece la **Constancia de verificación** (caso, fecha, resultado y preguntas acertadas) con el botón **Imprimir** (criterio 6). El aviso legal está visible arriba y en la constancia (criterio 7).
5. **Bloqueo** (criterio 5): abre `/verificacion/e0000000-0000-0000-0000-000000000002` como propietario: está *Bloqueada*, con intentos 3/3 y sin formulario. Para hacerlo en vivo, sigue la prueba T-10.
6. Criterio 4: en `/caso/:id`, un visitante no ve preguntas ni datos reservados. Solo los participantes las obtienen con `preguntas_verificacion()`.

### HU-04 · Ficha única del caso con historial

1. En una ventana de incógnito (sin sesión), abre `/caso/c0000000-0000-0000-0000-000000000004` (Nina). La ficha se ve completa, sin teléfono, con el mapa en **ubicación aproximada (±300 m)** y el microchip enmascarado (criterios 5 y 6).
2. La línea de tiempo está en orden descendente. Cada entrada tiene icono por tipo, etiqueta, fecha, hora y autor (*Por: Andrés Ruiz (Ciudadano)*), y no hay ningún botón de editar ni borrar (criterios 2, 3 y 4).
3. **Paginación** (criterio 7): para demostrarla, genera más de 20 eventos en el SQL Editor:
   ```sql
   insert into eventos (caso_id, tipo, autor_id, descripcion, creado_en)
   select 'c0000000-0000-0000-0000-000000000003', 'AVISTAMIENTO', '22222222-2222-2222-2222-222222222222',
          'Avistamiento de prueba #' || g, now() - (g || ' minutes')::interval
   from generate_series(1, 25) g;
   ```
   Abre el caso de Rocky: se ven 20 eventos y el botón *Ver 20 eventos anteriores*.
4. Como **propietario**, en el caso de Max pulsa **Ampliar radio** y elige 10 km. El historial registra *Radio de búsqueda ampliado de 5 km a 10 km* y el motor se vuelve a ejecutar.
5. Pulsa **Cerrar caso**, elige *Reencontrada* y confirma. El caso queda **Cerrado**, el historial registra *Cierre del caso* y la misma URL sigue abriendo la ficha (criterios 1 y 8).

---

## 8. Pruebas

### Automatizadas: `npm run test`

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| T-01 | Misma raza, 1 km, 6 h después | Puntaje ≥ 80 con motivos desglosados | ✅ 93 |
| T-02 | Especies distintas | Sin coincidencia | ✅ |
| T-03 | Hallazgo 30 días antes de la pérdida | Coincidencia marcada como retroactiva | ✅ |
| T-04 | Puntaje 34 | No se crea la coincidencia | ✅ |
| T-05 | Microchip idéntico | Puntaje 100 | ✅ |

### Manuales

Para simular un usuario desde el **SQL Editor**, ejecuta el bloque dentro de una transacción que termine en `rollback`:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}'; -- ciudadano
-- … consulta de la prueba …
rollback;
```

| ID | Cómo | Resultado esperado |
|---|---|---|
| T-06 | Como ciudadano: `select * from datos_reservados where mascota_id = 'a0000000-0000-0000-0000-000000000001';` | **0 filas** (RLS). Como `anon` da *permission denied* |
| T-07 | En la UI, deja vacía una de las 3 respuestas: *“Escribe la respuesta de cada dato reservado.”* Por SQL, como propietario (`sub` = `1111…`): `select guardar_mascota(null, '{"nombre":"X","especie":"PERRO","color_principal":"Negro","tamano":"GRANDE"}', '[{"url":"https://ejemplo.com/a.jpg"}]', '[{"pregunta":"¿Pregunta uno?","respuesta":"a"},{"pregunta":"¿Pregunta dos?","respuesta":"b"}]');` | Rechazo: *“Debes registrar al menos 3 datos reservados”* |
| T-08 | Registra una mascota con el microchip `981098102458912` | *“Ese microchip ya está registrado en otra mascota.”* (índice único) |
| T-09 | Como ciudadano: `insert into lecturas_microchip (veterinario_id, codigo, lat, lng, establecimiento) values ('22222222-2222-2222-2222-222222222222','981098102458912',1.2,-77.2,'X');` y también `select registrar_lectura('981098102458912',1.2,-77.2,'X');` | *new row violates row-level security policy* y *“Solo el personal veterinario…”* |
| T-10 | Crea una verificación pendiente (HU-02: *Recalcular* en Rocky → confirmar R3). Como propietario, responde mal 3 veces | Estado **BLOQUEADA**, formulario deshabilitado y notificación *“Verificación bloqueada”* al propietario |
| T-11 | Como ciudadano: `update eventos set descripcion = 'x';`. Como `postgres`: `update eventos set descripcion = 'x';` | *permission denied* y, en el segundo caso, *“El historial del caso es inmutable…”* |
| T-12 | Abre `/caso/c0000000-0000-0000-0000-000000000001` sin sesión | La ficha se ve, sin teléfono ni ubicación exacta. Además, `select lat from casos` como `anon` da *permission denied* |
| T-13 | HU-02 paso 3: descartar y luego *Recalcular coincidencias* | La coincidencia no vuelve a aparecer |
| T-14 | En `/casos/nuevo`, Max aparece deshabilitado *(ya tiene un caso abierto)*. Por SQL, como propietario: `insert into casos (mascota_id, creador_id, tipo, lat, lng, ocurrido_en) values ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PERDIDA',1.2,-77.2, now());` | Rechazo por `casos_una_perdida_abierta_idx`. En la app: *“Esta mascota ya tiene un caso de pérdida abierto.”* |
| T-15 | Sube una foto de 8 MB en *Registrar mascota* | *“"foto.jpg" pesa 8 MB. El máximo permitido es 5 MB.”* El bucket también limita a 5 MB |

---

## 9. Estructura

```
src/
  componentes/   Boton, Campo, Mapa, SubirFotos, LineaTiempo, TarjetaCoincidencia, Campana,
                 TarjetaCaso, Layout, RutaProtegida, ProveedorSesion, Iconos, ui
  paginas/       Inicio, Registro, Login, Panel, MascotaFormulario, NuevoCaso, Caso, Reportar,
                 Buscar, Verificacion, Veterinario, Notificaciones, NoEncontrada
  lib/           supabase, matching, geo, validacion, eventos, notificaciones, cruces, fotos, formato
  hooks/         useSesion, useMisCasos, useCoincidencias, useNotificaciones (+ sesionContexto)
  tipos/         tipos.ts
supabase/        schema.sql, funciones.sql, politicas.sql, seed.sql
tests/           matching.test.ts
```

---

## 10. Trazabilidad: historia → archivos → prueba

| Historia | Dónde quedó implementada | Cómo se verifica |
|---|---|---|
| **A · Cuentas y roles** | `paginas/Registro.tsx`, `paginas/Login.tsx`, `componentes/ProveedorSesion.tsx`, `componentes/RutaProtegida.tsx`, `lib/validacion.ts` (`registroSchema`) · `funciones.sql` (`crear_perfil_nuevo_usuario`) · `politicas.sql` (perfiles) | Registro con contraseña débil o sin marcar el consentimiento (mensajes específicos); ruta `/veterinario` con otro rol |
| **B · Registrar mascota** | `paginas/MascotaFormulario.tsx`, `componentes/SubirFotos.tsx`, `lib/fotos.ts`, `lib/validacion.ts` (`mascotaSchema`, `validarFoto`) · `funciones.sql` (`guardar_mascota`, `validar_integridad_mascota`, `normalizar_dato_reservado`) · `componentes/ui.tsx` (`AvisoManejo`) | T-06, T-07, T-08, T-15 · aviso destacado en la ficha de Luna o Rocky |
| **C · Reportar pérdida** | `paginas/NuevoCaso.tsx`, `lib/cruces.ts` (`ejecutarCrucesDeCaso`) · `funciones.sql` (`casos_antes_insertar`, `casos_despues_insertar`) · `schema.sql` (`casos_una_perdida_abierta_idx`) | T-14 · resultados del motor al publicar |
| **D · Reportar hallazgo** | `paginas/Reportar.tsx` (2 pantallas), `lib/cruces.ts` (`ejecutarCrucesDeReporte`) · `politicas.sql` (reportes) | Publicar un reporte cerca de Max y ver los casos parecidos |
| **E · Motor de coincidencias** | `lib/matching.ts`, `lib/geo.ts`, `lib/cruces.ts` · `funciones.sql` (`guardar_coincidencias`, `distancia_km`) | `tests/matching.test.ts` (T-01 a T-05) · T-13 |
| **F · Notificaciones** | `componentes/Campana.tsx`, `paginas/Notificaciones.tsx`, `hooks/useNotificaciones.ts`, `lib/notificaciones.ts` · `funciones.sql` (`_notificar` en cada trigger o RPC) | Campana tras cada paso del guion |
| **HU-01 · Lectura de microchip** | `paginas/Veterinario.tsx` · `funciones.sql` (`registrar_lectura`, `anular_lectura`, `lecturas_proteger`, `_vincular_lecturas`) · `politicas.sql` (`lecturas_insertar_veterinario`, sin UPDATE/DELETE) | Guion HU-01 · T-09 |
| **HU-02 · Confirmar o descartar** | `componentes/TarjetaCoincidencia.tsx`, `hooks/useCoincidencias.ts`, `paginas/Caso.tsx` · `funciones.sql` (`coincidencias_antes_actualizar`, `coincidencias_despues_actualizar`) · `politicas.sql` (`coincidencias_*`) | Guion HU-02 · T-13 |
| **HU-03 · Verificación de propiedad** | `paginas/Verificacion.tsx` · `funciones.sql` (`verificar_respuestas`, `preguntas_verificacion`, `resolver_verificacion`, `iniciar_verificacion`, `contactos_verificacion`) · `politicas.sql` (`verificaciones_*`, `respuestas_leer`, `reservados_solo_dueno`) | Guion HU-03 · T-06 · T-10 |
| **HU-04 · Ficha única con historial** | `paginas/Caso.tsx`, `componentes/LineaTiempo.tsx`, `componentes/Mapa.tsx`, `lib/eventos.ts` · `schema.sql` (`casos_publicos`) · `funciones.sql` (`eventos_inmutables`, `casos_despues_actualizar`) · `politicas.sql` (eventos) | Guion HU-04 · T-11 · T-12 |

