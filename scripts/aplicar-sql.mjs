// Aplica los SQL de /supabase en orden contra la base de datos de Supabase.
// Uso: npm run db:aplicar            (lee SUPABASE_DB_URL desde .env)
//      npm run db:aplicar -- --sin-seed
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const sinSeed = process.argv.includes('--sin-seed');
const archivos = ['schema.sql', 'funciones.sql', 'politicas.sql', ...(sinSeed ? [] : ['seed.sql'])];

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Falta SUPABASE_DB_URL en .env (Supabase → Connect → Session pooler).');
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await cliente.connect();
} catch (e) {
  console.error(
    e.code === '28P01'
      ? 'Contraseña incorrecta. Revísala o créala de nuevo en Supabase → Project Settings → Database.'
      : `No se pudo conectar a la base de datos: ${e.message}`,
  );
  process.exit(1);
}

try {
  const { rows } = await cliente.query("select to_regclass('public.perfiles') is not null as existe");
  if (rows[0].existe) {
    console.error('La base ya tiene el esquema aplicado (existe public.perfiles). No se hizo ningún cambio.');
    process.exitCode = 1;
  } else {
    for (const archivo of archivos) {
      process.stdout.write(`→ ${archivo}… `);
      await cliente.query(await readFile(join(raiz, archivo), 'utf8'));
      console.log('ok');
    }
    console.log('Base de datos lista.');
  }
} catch (e) {
  console.error(`\nError: ${e.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
