// Ejecuta un archivo .sql contra Supabase e imprime las filas del último resultado.
// Uso: node --env-file=.env scripts/ejecutar-sql.mjs ruta/al/archivo.sql
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const archivo = process.argv[2];
if (!archivo || !process.env.SUPABASE_DB_URL) {
  console.error('Uso: node --env-file=.env scripts/ejecutar-sql.mjs archivo.sql (requiere SUPABASE_DB_URL en .env)');
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
try {
  await cliente.connect();
  const res = await cliente.query(await readFile(archivo, 'utf8'));
  const ultimo = Array.isArray(res) ? res[res.length - 1] : res;
  if (ultimo?.rows?.length) console.table(ultimo.rows);
  else console.log(`ok (${ultimo?.command ?? 'sin resultado'})`);
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
