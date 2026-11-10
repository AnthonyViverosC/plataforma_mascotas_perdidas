import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearUsuario, leerSql } from './baseDePrueba';

const DUENA = '11111111-1111-1111-1111-111111111111';
const CIUDADANO = '22222222-2222-2222-2222-222222222222';
const TERCERO = '33333333-3333-3333-3333-333333333333';
const MASCOTA = '44444444-4444-4444-4444-444444444444';

let db: PGlite;
let caso: string;
let jornada: string;

const notificaciones = async (uid: string, titulo: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.notificaciones where usuario_id = $1 and titulo like $2`, [uid, titulo])).rows[0].n;

const convocar = (uid: string, dentro: string, punto = 'Parque Bolívar') =>
  como<{ id: string }>(db, uid, `select public.convocar_jornada($1, now() + $2::interval, $3, null) as id`, [caso, dentro, punto]);

describe('jornadas de búsqueda (SQL, migración h11)', () => {
  beforeAll(async () => {
    // Instalación limpia y, encima, la migración: también prueba que es idempotente.
    db = await crearBase(['migraciones/h11_jornadas_busqueda.sql']);
    await db.exec(await leerSql('migraciones/h11_jornadas_busqueda.sql'));

    await crearUsuario(db, DUENA, 'Laura', 'PROPIETARIO');
    await crearUsuario(db, CIUDADANO, 'Andrés', 'CIUDADANO');
    await crearUsuario(db, TERCERO, 'Marta', 'CIUDADANO');
    // La mascota se inserta sin los triggers diferidos (fotos y datos reservados), que aquí no interesan.
    await db.exec(`set session_replication_role = replica;
      insert into public.mascotas (id, propietario_id, nombre, especie, color_principal, tamano)
      values ('${MASCOTA}', '${DUENA}', 'Max', 'PERRO', 'Café', 'GRANDE');
      set session_replication_role = origin;`);
    caso = (
      await db.query<{ id: string }>(
        `insert into public.casos (mascota_id, creador_id, tipo, lat, lng, ocurrido_en) values ($1, $2, 'PERDIDA', 1.21, -77.28, now()) returning id`,
        [MASCOTA, DUENA],
      )
    ).rows[0].id;
    const reporte = (
      await db.query<{ id: string }>(
        `insert into public.reportes (autor_id, especie, estado_animal, lat, lng, ocurrido_en, foto_url)
         values ($1, 'PERRO', 'SE_FUE', 1.21, -77.28, now(), 'https://x.test/a.jpg') returning id`,
        [CIUDADANO],
      )
    ).rows[0].id;
    await db.query(`insert into public.coincidencias (caso_id, reporte_id, puntaje) values ($1, $2, 80)`, [caso, reporte]);
  }, 60_000);

  it('J-01 solo quien publicó el caso puede convocar', async () => {
    expect((await convocar(CIUDADANO, '2 days')).error).toMatch(/Solo quien publicó/);
  });

  it('J-02 la hora debe estar entre 30 minutos y 30 días desde ahora', async () => {
    expect((await convocar(DUENA, '10 minutes')).error).toMatch(/30 minutos/);
    expect((await convocar(DUENA, '40 days')).error).toMatch(/30 días/);
  });

  it('J-03 el dueño convoca: queda en el historial y avisa a quien la vio', async () => {
    const r = await convocar(DUENA, '2 days');
    expect(r.error).toBeUndefined();
    jornada = r.filas![0].id;
    const ev = await db.query(`select 1 from public.eventos where caso_id = $1 and tipo = 'JORNADA'`, [caso]);
    expect(ev.rows).toHaveLength(1);
    expect(await notificaciones(CIUDADANO, 'Jornada para buscar a Max')).toBe(1);
  });

  it('J-04 un visitante sin sesión ve la jornada, pero no la tabla', async () => {
    const r = await como<{ punto_texto: string; asistentes: number }>(db, null, `select * from public.jornadas_caso($1)`, [caso]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas![0]).toMatchObject({ punto_texto: 'Parque Bolívar', asistentes: 0 });
    expect((await como(db, null, `select * from public.jornadas_busqueda`)).error).toMatch(/permission denied/);
    expect((await como(db, null, `select public.apuntarse_jornada($1)`, [jornada])).error).toBeDefined();
  });

  it('J-05 apuntarse dos veces cuenta una y avisa una sola vez', async () => {
    await como(db, CIUDADANO, `select public.apuntarse_jornada($1)`, [jornada]);
    await como(db, CIUDADANO, `select public.apuntarse_jornada($1)`, [jornada]);
    const r = await como<{ asistentes: number; yo_asisto: boolean }>(db, CIUDADANO, `select * from public.jornadas_caso($1)`, [caso]);
    expect(r.filas![0]).toMatchObject({ asistentes: 1, yo_asisto: true });
    expect(await notificaciones(DUENA, 'Alguien se sumó%')).toBe(1);
  });

  it('J-06 el organizador no se apunta a la suya y un tercero no la cancela', async () => {
    expect((await como(db, DUENA, `select public.apuntarse_jornada($1)`, [jornada])).error).toMatch(/Eres quien convoca/);
    expect((await como(db, TERCERO, `select public.cancelar_jornada($1)`, [jornada])).error).toMatch(/Solo quien convocó/);
  });

  it('J-07 cancelar avisa a los asistentes y cierra la inscripción', async () => {
    expect((await como(db, DUENA, `select public.cancelar_jornada($1)`, [jornada])).error).toBeUndefined();
    expect(await notificaciones(CIUDADANO, 'Jornada cancelada')).toBe(1);
    expect((await como(db, TERCERO, `select public.apuntarse_jornada($1)`, [jornada])).error).toMatch(/cancelada/);
  });

  it('J-08 máximo 3 jornadas próximas por caso', async () => {
    for (let i = 0; i < 3; i++) expect((await convocar(DUENA, '3 days', 'Plaza del Carnaval')).error).toBeUndefined();
    expect((await convocar(DUENA, '3 days', 'Plaza del Carnaval')).error).toMatch(/3 jornadas/);
  });

  it('J-09 no se convoca en un caso cerrado', async () => {
    await db.query(`update public.casos set estado = 'CERRADO', desenlace = 'REENCONTRADA' where id = $1`, [caso]);
    expect((await convocar(DUENA, '3 days')).error).toMatch(/abiertos/);
  });
});
