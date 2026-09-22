// Aplica archivos de supabase/migraciones/ sobre una base YA creada.
//
// `npm run db:aplicar` sirve solo para instalaciones limpias: se niega a correr
// si el esquema ya existe. Para una base en uso, este es el camino.
//
//   npm run db:migrar -- --revisar
//   npm run db:migrar -- supabase/migraciones/h1_lectura_microchip.sql
//   npm run db:migrar -- supabase/migraciones/*.sql
//
// Cada archivo trae su propio begin/commit: si algo falla, esa migración se
// revierte entera y no se sigue con las siguientes. La cadena de conexión
// nunca se imprime.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
const soloRevisar = args.includes('--revisar');
const archivos = args.filter((a) => !a.startsWith('--'));

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env (Supabase → Connect → Session pooler).');
  process.exit(1);
}
if (!soloRevisar && archivos.length === 0) {
  console.error('Indica al menos un archivo, o usa --revisar para ver el estado.');
  process.exit(1);
}

// Qué ha entrado ya. Añade aquí una línea por cada migración nueva.
const REVISION = `
select
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='lecturas_microchip' and column_name='leido_por')        as h1_leido_por,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='lecturas_microchip'
             and column_name='lat' and is_nullable='YES')                                                     as h1_lat_opcional,
  exists (select 1 from pg_proc where proname='consultar_microchip')                                          as h1_consultar_microchip,
  to_regclass('public.preguntas_verif') is not null                                                           as h3_tabla_preguntas,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='respuestas_verif' and column_name='pregunta_verif_id')  as h3_columna_fuente,
  exists (select 1 from pg_proc where proname='crear_preguntas_verificacion')                                 as h3_crear_preguntas,
  exists (select 1 from public.casos where id='c0000000-0000-0000-0000-000000000005')                         as h4_fixture_demo,
  exists (select 1 from pg_proc where proname='cambiar_rol')                                                  as h5_cambiar_rol,
  exists (select 1 from pg_proc where proname='contacto_reporte')                                             as h6_contacto_reporte;
`;

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await cliente.connect();
} catch (e) {
  console.error(
    e.code === '28P01'
      ? 'Contraseña incorrecta en SUPABASE_DB_URL. Revísala en Supabase → Project Settings → Database.'
      : `No se pudo conectar a la base de datos: ${e.message}`,
  );
  process.exit(1);
}

const revisar = async (titulo) => {
  const { rows } = await cliente.query(REVISION);
  console.log(`\n--- ${titulo} ---`);
  for (const [clave, valor] of Object.entries(rows[0])) console.log(`  ${clave.padEnd(24)} ${valor}`);
};

try {
  await revisar(soloRevisar ? 'Estado actual' : 'Antes');

  if (!soloRevisar) {
    for (const archivo of archivos) {
      process.stdout.write(`\n→ ${archivo} … `);
      try {
        await cliente.query(await readFile(resolve(archivo), 'utf8'));
        console.log('ok');
      } catch (e) {
        console.log('FALLÓ (revertida)');
        console.error(`   ${e.message}`);
        process.exitCode = 1;
        break;
      }
    }
    await revisar('Después');
  }
} catch (e) {
  console.error(`\nError: ${e.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
