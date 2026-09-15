-- =====================================================================
-- ChipPet · Mascotas perdidas
-- 1/4  schema.sql — tipos, tablas, restricciones, índices y vistas
-- Ejecutar en el editor SQL de Supabase ANTES que funciones.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
create type public.rol_usuario        as enum ('PROPIETARIO', 'CIUDADANO', 'VETERINARIO', 'ADMIN');
create type public.especie_animal     as enum ('PERRO', 'GATO', 'OTRO');
create type public.tamano_animal      as enum ('PEQUENO', 'MEDIANO', 'GRANDE');
create type public.sexo_animal        as enum ('MACHO', 'HEMBRA', 'DESCONOCIDO');
create type public.temperamento_animal as enum ('TRANQUILA', 'SOCIABLE', 'NERVIOSA', 'HURANA', 'PUEDE_MORDER');
create type public.tipo_caso          as enum ('PERDIDA', 'HALLAZGO');
create type public.estado_caso        as enum ('ABIERTO', 'EN_VERIFICACION', 'RESUELTO', 'CERRADO');
create type public.desenlace_caso     as enum ('REENCONTRADA', 'NO_REENCONTRADA', 'FALLECIDA');
create type public.estado_animal      as enum ('SIGUE_EN_LUGAR', 'SE_FUE', 'LO_RECOGI', 'REQUIERE_ATENCION');
create type public.estado_coincidencia as enum ('SUGERIDA', 'CONFIRMADA', 'DESCARTADA', 'NO_SEGURO');
create type public.estado_verificacion as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'BLOQUEADA');

-- ---------------------------------------------------------------------
-- perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  nombre       text not null check (char_length(btrim(nombre)) between 2 and 80),
  telefono     text not null check (telefono ~ '^\+?[0-9 ]{7,15}$'),
  rol          public.rol_usuario not null default 'CIUDADANO',
  zona_lat     double precision check (zona_lat between -90 and 90),
  zona_lng     double precision check (zona_lng between -180 and 180),
  radio_km     double precision not null default 5 check (radio_km > 0 and radio_km <= 100),
  acepto_datos boolean not null check (acepto_datos),
  creado_en    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- mascotas
-- ---------------------------------------------------------------------
create table public.mascotas (
  id              uuid primary key default gen_random_uuid(),
  propietario_id  uuid not null references public.perfiles (id) on delete cascade,
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 60),
  especie         public.especie_animal not null,
  raza            text check (raza is null or char_length(raza) <= 60),
  color_principal text not null check (char_length(color_principal) between 2 and 30),
  tamano          public.tamano_animal not null,
  sexo            public.sexo_animal not null default 'DESCONOCIDO',
  microchip       text check (microchip is null or microchip ~ '^[0-9]{15}$'),
  temperamento    public.temperamento_animal not null default 'TRANQUILA',
  nota_manejo     text check (nota_manejo is null or char_length(nota_manejo) <= 300),
  creado_en       timestamptz not null default now()
);

-- Índice obligatorio y garantía de unicidad del microchip (NULL permitido varias veces)
create unique index mascotas_microchip_idx on public.mascotas (microchip);
create index mascotas_propietario_idx on public.mascotas (propietario_id);

create table public.fotos_mascota (
  id           uuid primary key default gen_random_uuid(),
  mascota_id   uuid not null references public.mascotas (id) on delete cascade,
  url          text not null check (url ~ '^https?://'),
  es_principal boolean not null default false,
  orden        smallint not null default 0 check (orden between 0 and 5)
);
create index fotos_mascota_mascota_idx on public.fotos_mascota (mascota_id, orden);

create table public.datos_reservados (
  id         uuid primary key default gen_random_uuid(),
  mascota_id uuid not null references public.mascotas (id) on delete cascade,
  pregunta   text not null check (char_length(btrim(pregunta)) between 5 and 200),
  respuesta  text not null check (char_length(btrim(respuesta)) between 1 and 200)
);
create index datos_reservados_mascota_idx on public.datos_reservados (mascota_id);

-- ---------------------------------------------------------------------
-- casos
-- ---------------------------------------------------------------------
create table public.casos (
  id                  uuid primary key default gen_random_uuid(),
  mascota_id          uuid references public.mascotas (id) on delete restrict,
  creador_id          uuid not null references public.perfiles (id) on delete restrict,
  tipo                public.tipo_caso not null,
  estado              public.estado_caso not null default 'ABIERTO',
  desenlace           public.desenlace_caso,
  lat                 double precision not null check (lat between -90 and 90),
  lng                 double precision not null check (lng between -180 and 180),
  lat_publica         double precision,
  lng_publica         double precision,
  direccion_texto     text check (direccion_texto is null or char_length(direccion_texto) <= 150),
  ocurrido_en         timestamptz not null,
  descripcion         text check (descripcion is null or char_length(descripcion) <= 1000),
  radio_km            double precision not null default 5 check (radio_km > 0 and radio_km <= 50),
  ultima_actividad_en timestamptz not null default now(),
  creado_en           timestamptz not null default now(),
  constraint casos_perdida_con_mascota check (tipo <> 'PERDIDA' or mascota_id is not null),
  constraint casos_cierre_con_desenlace check ((estado = 'CERRADO') = (desenlace is not null))
);

create index casos_estado_tipo_idx on public.casos (estado, tipo);
create index casos_lat_lng_idx     on public.casos (lat, lng);
create index casos_mascota_idx     on public.casos (mascota_id);
create index casos_creador_idx     on public.casos (creador_id);

-- Una mascota no puede tener dos casos de pérdida abiertos (HU C / T-14)
create unique index casos_una_perdida_abierta_idx
  on public.casos (mascota_id)
  where tipo = 'PERDIDA' and estado in ('ABIERTO', 'EN_VERIFICACION');

-- ---------------------------------------------------------------------
-- reportes (hallazgos y avistamientos de ciudadanos)
-- ---------------------------------------------------------------------
create table public.reportes (
  id            uuid primary key default gen_random_uuid(),
  autor_id      uuid not null references public.perfiles (id) on delete cascade,
  especie       public.especie_animal not null,
  raza          text check (raza is null or char_length(raza) <= 60),
  color         text check (color is null or char_length(color) <= 30),
  tamano        public.tamano_animal,
  sexo          public.sexo_animal,
  estado_animal public.estado_animal not null,
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  ocurrido_en   timestamptz not null,
  nota          text check (nota is null or char_length(nota) <= 500),
  foto_url      text not null check (foto_url ~ '^https?://'),
  creado_en     timestamptz not null default now()
);

create index reportes_lat_lng_idx     on public.reportes (lat, lng);
create index reportes_ocurrido_en_idx on public.reportes (ocurrido_en);
create index reportes_autor_idx       on public.reportes (autor_id);

-- ---------------------------------------------------------------------
-- lecturas_microchip (HU-01) — inmutables, solo anulables
-- ---------------------------------------------------------------------
create table public.lecturas_microchip (
  id               uuid primary key default gen_random_uuid(),
  veterinario_id   uuid not null references public.perfiles (id) on delete restrict,
  codigo           text not null check (codigo ~ '^[0-9]{15}$'),
  mascota_id       uuid references public.mascotas (id) on delete set null,
  caso_id          uuid references public.casos (id) on delete restrict,
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  establecimiento  text not null check (char_length(btrim(establecimiento)) between 2 and 120),
  leido_en         timestamptz not null default now(),
  anulada          boolean not null default false,
  motivo_anulacion text,
  anulada_en       timestamptz,
  creado_en        timestamptz not null default now(),
  constraint lecturas_anulacion_justificada
    check (not anulada or (motivo_anulacion is not null and char_length(btrim(motivo_anulacion)) >= 10))
);
create index lecturas_codigo_idx on public.lecturas_microchip (codigo);
create index lecturas_caso_idx   on public.lecturas_microchip (caso_id);
create index lecturas_vet_idx    on public.lecturas_microchip (veterinario_id, leido_en desc);

-- ---------------------------------------------------------------------
-- coincidencias (motor de cruce)
-- ---------------------------------------------------------------------
create table public.coincidencias (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos (id) on delete cascade,
  reporte_id  uuid not null references public.reportes (id) on delete cascade,
  puntaje     smallint not null check (puntaje between 0 and 100),
  motivos     jsonb not null default '[]'::jsonb check (jsonb_typeof(motivos) = 'array'),
  estado      public.estado_coincidencia not null default 'SUGERIDA',
  retroactiva boolean not null default false,
  creado_en   timestamptz not null default now(),
  decidida_en timestamptz,
  constraint coincidencias_unica unique (caso_id, reporte_id)
);
create index coincidencias_caso_idx on public.coincidencias (caso_id, estado);

-- ---------------------------------------------------------------------
-- verificaciones (HU-03)
-- ---------------------------------------------------------------------
create table public.verificaciones (
  id              uuid primary key default gen_random_uuid(),
  caso_id         uuid not null references public.casos (id) on delete cascade,
  reclamante_id   uuid not null references public.perfiles (id) on delete restrict,
  verificador_id  uuid not null references public.perfiles (id) on delete restrict,
  coincidencia_id uuid references public.coincidencias (id) on delete set null,
  estado          public.estado_verificacion not null default 'PENDIENTE',
  intentos        smallint not null default 0 check (intentos between 0 and 3),
  superada        boolean not null default false,
  creado_en       timestamptz not null default now(),
  resuelta_en     timestamptz,
  constraint verificaciones_partes_distintas check (reclamante_id <> verificador_id)
);
create index verificaciones_caso_idx on public.verificaciones (caso_id, reclamante_id);

-- Solo una verificación pendiente por caso y reclamante a la vez
create unique index verificaciones_una_pendiente_idx
  on public.verificaciones (caso_id, reclamante_id)
  where estado = 'PENDIENTE';

create table public.respuestas_verif (
  id                uuid primary key default gen_random_uuid(),
  verificacion_id   uuid not null references public.verificaciones (id) on delete cascade,
  dato_reservado_id uuid not null references public.datos_reservados (id) on delete cascade,
  intento           smallint not null check (intento between 1 and 3),
  respuesta_dada    text not null check (char_length(respuesta_dada) <= 200),
  coincide_auto     boolean not null,
  correcta          boolean,
  creado_en         timestamptz not null default now()
);
create index respuestas_verif_idx on public.respuestas_verif (verificacion_id, intento);

-- ---------------------------------------------------------------------
-- eventos (historial INMUTABLE del caso)
-- ---------------------------------------------------------------------
create table public.eventos (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.casos (id) on delete restrict,
  tipo        text not null check (tipo in (
                'CREACION', 'AVISTAMIENTO', 'LECTURA_MICROCHIP', 'LECTURA_ANULADA',
                'COINCIDENCIA_SUGERIDA', 'COINCIDENCIA_CONFIRMADA', 'COINCIDENCIA_DESCARTADA',
                'COINCIDENCIA_NO_SEGURO', 'VERIFICACION_INICIADA', 'VERIFICACION_INTENTO',
                'VERIFICACION_APROBADA', 'VERIFICACION_RECHAZADA', 'VERIFICACION_BLOQUEADA',
                'CAMBIO_DATOS', 'CAMBIO_ESTADO', 'RADIO_AMPLIADO', 'CIERRE')),
  autor_id    uuid references public.perfiles (id) on delete set null,
  descripcion text not null check (char_length(descripcion) between 1 and 500),
  creado_en   timestamptz not null default now()
);
create index eventos_caso_creado_idx on public.eventos (caso_id, creado_en);

-- ---------------------------------------------------------------------
-- notificaciones (in-app)
-- ---------------------------------------------------------------------
create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  titulo     text not null,
  cuerpo     text not null,
  enlace     text,
  leida_en   timestamptz,
  creado_en  timestamptz not null default now()
);
create index notificaciones_usuario_idx on public.notificaciones (usuario_id, creado_en desc);

-- ---------------------------------------------------------------------
-- Vistas públicas (proyecciones sin datos sensibles)
--   · perfiles_publicos: solo nombre y rol (sin teléfono)
--   · casos_publicos: sin lat/lng exactos; incluye casos cerrados para que la
--     ficha /caso/:id siga siendo consultable por enlace (HU-04.8)
-- Las vistas se ejecutan con los privilegios de su dueño, por eso solo
-- exponen columnas no sensibles.
-- ---------------------------------------------------------------------
create view public.perfiles_publicos as
  select p.id, p.nombre, p.rol
  from public.perfiles p;

create view public.casos_publicos as
  select
    c.id, c.mascota_id, c.creador_id, c.tipo, c.estado, c.desenlace,
    c.lat_publica, c.lng_publica, c.direccion_texto, c.ocurrido_en, c.descripcion,
    c.radio_km, c.ultima_actividad_en, c.creado_en,
    m.nombre          as mascota_nombre,
    m.especie         as especie,
    m.raza            as raza,
    m.color_principal as color_principal,
    m.tamano          as tamano,
    m.sexo            as sexo,
    m.temperamento    as temperamento,
    m.nota_manejo     as nota_manejo,
    (select f.url from public.fotos_mascota f
      where f.mascota_id = m.id
      order by f.es_principal desc, f.orden asc
      limit 1)        as foto_url
  from public.casos c
  left join public.mascotas m on m.id = c.mascota_id;

-- Tiempo real para la campana de notificaciones
alter publication supabase_realtime add table public.notificaciones;
