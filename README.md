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
6. `perfiles_publicos` (solo `id`, `nombre`, `rol`) es legible también para visitantes anónimos, para mostrar la autoría en la ficha pública. El teléfono **nunca** se expone; solo lo ven las dos partes de una verificación **aprobada**, con `contactos_verificacion()`. Superar las preguntas no basta: hasta que quien encontró al animal no aprueba la entrega, la función no devuelve ninguna fila.

    Hay una segunda vía, deliberadamente estrecha y **en un solo sentido**: `contacto_reporte()` le da al dueño de un caso el nombre y el celular de quien avistó a su mascota, para que pueda llamar. Solo funciona si ese reporte figura como coincidencia de un caso suyo, así que nadie puede ir sondeando reportes ajenos. El teléfono del **dueño** no se publica en ningún caso: si se mostrara en la ficha, la verificación de propiedad (HU-03) se quedaría sin motivo, porque ya no haría falta demostrar nada para llegar al contacto.
7. **Columnas añadidas** al modelo pedido: `verificaciones.verificador_id`, `coincidencia_id` y `superada`; `respuestas_verif.intento` y `coincide_auto`; `lecturas_microchip.anulada_en` y `leido_por`; `coincidencias.creado_en`.
8. **Roles en la verificación:** el *reclamante* es el propietario registrado de la mascota. El *verificador* es quien encontró al animal: el autor del reporte confirmado, el veterinario que leyó el microchip o el creador del caso de hallazgo. El intento se supera con ≥ 2 de 3 aciertos. Además, quien encontró al animal marca cada respuesta a mano antes de aprobar.
8.1. **Las preguntas tienen dos orígenes posibles.** Si la mascota tiene datos reservados (los definió su dueño al registrarla), se usan esos. Si no los tiene —nunca se registró, o es el hallazgo de un animal desconocido— **quien encontró al animal crea las preguntas** mirando al animal que tiene delante, con `crear_preguntas_verificacion()` sobre la tabla `preguntas_verif`. `preguntas_verificacion()` devuelve unas u otras con su `origen`, y `respuestas_verif` apunta a una de las dos fuentes (`respuestas_verif_una_fuente`). En los dos casos el reclamante no ve jamás una respuesta correcta: la comparación ocurre dentro de la base.
9. Si se lee el microchip de una mascota registrada que **no** tiene caso abierto, se crea un caso de tipo `HALLAZGO` a nombre del veterinario y se notifica al propietario. Es la **única** rama que necesita coordenadas, así que el formulario pide la ubicación solo en ese escenario; la consulta previa lo anticipa antes de guardar. `lecturas_microchip.lat/lng` son opcionales, pero `casos.lat/lng` siguen siendo obligatorios (el motor calcula distancias sin guardas y unos nulos lo llenarían de `NaN`).
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
20. **Nada de sesión a la vista.** No hay botón *Entrar* ni perfiles de demostración en la interfaz normal. Los datos de la persona se piden dentro del flujo que ya eligió: en *Reportar* son el paso 1 de 3. Ese orden no es solo preferencia, es obligatorio — la foto se sube a la carpeta `auth.uid()` del bucket (política *“fotos: subir en carpeta propia”*) y `reportes` exige `autor_id = auth.uid()`, así que sin sesión previa no hay foto ni reporte.
21. **La portada hace una sola pregunta: “¿Qué necesitas hacer?”**, con tres respuestas grandes —*Encontré una mascota*, *Perdí mi mascota*, *Ver mascotas*— y un buscador. Se quitaron el párrafo de presentación, las tres viñetas de características y el mapa de la portada: eran texto que competía con la acción. Quien llega a este sitio llega con una urgencia concreta, no a leer qué es la plataforma.
22. **Nadie choca contra una pared.** `RutaProtegida` resuelve los dos casos en el sitio, sin mandar a nadie a otra pantalla:
    - *Sin sesión*: pide el nombre y el teléfono ahí mismo, con el rol que la ruta necesita (dueño en `/casos/nuevo`, auxiliar en `/veterinario`). Es el paso 1 de *Reportar* aplicado a las seis rutas protegidas.
    - *Con el rol equivocado*: ofrece cambiarlo en un clic con `cambiar_rol()`, **conservando la sesión**, los reportes y las verificaciones. Antes esto era un callejón sin salida: quien había entrado como ciudadano y pulsaba *Perdí mi mascota* veía «Esta sección no es para tu perfil» y no tenía escapatoria, y no tenía escapatoria, porque el encabezado no ofrece ningún botón de cambiar de perfil (ver la decisión 23).

    El rol es **una etiqueta de lo que la persona viene a hacer, no un privilegio**: la misma persona encuentra un perro hoy y pierde su gato mañana. `cambiar_rol()` admite los mismos tres que el registro y rechaza `ADMIN`, igual que `crear_perfil_nuevo_usuario()`. `perfiles.rol` sigue sin ser editable por el cliente (`politicas.sql`), por eso el cambio pasa por una RPC `SECURITY DEFINER`. `/entrar` sobrevive solo como pantalla de cambio de perfil con `?demo=1`.
22.1. **El consentimiento dejó de ser una casilla.** Marcar «Acepto el tratamiento de mis datos» era lo que hacía que el formulario pareciera un alta. Ahora se informa como letra pequeña junto al botón —*«Al continuar aceptas que tratemos tu nombre, tu celular y la ubicación…»*— y se envía siempre como `acepto_datos: true`. La base lo sigue exigiendo (`perfiles.acepto_datos` tiene un `check`), así que la constancia se mantiene; lo que cambia es que ya no hay un paso que frene a la persona.
22.2. **`/casos/nuevo` dejó de estar protegido por rol.** Reportar una pérdida es ahora un asistente de tres pasos —tus datos, tu mascota, dónde se perdió— donde el paso 1 solo aparece si no hay sesión, igual que en *Reportar*. Antes eran tres pantallas encadenadas y una puerta de rol por delante. La mascota se registra dentro del mismo flujo, sin pasar por `/mascotas/nueva`, y el barrio que se pide en el paso 1 se reutiliza como zona de referencia del caso.
22.3. **El menú dejó de tener «Mi panel».** Ese «Mi» era lo último con olor a cuenta, y además duplicaba algo que ya existía: `/buscar` lista todos los casos de pérdida públicos. Así que ese hueco pasó a ser **Mascotas perdidas**, y el menú quedó con solo cuatro destinos: *Mascotas perdidas*, *Reportar hallazgo*, *Reportar pérdida* y *Lectura de microchip* (este último sí sigue limitado al rol veterinario). `/panel` **no desapareció**: sigue siendo destino al guardar una mascota (`MascotaFormulario.tsx`), al entrar por `/entrar?demo=1` y desde un enlace de notificación (`funciones.sql`, `_vincular_lecturas`). Lo que se quitó fue anunciarlo en la navegación. En la misma línea, `/buscar` abre mostrando mascotas: los ocho filtros se pliegan tras el botón *Filtrar*, porque ocupaban un tercio de la pantalla antes de que se viera un solo animal.
22.4. **Los datos se piden en cada reporte, no una vez.** El cliente usa `persistSession: true`, así que la sesión anónima sobrevivía entre reportes: en un navegador compartido, el reporte de la segunda persona salía con el nombre y el celular de la primera. Eso no era una molestia estética sino **atribución incorrecta**. Ahora *Reportar* y *Reportar pérdida* arrancan siempre en el paso de datos, con los campos vacíos. Si lo que se escribe coincide exactamente con el perfil actual se reutiliza la sesión —el dueño no pierde su caso ni sus coincidencias—; si difiere, se abre una identidad nueva. No se apagó `persistSession` porque sin ella el dueño no podría volver a confirmar coincidencias (HU-02 exige ser el creador del caso) ni responder una verificación (HU-03).
22.5. **Antes de describir un hallazgo se ofrece reconocerlo.** `/reportar` abre con una galería de las mascotas que están perdidas ahora mismo: es lo primero que haría cualquiera con el animal delante. Si se reconoce una, el reporte queda ligado a su caso y se avisa directo a su dueño; si no, *No es ninguna de estas* lleva al formulario genérico y el motor lo cruzará. Quien llega con `/reportar?caso=…` desde una ficha se salta la galería.
23. **Nadie percibe que entró a ningún sitio, sea cual sea su rol.** Por dentro sí hay una sesión anónima —sin ella RLS no dejaría insertar el reporte ni subir la foto—, pero el encabezado no muestra **nada** que la delate: ni el nombre, ni el rol, ni un botón de salir o de cambiar de perfil (`componentes/Layout.tsx`). Solo hay destinos. Primero se ocultó únicamente para el rol `CIUDADANO`, y fue un error: al reportar una pérdida la persona queda como `PROPIETARIO` y le reaparecían el nombre y el icono de salir. **Ya no queda ningún botón de cambiar de perfil en la aplicación**: para eso está `/entrar?demo=1`, que no redirige aunque haya sesión abierta. La campana del encabezado se retiró por petición expresa: los avisos siguen generándose y se consultan en `/notificaciones`, enlazado desde el menú móvil. Se descartó el reporte verdaderamente anónimo (`autor_id` nulo) porque dejaría esos reportes **fuera de la HU-03**: sin autor autenticado no hay verificador, y `coincidencias_despues_actualizar` omite crear la verificación (`funciones.sql`, guarda `v_autor is not null`).

24. **Perfil `COORDINADOR` (Sprint 2 · HU07).** Es un cuarto rol-etiqueta, como los otros: no da privilegios sobre datos de nadie. Lo único que habilita es marcar reportes como importados (`reportes.origen = 'WHATSAPP'`), cosa que el trigger `reportes_antes_guardar` rechaza a cualquier otro rol. `/importar` lo pide con `RutaProtegida`, así que quien llega sin sesión escribe su nombre y su teléfono ahí mismo, igual que en el resto de la aplicación.
25. **Los casos de WhatsApp entran como reportes, no como casos de pérdida.** Un caso de pérdida exige una mascota registrada y un dueño con sus datos reservados; un mensaje de grupo no los trae. Como reporte, el motor lo cruza con los casos de pérdida de la ciudad y con la retroactividad de siempre, que es justo lo que pide la historia («unificarlos con el resto de reportes»). Cada reporte lleva `origen_nombre` (la fundación) y la ficha muestra «Importado de WhatsApp».
    - **Lectura del texto** (`lib/whatsapp.ts`, funciones puras con pruebas): entiende la exportación de WhatsApp (`12/9/26, 3:45 p. m. - Nombre: …` y la variante de iOS con corchetes) y también texto libre separado por líneas en blanco. Descarta los avisos del sistema, los «<Multimedia omitido>» y las respuestas de menos de 15 letras. Detecta especie, color, tamaño, sexo y estado del animal por palabras clave; **nada se publica sin que el coordinador lo revise** y complete la foto y la zona.
    - **Celulares tapados.** Los reportes son públicos, así que antes de mostrar nada los celulares (con o sin +57), los números de 7 a 10 dígitos y los correos del mensaje se reemplazan por «[contacto omitido]».
    - **No se duplica.** `origen_ref` guarda una huella SHA-256 del texto normalizado y la fecha del mensaje; el índice único `(autor_id, origen_ref)` y `upsert … ignoreDuplicates` hacen que volver a pegar la misma conversación omita lo ya importado, también si una tanda se interrumpe a la mitad.
    - **Una sola zona por tanda.** El mapa se marca una vez y se aplica a todos los casos de la tanda. Si alguno está en otro sitio, se desmarca y se publica aparte.
26. **Placa con código QR (Sprint 3 · HU11).** El propietario pide la placa desde `/mascotas/:id/placa` con los datos de envío. `solicitar_placa()` genera un código de 10 caracteres (`md5` de un UUID aleatorio) y deja el pedido en `SOLICITADA`; el QR (`qrcode.react`, corrección de errores nivel Q) apunta a `/placa/<código>` y **ya funciona desde ese momento**, antes de que llegue la placa física. El estado del pedido (`SOLICITADA → EN_PRODUCCION → ENVIADA → ENTREGADA`) solo lo cambia un `ADMIN`; no hay integración con ninguna empresa de envíos. Una mascota no puede tener dos pedidos en trámite (índice único parcial).
    - **La página pública nunca muestra teléfonos.** `placa_publica()` devuelve foto, nombre, rasgos y el aviso de manejo; si la mascota tiene un caso de pérdida abierto, enlaza a su ficha (que ya decide qué mostrar, HU-04). Si no lo tiene, quien escanea deja nombre, celular y un mensaje con `avisar_dueno_placa()` y el dueño lo recibe como notificación. Máximo 3 avisos por hora por persona y placa.
27. **Búsqueda por foto = semejanza visual aproximada (Sprint 3 · HU10).** `lib/semejanza.ts` reduce cada foto a una firma de color (histograma suave de 64 colores de la zona central) y de forma (cuadrícula de luz 8×8) y las compara; 70 % color y 30 % forma. Corre **en el navegador**: la foto de quien busca no se sube ni se guarda, así que no necesita sesión. **No es reconocimiento del animal**: dos perros distintos del mismo color salen muy parecidos y la misma mascota en otra pose puede salir menos. Por eso cada resultado muestra su porcentaje, se avisa de que es aproximado y la persona confirma en la ficha. Si el servidor de una foto no permite leerla desde otra página, esa foto se cuenta como «sin poder leer» y no rompe la búsqueda. Para pasar a reconocimiento real habría que sustituir `firmaDesdePixeles` por un modelo de *embeddings* de imagen; el resto de la pantalla no cambia.
28. **Difusión sin teléfonos (mejora).** La ficha de un caso vivo tiene *Ayuda a difundir*: un enlace `wa.me` con el texto ya escrito, el menú de compartir del celular (`navigator.share`, o copiar al portapapeles en escritorio) y un **cartel imprimible** en `/caso/:id/cartel`. El texto (`lib/compartir.ts`, funciones puras) **nunca lleva teléfonos**: lleva la ficha, que ya decide qué mostrar. El cartel es tamaño carta, en blanco y negro y con letra legible a distancia, con un QR a la ficha. El teléfono del dueño solo aparece si `contacto_caso()` lo devuelve (caso vivo), y el dueño puede quitarlo antes de imprimir. Esto **no** es la historia «alertas automáticas por WhatsApp o SMS»: esa necesita un proveedor de mensajería de pago y sigue pendiente.
29. **Recorrido de avistamientos (mejora).** El dueño ve en el mapa de la ficha sus avistamientos no descartados, numerados en orden de fecha y unidos a la zona de pérdida con una línea punteada. Solo lo ve el dueño, porque las coincidencias solo se leen con RLS de dueño. No hay consulta nueva: se reutiliza lo que ya carga `useCoincidencias`.
30. **Jornadas de búsqueda (mejora, migración `h11`).** El dueño de un caso de pérdida vivo convoca día, hora y punto de encuentro, entre 30 minutos y 30 días desde ahora, con un máximo de 3 próximas. Quien quiera ayudar pulsa *Voy a ayudar* y deja nombre y celular, igual que al reportar (decisión 22.4). Las tablas `jornadas_busqueda` y `jornada_asistentes` **no tienen privilegios para ningún rol del cliente**: se leen con `jornadas_caso()`, que devuelve el conteo y no los asistentes, y se escriben con `convocar_jornada()`, `cancelar_jornada()`, `apuntarse_jornada()` y `salir_jornada()`. Al convocar se avisa a quienes ya reportaron un avistamiento de esa mascota, y cada convocatoria o cancelación queda en el historial como evento `JORNADA`. El punto de encuentro es texto público: el formulario advierte que no sea la casa.
31. **Ficha quieta (mejora, migración `h12`).** `avisar_fichas_quietas()` notifica al dueño de cada caso vivo que lleva 3 días o más sin actividad, como máximo un aviso cada 3 días por caso. Se programa con `pg_cron` a las 9:00 de Bogotá si la extensión está activa; si no, la migración crea la función y avisa con un `notice`. El cliente no puede ejecutarla. Además, el panel muestra el mismo aviso con accesos directos a WhatsApp, al cartel y a ampliar el radio.
32. **`/buscar` ordena y exporta.** Se puede ordenar por *Más recientes*, *Más antiguos primero* (lo que pide la historia del voluntario: los casos viejos son los que nadie está mirando) o *Más cerca de la zona*, que solo se activa si se eligió zona. Los resultados se descargan en CSV separado por `;`, con BOM para que Excel en español respete las tildes y con las celdas que empiezan por `= + - @` neutralizadas para evitar la inyección de fórmulas.
33. **Indicadores y ayuda públicos.** `/estadisticas` (*Cómo va la red*) calcula casos activos, reencuentros, tasa de reencuentro, mediana aproximada de días hasta el reencuentro, avisos de los últimos 30 días y pérdidas por semana. Todo sale de `casos_publicos` y de un conteo de `reportes`, nada personal. `/ayuda` reúne preguntas frecuentes con buscador. Las dos páginas se enlazan desde el pie y el menú móvil, no desde la portada, para no romper la decisión 21.
34. **Pruebas del SQL sin Supabase.** `tests/sql/` levanta un Postgres real en memoria (PGlite) con lo mínimo de Supabase: roles `anon` y `authenticated`, `auth.uid()` y `storage`. Ahí carga `schema.sql`, `funciones.sql` y `politicas.sql` tal cual y ejecuta las consultas con los roles del cliente. Así las garantías de privacidad (decisiones 4, 5, 6, 10, 12 y 22) y las RPC nuevas se comprueban en cada `npm run test`, sin depender de un proyecto en línea. No sustituye la prueba final sobre Supabase: PGlite no trae `pg_cron` ni Realtime.

---

## 2. Requisitos

- Node.js 18 o superior (probado con Node 24) y npm.
- Una cuenta gratuita en [supabase.com](https://supabase.com).

## 3. Crear el proyecto en Supabase

1. Crea un proyecto nuevo en Supabase y espera a que termine de aprovisionarse.
2. **Authentication → Sign In / Providers**: **activa “Allow anonymous sign-ins”** (obligatorio). La app **no tiene login ni registro, y tampoco lo aparenta**: no hay botón *Entrar* en ninguna parte. Cada flujo pide los datos de la persona cuando los necesita —el primer paso de *Reportar* son su nombre y su teléfono— y abre por detrás una sesión anónima de Supabase con el rol correspondiente; el trigger `crear_perfil_nuevo_usuario` crea el perfil. RLS y las funciones aplican igual que con una cuenta. La pantalla `/entrar` sigue existiendo solo como respaldo de `RutaProtegida` (quien abre `/panel`, `/casos/nuevo`, `/veterinario` o `/verificacion/:id` sin sesión). Deja activo *Email*: lo usan los perfiles de demostración del seed.
3. **SQL Editor**: pega y ejecuta cada archivo **en este orden**, uno por uno:

   | Orden | Archivo | Contenido |
   |---|---|---|
   | 1 | `supabase/schema.sql` | Enums, tablas, restricciones, índices y vistas |
   | 2 | `supabase/funciones.sql` | `distancia_km`, `verificar_respuestas`, triggers y RPC |
   | 3 | `supabase/politicas.sql` | Privilegios, RLS y bucket `fotos` con sus políticas |
   | 4 | `supabase/seed.sql` | Datos de prueba (ejecútalo **una sola vez**) |

4. **Project Settings → API**: copia la *Project URL* y la clave *anon public*.

> `schema.sql` añade la tabla `notificaciones` a la publicación `supabase_realtime`. Si tu proyecto no tiene esa publicación, actívala en **Database → Publications**.

> **Bases ya creadas.** Los cuatro archivos de arriba son para una instalación limpia, y `npm run db:aplicar` se niega a correr si el esquema ya existe. Si tu base ya está montada, aplica en el SQL Editor los archivos de `supabase/migraciones/` **en este orden**, cada uno una sola vez y dentro de su propia transacción:
>
> | Orden | Archivo | Qué cambia |
> |---|---|---|
> | 1 | `h1_lectura_microchip.sql` | Ubicación opcional, `leido_por` y el corte de `registrar_lectura` en consulta + registro |
> | 2 | `h3_preguntas_del_verificador.sql` | Tabla `preguntas_verif`, `respuestas_verif` con dos fuentes posibles y el contacto solo tras aprobar |
> | 3 | `h4_fixture_preguntas_del_verificador.sql` | Caso K5 y verificación pendiente para demostrar en vivo la rama nueva de HU-03 |
> | 4 | `h5_cambiar_rol.sql` | `cambiar_rol()`: cambiar de perfil sin perder la sesión, para que nadie quede atrapado con el rol equivocado |
> | 5 | `h6_contacto_reporte.sql` | `contacto_reporte()`: el dueño ve a quién llamar de entre quienes avistaron a su mascota |
> | 6 | `h7_contacto_caso.sql` | `contacto_caso()`: el teléfono del dueño de un caso vivo, caso por caso |
> | 7 | `h8_rol_coordinador.sql` | **Sprint 2 · HU07.** Nuevo valor `COORDINADOR` del enum `rol_usuario`. Va solo: un valor de enum no se puede usar en la transacción que lo crea |
> | 8 | `h9_importar_whatsapp.sql` | **Sprint 2 · HU07.** `reportes.origen`, `origen_nombre` y `origen_ref` (con índice único para no importar dos veces); `COORDINADOR` en `cambiar_rol()` y en el alta de perfiles; el trigger de reportes solo deja importar al coordinador |
> | 9 | `h10_placas_qr.sql` | **Sprint 3 · HU11.** Tablas `placas_qr` y `avisos_placa`, con `solicitar_placa()`, `cancelar_placa()`, `placa_publica()` y `avisar_dueno_placa()` |
> | 10 | `h11_jornadas_busqueda.sql` | **Mejora.** Jornadas de búsqueda: tablas, RPC y el tipo de evento `JORNADA` (decisión 30) |
> | 11 | `h12_aviso_ficha_quieta.sql` | **Mejora.** `avisar_fichas_quietas()` y su tarea diaria en `pg_cron`, si está activo (decisión 31) |
>
> Se aplican con **`npm run db:migrar -- <archivo>`** (o `-- --revisar` para ver el estado sin tocar nada). No uses `db:aplicar`: ese solo sirve para bases limpias.
>
> ⚠️ **10/11/2026: el proyecto de Supabase al que apunta `.env` no responde.** Su dominio (`aitrobhpzlrkbmgnjcdu.supabase.co`) no resuelve en DNS, ni con el DNS local ni con 8.8.8.8. Lo normal es que esté **pausado por inactividad** (el plan gratuito pausa los proyectos sin uso) o que se haya borrado. Restáuralo en el panel de Supabase (*Restore project*), o crea uno nuevo, y aplica lo pendiente. Mientras tanto la aplicación compila y sus pruebas pasan, pero no carga datos.
>
> **Estado: de la 1 a la 6 ya están aplicadas** en el proyecto de Supabase que apunta este repo (18/09/2026). **De la 7 a la 11 (`h8` a `h12`) están pendientes**: aplícalas en ese orden con `npm run db:migrar -- supabase/migraciones/h8_rol_coordinador.sql` y las siguientes, una por una (`h8` primero y sola). Todas ya están incorporadas en `schema.sql`, `funciones.sql` y `politicas.sql` para instalaciones limpias. La tabla sigue aquí para instalaciones nuevas o para otro entorno. No vuelvas a ejecutar la 1 ni la 2 sobre esta base: sus líneas `add constraint` no son idempotentes y el segundo pase aborta (la transacción revierte sola, pero no tiene sentido). De la 3 a la 5 sí son idempotentes.

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

## 6. Perfiles de prueba

No hace falta escribir credenciales. Los perfiles de demostración **ya no se muestran en la interfaz normal**: entra a **`/entrar?demo=1`** y ahí aparece la sección **Perfiles de demostración**, que con un clic entra a los perfiles del seed, que ya tienen casos, coincidencias y verificaciones. Por dentro son cuentas con la contraseña **`Prueba2026!`**.

**Para cambiar de perfil vuelve a `/entrar?demo=1`.** Esa URL no redirige aunque ya tengas sesión abierta, justamente para que puedas saltar de un perfil a otro durante la sustentación. Es la **única** forma de cambiar de perfil: el botón *Cambiar de perfil* del menú superior ya no existe para ningún rol, porque delataba la sesión. Guarda esa URL antes de sustentar.

> Están escondidos a propósito: un usuario real nunca debe ver botones de sesión. Las cuentas siguen en `seed.sql` porque los casos sembrados (Max, Luna, Rocky, Nina) con sus coincidencias y verificaciones les pertenecen; borrarlas dejaría la demo sin datos. **Guarda esa URL: es la puerta de entrada a la sustentación.**

| Rol | Correo | Nombre |
|---|---|---|
| Propietario | `propietario@chippet.test` | Laura Gómez |
| Ciudadano | `ciudadano@chippet.test` | Andrés Ruiz |
| Auxiliar veterinario | `veterinario@chippet.test` | Dra. Paula Ortiz |
| Administrador | `admin@chippet.test` | Administración ChipPet |

**Datos sembrados**

| Id | Qué es |
|---|---|
| `c0000000-0000-0000-0000-000000000001` | **Max** (perdido). Coincidencias con R1 = **93** (misma raza, 1 km, 6 h) y R5 = **70** (retroactiva) |
| `c0000000-0000-0000-0000-000000000002` | **Luna** (perdida). R2 da ≈ 20 puntos (**debajo del umbral**, no se guarda) · verificación **BLOQUEADA** |
| `c0000000-0000-0000-0000-000000000003` | **Rocky** (perdido). Al pulsar *Recalcular* aparece R3 (≈ 68) |
| `c0000000-0000-0000-0000-000000000004` | **Nina** (resuelto). Lectura de microchip + verificación **APROBADA** con constancia |
| `c0000000-0000-0000-0000-000000000005` | **Hallazgo sin mascota registrada** (perro del Parque Bolívar, abierto por Andrés). No tiene datos reservados de ningún dueño |
| `e0000000-0000-0000-0000-000000000001` | Verificación aprobada (Nina) |
| `e0000000-0000-0000-0000-000000000002` | Verificación bloqueada tras 3 intentos (Luna) |
| `e0000000-0000-0000-0000-000000000003` | **Verificación pendiente sin preguntas todavía**: el fixture de la rama nueva de HU-03. Ábrela como ciudadano y crea las preguntas |

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

1. Abre **`/entrar?demo=1`** y entra como **ciudadano**; luego abre `/veterinario`. Aparece *“No tienes permisos para esta sección”* (criterio 1). La RPC también lo rechaza: prueba T-09.
2. Vuelve a **`/entrar?demo=1`** y entra como **auxiliar veterinario**: con el perfil de demostración o con uno nuevo (nombre y teléfono). Abre *Lectura de microchip*.
3. Escribe `12345`: el botón *Consultar microchip* sigue deshabilitado y, al forzar el envío, aparece *“El microchip debe tener 15 dígitos numéricos.”* (criterio 2).
4. **La consulta se resuelve antes de guardar.** Escribe `981098102458912` (Max) y pulsa *Consultar microchip*. Antes de registrar nada aparece la ficha de Max —foto, especie, raza, color, tamaño— con la insignia **Abierto** y el aviso *“Tiene un caso abierto: la lectura se asociará a ese caso”*. Como no hay que abrir ningún caso, **no se pide ubicación**.
5. Completa *Veterinaria* (`Clínica San Roque`) y *Quién hizo la lectura* (viene rellenado con el nombre del perfil y se puede cambiar). La *Fecha y hora* se ve en vivo pero está deshabilitada: la asigna el servidor (criterio 3). Pulsa *Registrar lectura*.
6. Aparece *“Microchip registrado: Max · la lectura se asoció a su caso abierto y se notificó al propietario”*. Pulsa *Ver caso*: el historial muestra **Lectura de microchip**, con la veterinaria y el nombre de quien la hizo (criterio 4).
7. **Rama que sí pide ubicación.** Consulta `900164000123789` (Nina, cuyo caso está *Resuelto*). La consulta avisa *“No tiene un caso abierto”* y solo entonces aparece el mapa *¿Dónde apareció el animal?*. Al registrar se abre un caso de **hallazgo** a tu nombre.
8. Consulta `123456789012345`. Aparece *“Microchip no registrado”* y, al registrar, se guarda como **hallazgo huérfano** sin pedir ubicación (criterio 5).
9. En *Mis lecturas* pulsa *Anular lectura* sobre una de ellas. Una justificación de menos de 10 caracteres da error. Con una válida, la lectura se muestra **tachada** con el motivo, sigue en la lista y el caso registra el evento *Lectura anulada* (criterio 6).
10. Entra como **propietario** y abre `/notificaciones`: está el aviso *“Leyeron el microchip de Max”*.

### HU-02 · Confirmar o descartar coincidencias

1. Entra como **propietario** y abre la ficha de Max (`/caso/c0000000-0000-0000-0000-000000000001`).
2. En **Coincidencias sugeridas** hay dos tarjetas. Cada una muestra foto, zona, fecha, puntaje y el desglose en lenguaje natural (*“misma raza · mismo color · … · a 1 km · 6 horas después de la pérdida”*). La de 70 lleva la etiqueta **Retroactiva** (criterio 1).
3. En la tarjeta de 70, pulsa **No es mi mascota**. Baja al bloque **Ya decididas** del final de la misma lista, sin abrir ninguna pantalla. Pulsa **Recalcular coincidencias**: no vuelve a aparecer (criterio 3, prueba T-13).
4. En la tarjeta de 93, pulsa **Es mi mascota**. Aparece el aviso con el enlace *Abrir verificación*. El caso pasa a **En verificación**, no se cierra (criterios 2 y 4).
5. El historial muestra *Coincidencia descartada*, *Coincidencia confirmada* y *Verificación iniciada*. Entra como **ciudadano** y abre `/notificaciones`: está el aviso *“El dueño reconoció al animal que reportaste”* (criterio 5).
6. Criterio 6: como ciudadano, la ficha de Max no muestra el bloque de coincidencias. Además, RLS devuelve 0 filas en `coincidencias` y rechaza el `UPDATE` (ver la sección 8).

### HU-03 · Verificar al dueño antes de la entrega

> **Dos pantallas, una por actor.** Cada quien ve solo su paso: quien encontró al animal crea las preguntas y luego decide; quien reclama responde. Los teléfonos aparecen **únicamente** en la constancia de entrega aprobada.
>
> **Mascota sin datos reservados** (el origen nuevo). Ya está sembrado, no hay que montarlo: abre **`/verificacion/e0000000-0000-0000-0000-000000000003`** como **ciudadano** (Andrés, que encontró un perro sin placa en el Parque Bolívar) y verás *“Crea las preguntas de seguridad”* con 3 pares pregunta/respuesta y el botón *Añadir otra pregunta*. Guárdalas, cambia a **propietario** y responde. Mientras Andrés no las guarde, Laura ve *“Las preguntas todavía no están listas”*; por SQL, `verificar_respuestas` responde *“Todavía no hay preguntas…”*.

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

### Sprint 2 · HU07 · Importar los casos de un grupo de WhatsApp

1. Abre **`/importar`** sin sesión: pide *Tu nombre y fundación* y un celular (no un login). Continúa.
2. En *Fundación o grupo* escribe `Fundación Patas` y pega una conversación como esta:
   ```
   12/9/26, 3:50 p. m. - Marta: Rescatamos un perrito macho, pequeño, color café, por el barrio Las Cuadras. Escribir al 3001234567
   12/9/26, 3:51 p. m. - Marta: <Multimedia omitido>
   13/9/26, 9:10 a. m. - Luis: Gatita atigrada hembra perdida cerca del parque Bolívar, la vieron herida ayer.
   ```
   (o sube el `.txt` exportado). Pulsa **Analizar mensajes**.
3. Aparecen **2 casos detectados** y un aviso de que se dejó fuera 1 mensaje (el multimedia). El primero ya trae *Perro · Marrón · Pequeño · Macho · Lo recogí*, y el texto dice `[contacto omitido]` donde estaba el celular.
4. Pulsa **Publicar** sin más: pide marcar la zona. Márcala en el mapa y vuelve a pulsar: cada caso pide su foto y **no se publica nada** hasta que todos estén completos.
5. Sube una foto a cada caso y publica. El resumen dice *2 casos publicados*. Abre **Buscar → Animales encontrados**: aparecen con la insignia *Vía Fundación Patas*, y su ficha dice *Importado de WhatsApp*.
6. Pega **la misma conversación** otra vez y publica: *Ya estaban importados y se omitieron: 2*.
7. Como ciudadano, intenta insertar un reporte con `origen = 'WHATSAPP'` (prueba T-18): lo rechaza.

### Sprint 3 · HU10 · Casos parecidos a partir de una foto

1. En **Buscar** pulsa *Buscar por foto* (o abre `/buscar-foto`). No pide datos ni sesión.
2. Elige una foto de un animal y pulsa **Buscar parecidos**. Mientras compara se ve el avance (*12/40*).
3. Salen los casos de pérdida abiertos ordenados de mayor a menor, cada uno con su **% de semejanza** y la etiqueta *Muy parecida* (≥ 75) · *Parecida* (≥ 55) · *Poco parecida*. Se muestran 8 y el botón *Ver los N restantes* despliega el resto.
4. El aviso *«Es una comparación aproximada»* recuerda que se compara color y luz, no al animal. Pulsa un resultado: abre la ficha del caso.
5. Con la pestaña *Red* de DevTools se comprueba que **la foto no se envía a ningún servidor**.

### Sprint 3 · HU11 · Placa con código QR

1. Como **propietario**, en el panel pulsa *Placa QR* en la tarjeta de una mascota.
2. Deja la dirección vacía y pulsa **Solicitar placa**: pide dirección y ciudad. Complétalos y envía. Aparece el pedido en *Solicitada*, el seguimiento de cuatro pasos y el **código QR**.
3. Pulsa *Imprimir* o *Descargar SVG*. Escanea el QR con el celular: abre `/placa/<código>`.
4. **Sin sesión**, en esa página se ve la foto, el nombre y los rasgos de la mascota, y **ningún teléfono**. Si la mascota tiene un caso abierto, ofrece *Ver ficha y contactar* y *La tengo conmigo / la vi*.
5. Con una mascota **sin** caso abierto, la página pide nombre y celular a quien escanea, luego un mensaje, y *Avisar al dueño*. El dueño ve la notificación *«Escanearon la placa de …»* con ese contacto en `/notificaciones`. A la cuarta vez en una hora responde *«Ya avisaste varias veces…»*.
6. De vuelta como propietario: *Cancelar pedido* funciona mientras esté en *Solicitada* (prueba T-20).

### Mejoras · difusión, recorrido, jornadas y ficha quieta

1. Entra como **propietario** (`/entrar?demo=1`) y abre **Max**. En el mapa aparecen los avistamientos **numerados** y unidos a la zona de pérdida por una línea punteada, del más antiguo al más reciente (decisión 29).
2. En *Ayuda a difundir*, pulsa **WhatsApp**: se abre con el texto escrito, sin teléfonos. Pulsa **Cartel para imprimir con QR**: se ve en blanco y negro, con una casilla para quitar el teléfono; *Imprimir cartel* genera una hoja carta. Escanea el QR con el celular: abre la ficha.
3. En *Jornadas de búsqueda*, pulsa **Convocar** y elige una hora dentro de 10 minutos: *«…al menos 30 minutos después de ahora.»* Con una hora válida, la jornada se publica, aparece en *Todo lo que ha pasado* como **Jornada de búsqueda** y el ciudadano del seed (autor de R1) recibe *«Jornada para buscar a Max»*.
4. Abre la ficha en una ventana privada, pulsa **Voy a ayudar** y deja nombre y celular: el conteo sube a 1 y el dueño recibe *«Alguien se sumó a la búsqueda»*. Vuelve como dueño y pulsa **Cancelar jornada**: pide confirmación y avisa a quien se apuntó.
5. En el SQL Editor: `update casos set ultima_actividad_en = now() - interval '5 days' where id = 'c0000000-0000-0000-0000-000000000003'; select avisar_fichas_quietas();` → devuelve 1, y Laura ve *«La ficha de Rocky está quieta»*. Al repetir la llamada devuelve 0. En `/panel` aparece el aviso con los accesos directos.
6. `/buscar` → *Ordenar: Más antiguos primero*, y luego **CSV**: se descarga un archivo que Excel abre con las tildes correctas. `/estadisticas` y `/ayuda` se abren desde el pie de página.

### Sprint 2 y 3 · lo que ya existía

| Historia | Dónde se ve |
|---|---|
| **HU05 · Identificar desde el celular, sin instalar nada** | Todo es web responsive (`viewport`, Tailwind) y sin cuenta. Abre `/` desde el celular: *Encontré una mascota* lleva a `/reportar`, que arranca por la galería de reconocimiento |
| **HU06 · Radio de difusión en km** | `/casos/nuevo` ofrece 1, 2, 3, 5, 10 y 20 km; en la ficha, *Ampliar radio* ofrece hasta 50 km y registra *Radio de búsqueda ampliado de X km a Y km* en el historial. El radio alimenta el puntaje de distancia del motor |
| **HU08 · Reportar un animal visto en la calle** | `/reportar`: el estado del animal incluye *Sigue en el lugar* y *Se fue*, y *No es ninguna de estas* permite reportar sin saber si está perdido |
| **HU09 · Hallazgos anteriores al reporte** | Cruce retroactivo con ventana de 90 días y la etiqueta **Retroactiva** (T-03) |
| **HU12 · Varias fotos de la mascota** | `/mascotas/nueva` admite de 1 a 6 fotos, con una principal; el trigger `limitar_fotos_mascota` lo garantiza en la base |

---

## 8. Pruebas

### Automatizadas: `npm run test`

**75 pruebas en 10 archivos, todas en verde** (10/11/2026). Las de `tests/sql/` usan PGlite y tardan unos segundos (decisión 34). Lo que **no** cubren: `pg_cron`, Realtime, Storage y la interfaz en el navegador. Eso se comprueba con el guion de la sección 7, sobre un proyecto de Supabase en línea.

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| T-01 | Misma raza, 1 km, 6 h después | Puntaje ≥ 80 con motivos desglosados | ✅ 93 |
| T-02 | Especies distintas | Sin coincidencia | ✅ |
| T-03 | Hallazgo 30 días antes de la pérdida | Coincidencia marcada como retroactiva | ✅ |
| T-04 | Puntaje 34 | No se crea la coincidencia | ✅ |
| T-05 | Microchip idéntico | Puntaje 100 | ✅ |
| W-01…W-15 | `tests/whatsapp.test.ts`: lectura de la exportación (Android e iOS), texto libre, descarte de avisos y multimedia, detección de rasgos, celulares y correos tapados, huella estable | Se descartan 4 de 6 mensajes de la muestra y ninguno de los publicados conserva un celular | ✅ |
| D-01…D-09 | `tests/compartir.test.ts`: rasgos y texto de difusión sin teléfonos, aviso de mascota huraña, enlace `wa.me` codificado, días sin actividad, `casoQuieto`, `tiempoHasta`, validación de jornadas | Texto correcto y fechas límite | ✅ |
| O-01…O-04, E-01…E-03 | `tests/exportar.test.ts`: los tres órdenes de `/buscar`, que no mutan la lista, y el CSV (escape, `;` y CRLF, fórmulas neutralizadas) | Orden y CSV correctos | ✅ |
| ES-01…ES-04 | `tests/estadisticas.test.ts`: mediana, reencuentros por `RESUELTO` o desenlace, tasa nula sin casos terminados, agrupación por semana | Indicadores correctos | ✅ |
| SQ-01…SQ-08 | `tests/sql/seguridad.test.ts` (Postgres real, roles del cliente): `casos.lat` cerrado a `anon` y `authenticated`, desplazamiento de 100 a 300 m, `ubicacion_exacta_caso` solo para la creadora, perfil público sin teléfono, nadie llega a `ADMIN`, un ciudadano no crea pérdidas (RLS), historial inmutable incluso para el superusuario, teléfono del dueño solo con el caso vivo | Cada garantía se cumple | ✅ |
| J-01…J-09 | `tests/sql/jornadas.test.ts`: permisos, límites de fecha, evento y avisos, lectura anónima sin acceso a la tabla, inscripción única, cancelación con aviso, máximo 3, caso cerrado | Reglas de la decisión 30 | ✅ |
| FQ-01…FQ-05 | `tests/sql/fichaQuieta.test.ts`: solo casos quietos y vivos, sin repetir, cliente sin permiso, migración idempotente | Reglas de la decisión 31 | ✅ |
| IN-01 | `tests/sql/instalacion.test.ts`: los tres SQL base cargan en limpio y `h11` y `h12` se reaplican encima | Sin errores | ✅ |
| S-01…S-10 | `tests/semejanza.test.ts`: una foto contra sí misma da 100, la misma escena con ruido da ≥ 90, un animal oscuro se parece más a otro oscuro que a uno dorado, el orden de resultados y el límite de tareas en paralelo | Ordena de mayor a menor semejanza | ✅ |

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
| T-09 | Como ciudadano: `insert into lecturas_microchip (veterinario_id, codigo, establecimiento, leido_por) values ('22222222-2222-2222-2222-222222222222','981098102458912','X','Y');` y también `select registrar_lectura('981098102458912','X','Y');` | *new row violates row-level security policy* y *“Solo el personal veterinario…”*. La consulta previa está igual de cerrada: `select consultar_microchip('981098102458912');` da *“Solo el personal veterinario puede consultar microchips.”* |
| T-16 | Como veterinario, registra el microchip de una mascota **sin** caso abierto omitiendo la ubicación: `select registrar_lectura('900164000123789','Clínica X','Dra. Y');` | *“Esta mascota no tiene un caso abierto. Marca en el mapa dónde apareció para abrir el caso de hallazgo.”* En la UI el mapa aparece solo en esa rama, así que el error no se alcanza |
| T-17 | Como reclamante (`sub` = `1111…`): `select * from public.preguntas_verif;` y `select crear_preguntas_verificacion('<verificación>', '[]');` | *permission denied* (la tabla no tiene privilegios para ningún rol del cliente) y *“Solo quien encontró al animal puede crear las preguntas.”* |
| T-10 | Crea una verificación pendiente (HU-02: *Recalcular* en Rocky → confirmar R3). Como propietario, responde mal 3 veces | Estado **BLOQUEADA**, formulario deshabilitado y notificación *“Verificación bloqueada”* al propietario |
| T-11 | Como ciudadano: `update eventos set descripcion = 'x';`. Como `postgres`: `update eventos set descripcion = 'x';` | *permission denied* y, en el segundo caso, *“El historial del caso es inmutable…”* |
| T-12 | Abre `/caso/c0000000-0000-0000-0000-000000000001` sin sesión | La ficha se ve, sin teléfono ni ubicación exacta. Además, `select lat from casos` como `anon` da *permission denied* |
| T-13 | HU-02 paso 3: descartar y luego *Recalcular coincidencias* | La coincidencia no vuelve a aparecer |
| T-14 | En `/casos/nuevo`, Max aparece deshabilitado *(ya tiene un caso abierto)*. Por SQL, como propietario: `insert into casos (mascota_id, creador_id, tipo, lat, lng, ocurrido_en) values ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','PERDIDA',1.2,-77.2, now());` | Rechazo por `casos_una_perdida_abierta_idx`. En la app: *“Esta mascota ya tiene un caso de pérdida abierto.”* |
| T-18 | Como ciudadano: `insert into reportes (autor_id, especie, estado_animal, lat, lng, ocurrido_en, foto_url, origen, origen_nombre, origen_ref) values ('2222…','PERRO','SIGUE_EN_LUGAR',1.2,-77.2,now(),'https://x.co/a.jpg','WHATSAPP','Grupo X','abcdef1234567890');` | *«Solo un coordinador de fundación puede importar casos de WhatsApp.»* Como coordinador entra; repetir el mismo `origen_ref` con `on conflict (autor_id, origen_ref) do nothing` no inserta nada |
| T-19 | Como `anon`: `select * from placas_qr;` y `select * from placa_publica('<código>');` | *permission denied* en la tabla; la función devuelve foto, nombre y rasgos **sin** teléfono |
| T-20 | Como propietario: `select solicitar_placa('<mascota>','Laura','Calle 18 # 20-30','Pasto','3001112222');` dos veces; luego `cancelar_placa('<id>')` | La segunda da *«Esta mascota ya tiene una placa en trámite…»*. Un ciudadano recibe *«Solo el propietario puede solicitar la placa…»*. Cancelar deja el pedido en `CANCELADA` y permite pedir otra |
| T-21 | Como ciudadano: `select avisar_dueno_placa('<código>','Está en el parque');` cuatro veces seguidas | Las tres primeras notifican al dueño; la cuarta: *«Ya avisaste varias veces en la última hora…»* |
| T-15 | Sube una foto de 8 MB en *Registrar mascota* | *“"foto.jpg" pesa 8 MB. El máximo permitido es 5 MB.”* El bucket también limita a 5 MB |

---

## 9. Estructura

```
src/
  componentes/   Boton, Campo, Mapa, SubirFotos, LineaTiempo, TarjetaCoincidencia, Campana,
                 TarjetaCaso, Layout, RutaProtegida, ProveedorSesion, FormularioPerfil, Iconos, ui,
                 CodigoQR, Jornadas
  paginas/       Inicio, Entrar, Panel, MascotaFormulario, NuevoCaso, Caso, Reportar,
                 Buscar, Verificacion, Veterinario, Notificaciones, NoEncontrada,
                 ImportarCasos, PlacaMascota, PlacaPublica, BuscarPorFoto,
                 Cartel, Estadisticas, Ayuda
  lib/           supabase, matching, geo, validacion, eventos, notificaciones, cruces, fotos, formato,
                 whatsapp, semejanza, compartir, exportar, estadisticas
  hooks/         useSesion, useMisCasos, useCoincidencias, useNotificaciones (+ sesionContexto)
  tipos/         tipos.ts
supabase/        schema.sql, funciones.sql, politicas.sql, seed.sql
                 migraciones/  h1 … h12 (ver sección 3)
tests/           matching, whatsapp, semejanza, compartir, exportar, estadisticas (.test.ts)
  sql/           baseDePrueba.ts (PGlite + stub de Supabase), seguridad, jornadas,
                 fichaQuieta, instalacion (.test.ts), con su propio tsconfig.sql.json
```

---

## 10. Trazabilidad: historia → archivos → prueba

| Historia | Dónde quedó implementada | Cómo se verifica |
|---|---|---|
| **A · Perfiles y roles (sin login)** | `componentes/FormularioPerfil.tsx` (pedido en el sitio, nunca en una pantalla aparte), `componentes/RutaProtegida.tsx` (formulario en línea con el rol de la ruta), `componentes/ProveedorSesion.tsx`, `paginas/Entrar.tsx` (solo cambio de perfil) , `lib/validacion.ts` (`perfilSchema`) · `funciones.sql` (`crear_perfil_nuevo_usuario`) · `politicas.sql` (perfiles) | Abrir `/casos/nuevo` o `/veterinario` sin sesión: sale el formulario de datos con el rol correcto, **no** una pantalla de login. Continuar sin marcar el consentimiento o con un teléfono inválido da mensajes específicos; `/veterinario` con otro rol muestra el aviso de perfil equivocado |
| **B · Registrar mascota** | `paginas/MascotaFormulario.tsx`, `componentes/SubirFotos.tsx`, `lib/fotos.ts`, `lib/validacion.ts` (`mascotaSchema`, `validarFoto`) · `funciones.sql` (`guardar_mascota`, `validar_integridad_mascota`, `normalizar_dato_reservado`) · `componentes/ui.tsx` (`AvisoManejo`) | T-06, T-07, T-08, T-15 · aviso destacado en la ficha de Luna o Rocky |
| **C · Reportar pérdida** | `paginas/NuevoCaso.tsx`, `lib/cruces.ts` (`ejecutarCrucesDeCaso`) · `funciones.sql` (`casos_antes_insertar`, `casos_despues_insertar`) · `schema.sql` (`casos_una_perdida_abierta_idx`) | T-14 · resultados del motor al publicar |
| **D · Reportar hallazgo** | `paginas/Reportar.tsx` (galería de reconocimiento + 3 pasos: tus datos → mascota → rasgos), `componentes/FormularioPerfil.tsx` (pide los datos en cada reporte), `lib/cruces.ts` (`ejecutarCrucesDeReporte`) · `politicas.sql` (reportes) | Publicar un reporte cerca de Max y ver los casos parecidos · abrir `/reportar` y comprobar que primero ofrece reconocer al animal entre los perdidos · reportar dos veces seguidas con nombres distintos y verificar que el segundo reporte **no** queda a nombre del primero |
| **E · Motor de coincidencias** | `lib/matching.ts`, `lib/geo.ts`, `lib/cruces.ts` · `funciones.sql` (`guardar_coincidencias`, `distancia_km`) | `tests/matching.test.ts` (T-01 a T-05) · T-13 |
| **F · Notificaciones** | `paginas/Notificaciones.tsx`, `hooks/useNotificaciones.ts`, `lib/notificaciones.ts` · `funciones.sql` (`_notificar` en cada trigger o RPC) | Abrir `/notificaciones` tras cada paso del guion. La campana del encabezado se retiró a petición del usuario; `componentes/Campana.tsx` queda sin uso |
| **HU-01 · Lectura de microchip** | `paginas/Veterinario.tsx` (consulta → confirmación), `lib/validacion.ts` (`lecturaSchema`, `ubicacionLecturaSchema`) · `funciones.sql` (`consultar_microchip`, `registrar_lectura`, `anular_lectura`, `lecturas_proteger`, `_vincular_lecturas`) · `politicas.sql` (`lecturas_insertar_veterinario`, sin UPDATE/DELETE) · `migraciones/h1_lectura_microchip.sql` | Guion HU-01 · T-09 · T-16 |
| **HU-02 · Confirmar o descartar** | `componentes/TarjetaCoincidencia.tsx` (acciones dentro de la tarjeta, sin pantalla de detalle), `hooks/useCoincidencias.ts` (orden por puntaje descendente), `paginas/Caso.tsx` (lista única: activas y luego *Ya decididas*) · `funciones.sql` (`coincidencias_antes_actualizar`, `coincidencias_despues_actualizar`) · `politicas.sql` (`coincidencias_*`) | Guion HU-02 · T-13 |
| **HU-03 · Verificación de propiedad** | `paginas/Verificacion.tsx` (una pantalla por actor), `lib/validacion.ts` (`preguntasVerificacionSchema`) · `schema.sql` (`preguntas_verif`, `respuestas_verif_una_fuente`) · `funciones.sql` (`crear_preguntas_verificacion`, `verificar_respuestas`, `preguntas_verificacion`, `resolver_verificacion`, `iniciar_verificacion`, `contactos_verificacion`) · `politicas.sql` (`verificaciones_*`, `respuestas_leer`, `reservados_solo_dueno`, sin privilegios sobre `preguntas_verif`) · `migraciones/h3_preguntas_del_verificador.sql` | Guion HU-03 · T-06 · T-10 · T-17 |
| **HU-04 · Ficha única con historial** | `paginas/Caso.tsx`, `componentes/LineaTiempo.tsx`, `componentes/Mapa.tsx`, `lib/eventos.ts` · `schema.sql` (`casos_publicos`) · `funciones.sql` (`eventos_inmutables`, `casos_despues_actualizar`) · `politicas.sql` (eventos) | Guion HU-04 · T-11 · T-12 |
| **HU07 · Importar casos de WhatsApp** (Sprint 2) | `paginas/ImportarCasos.tsx`, `lib/whatsapp.ts`, `lib/validacion.ts` (`origenImportacionSchema`), `componentes/RutaProtegida.tsx` y `FormularioPerfil.tsx` (rol `COORDINADOR`), `TarjetaReporte.tsx` y `paginas/Reporte.tsx` (insignia de origen) · `schema.sql` (`reportes.origen*`) · `funciones.sql` (`reportes_antes_guardar`, `cambiar_rol`) · `migraciones/h8` y `h9` | Guion HU07 · W-01…W-15 · T-18 |
| **HU10 · Casos parecidos por foto** (Sprint 3) | `paginas/BuscarPorFoto.tsx`, `lib/semejanza.ts`, `componentes/TarjetaCaso.tsx` | Guion HU10 · S-01…S-10 |
| **HU11 · Placa con código QR** (Sprint 3) | `paginas/PlacaMascota.tsx`, `paginas/PlacaPublica.tsx`, `componentes/CodigoQR.tsx`, `lib/validacion.ts` (`placaSchema`, `avisoPlacaSchema`) · `schema.sql` (`placas_qr`, `avisos_placa`) · `funciones.sql` (`solicitar_placa`, `cancelar_placa`, `placa_publica`, `avisar_dueno_placa`) · `politicas.sql` · `migraciones/h10` | Guion HU11 · T-19, T-20, T-21 |
| **Mejora · Recorrido de avistamientos** | `paginas/Caso.tsx` (`avistamientos`), `componentes/Mapa.tsx` (`ruta`, marcadores numerados) | Guion *Mejoras*, paso 1 |
| **Mejora · Difusión y cartel con QR** | `lib/compartir.ts`, `paginas/Caso.tsx` (*Ayuda a difundir*), `paginas/Cartel.tsx` | Guion *Mejoras*, paso 2 · D-01…D-05 |
| **Mejora · Jornadas de búsqueda** | `componentes/Jornadas.tsx`, `lib/validacion.ts` (`jornadaSchema`), `lib/eventos.ts` y `LineaTiempo.tsx` (evento `JORNADA`) · `schema.sql`, `funciones.sql`, `politicas.sql` · `migraciones/h11` | Guion *Mejoras*, pasos 3 y 4 · J-01…J-09 · D-09 |
| **Mejora · Ficha quieta** | `paginas/Panel.tsx`, `lib/compartir.ts` (`casoQuieto`) · `funciones.sql` (`avisar_fichas_quietas`) · `migraciones/h12` | Guion *Mejoras*, paso 5 · FQ-01…FQ-05 · D-06, D-07 |
| **Mejora · Orden, CSV, indicadores y ayuda** | `paginas/Buscar.tsx`, `lib/exportar.ts`, `paginas/Estadisticas.tsx`, `lib/estadisticas.ts`, `paginas/Ayuda.tsx`, `componentes/Layout.tsx` (pie y menú móvil) | Guion *Mejoras*, paso 6 · O-01…E-03 · ES-01…ES-04 |

---

## 11. Estado del backlog

Las 23 historias priorizadas, contrastadas contra lo que existe hoy. **18 hechas (una de ellas aproximada), 2 parciales y 3 sin empezar** (actualizado el 10/11/2026). Antes eran 16, 2 y 5, aunque esa cuenta no cuadraba con la tabla. Las tres de puntaje 100 están completas. Los Sprints 2 y 3 (HU05 a HU12 de los documentos del equipo) quedan completos.

| Puntaje | Historia | Estado | Dónde |
|---|---|---|---|
| 100 | Veterinario · registrar lectura de microchip | ✅ | HU-01. Además resuelve la consulta **antes** de guardar: muestra la ficha del animal y avisa si abrirá un caso |
| 100 | Propietario · confirmar o descartar coincidencias | ⚠️ Casi | HU-02. Confirmar y descartar funcionan, y lo descartado **nunca vuelve a sugerirse** (`on conflict do nothing`). Pero el motor no *aprende*: los pesos son fijos, así que «que las siguientes sean más precisas» solo se cumple en el sentido de no repetir |
| 100 | Ciudadano · verificar con datos que solo el dueño conocería | ✅ | HU-03, y por encima de lo pedido: si la mascota nunca se registró, **quien la encontró crea las preguntas** |
| 64 | Propietario · ficha única con historial | ✅ | HU-04. Avistamientos, cambios y contactos en una línea de tiempo inmutable |
| 64 | Ciudadano · identificar desde el celular sin instalar nada | ✅ | Web responsive, sin instalación y **sin cuenta**: no hay login en ninguna parte (decisiones 20 a 23) |
| 63 | Propietario · radio de difusión en km | ✅ | `casos.radio_km`, elegible al publicar y ampliable después; alimenta el motor |
| 49 | Ciudadano · reportar un animal aunque no sepa si está perdido | ✅ | `estado_animal` cubre *sigue en el lugar* y *se fue*; la galería ofrece explícitamente *No es ninguna de estas* |
| 49 | Propietario · revisar hallazgos anteriores a mi reporte | ✅ | Cruce retroactivo, ventana de 90 días, etiqueta **Retroactiva** · prueba T-03 |
| 49 | Ciudadano · subir foto y ver casos parecidos por semejanza | ✅ Aproximada | HU10. `/buscar-foto` compara la foto con las de los casos abiertos y los ordena por % de semejanza (color y forma general, en el navegador). **No reconoce al animal**: ver la decisión 27 |
| 49 | Coordinador de fundación · subir casos de WhatsApp | ✅ | HU07. Rol `COORDINADOR` y `/importar`: lee el chat, tapa los celulares, el coordinador revisa y publica. Entran como reportes (decisión 25) |
| 36 | Propietario · placa con código QR | ✅ | HU11. Pedido con datos de envío, QR imprimible y página pública sin teléfonos. **Falta** la integración con quien fabrica y envía la placa: el estado lo cambia un administrador a mano |
| 36 | Propietario · varias fotos desde distintos ángulos | ✅ | De 1 a 6 fotos por mascota |
| 36 | Ciudadano · alertas por WhatsApp o SMS | ⚠️ Parcial | La ficha se comparte por WhatsApp con un clic (decisión 28), pero **no hay envío automático**: requiere un proveedor de mensajería de pago (la API de WhatsApp Business o un servicio de SMS) |
| 35 | Propietario · mapa con la secuencia de avistamientos | ✅ | Avistamientos numerados y unidos por fecha en el mapa de la ficha (decisión 29) |
| 30 | Propietario de gato · indicar que es huraño | ✅ | `temperamento` + aviso destacado *«no intente atraparla»* en la ficha pública |
| 24 | Propietario · pegar el enlace de una publicación de redes | ❌ | |
| 24 | Voluntario · casos de mi zona por antigüedad | ✅ | `/buscar`: zona + *Más antiguos primero* (decisión 32). No hace falta un rol Voluntario: cualquiera puede buscar |
| 24 | Propietario · convocar una jornada de búsqueda | ✅ | Ficha del caso → *Jornadas de búsqueda* (decisión 30, `h11`) |
| 24 | Ciudadano · registrar un avistamiento aunque el animal ya se fue | ✅ | `estado_animal = SE_FUE`. Ojo: la tabla lo marca **Alta** con puntaje 24, incoherencia a revisar |
| 20 | Propietario · aviso si la ficha lleva días sin moverse | ✅ | `avisar_fichas_quietas()` con `pg_cron`, y aviso en el panel (decisión 31, `h12`). Para que sea automático hay que activar `pg_cron` en Supabase |
| 20 | Ciudadano · ofrecer acogida temporal | ❌ | |
| 9 | Propietario · cartel con QR y alto contraste | ✅ | `/caso/:id/cartel` (decisión 28) |
| 6 | Propietario · recordatorio periódico de revisión | ❌ | |

**Lo que falta**, por relación valor/esfuerzo:

1. **Alertas automáticas por WhatsApp o SMS** (36): es la de más puntaje, pero necesita un proveedor de pago y una función de servidor (Supabase Edge Function) que lea `notificaciones` y envíe. Los avisos ya se generan en la base, así que la integración solo añade un canal de salida.
2. **Que el motor aprenda de los descartes** (HU-02, 100, ⚠️): con lo descartado se podrían ajustar los pesos de cada criterio.
3. **Acogida temporal** (20): seguiría el mismo patrón que las jornadas (tabla sin privilegios, RPC y una tarjeta en la ficha del hallazgo).
4. **Pegar el enlace de una publicación de redes** (24) y **recordatorio periódico** (6): poco valor frente al resto.

Además, `supabase/todo.sql` es una concatenación antigua de los cuatro archivos y **no** incluye `COORDINADOR` ni las migraciones `h8` a `h12`. No lo uses: instala con `npm run db:aplicar` o con los archivos por separado.
