import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

/**
 * Postgres real en memoria (PGlite) con lo mínimo de Supabase para que los
 * SQL del proyecto carguen tal cual: roles anon/authenticated, auth.uid() y
 * el esquema storage. Así las funciones, triggers y permisos se prueban sin
 * depender de un proyecto de Supabase en línea.
 */
const STUB_SUPABASE = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('prueba.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

const SUPABASE = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase');

export const leerSql = (archivo: string) => readFile(resolve(SUPABASE, archivo), 'utf8');

/** Base limpia con schema.sql, funciones.sql y politicas.sql (más los archivos extra que se pidan). */
export async function crearBase(extra: string[] = []): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB_SUPABASE);
  for (const f of ['schema.sql', 'funciones.sql', 'politicas.sql', ...extra]) await db.exec(await leerSql(f));
  return db;
}

export type Resultado<T> = { filas: T[]; error?: undefined } | { filas?: undefined; error: string };

/**
 * Ejecuta una consulta con el rol del cliente: `authenticated` con ese uid, o
 * `anon` si uid es null. Igual que una llamada desde el navegador.
 */
export async function como<T = Record<string, unknown>>(db: PGlite, uid: string | null, sql: string, params: unknown[] = []): Promise<Resultado<T>> {
  await db.exec(`reset role; select set_config('prueba.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try {
    return { filas: (await db.query<T>(sql, params)).rows };
  } catch (e) {
    return { error: (e as Error).message };
  } finally {
    await db.exec('reset role');
  }
}

/** Crea un usuario: el trigger de auth.users le crea el perfil, como en Supabase. */
export async function crearUsuario(db: PGlite, id: string, nombre: string, rol: string) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${id.slice(0, 8)}@prueba.test`,
    JSON.stringify({ nombre, telefono: '3001234567', rol, acepto_datos: true }),
  ]);
}
