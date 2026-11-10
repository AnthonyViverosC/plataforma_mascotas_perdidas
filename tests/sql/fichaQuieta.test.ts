import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearUsuario, leerSql } from './baseDePrueba';

const DUENA = 'bbbbbbbb-0000-0000-0000-000000000001';
const MASCOTA = 'bbbbbbbb-0000-0000-0000-0000000000aa';
const OTRA = 'bbbbbbbb-0000-0000-0000-0000000000bb';

let db: PGlite;
let quieto: string;
let reciente: string;

const avisos = async () =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.notificaciones where titulo like 'La ficha de % está quieta'`)).rows[0].n;

describe('aviso por ficha quieta (SQL, migración h12)', () => {
  beforeAll(async () => {
    db = await crearBase();
    await crearUsuario(db, DUENA, 'Laura', 'PROPIETARIO');
    await db.exec(`set session_replication_role = replica;
      insert into public.mascotas (id, propietario_id, nombre, especie, color_principal, tamano) values
        ('${MASCOTA}', '${DUENA}', 'Max', 'PERRO', 'Café', 'GRANDE'),
        ('${OTRA}', '${DUENA}', 'Nina', 'GATO', 'Negro', 'PEQUENO');
      set session_replication_role = origin;`);
    const crear = async (m: string) =>
      (
        await db.query<{ id: string }>(
          `insert into public.casos (mascota_id, creador_id, tipo, lat, lng, ocurrido_en) values ($1, $2, 'PERDIDA', 1.21, -77.28, now()) returning id`,
          [m, DUENA],
        )
      ).rows[0].id;
    quieto = await crear(MASCOTA);
    reciente = await crear(OTRA);
    await db.query(`update public.casos set ultima_actividad_en = now() - interval '5 days' where id = $1`, [quieto]);
  }, 60_000);

  it('FQ-01 avisa solo por el caso que lleva 3 días o más sin actividad', async () => {
    const r = await db.query<{ n: number }>(`select public.avisar_fichas_quietas() as n`);
    expect(r.rows[0].n).toBe(1);
    const n = await db.query<{ titulo: string; enlace: string; cuerpo: string }>(`select titulo, enlace, cuerpo from public.notificaciones where titulo like 'La ficha%'`);
    expect(n.rows[0]).toMatchObject({ titulo: 'La ficha de Max está quieta', enlace: `/caso/${quieto}` });
    expect(n.rows[0].cuerpo).toMatch(/Lleva 5 días/);
  });

  it('FQ-02 no repite el aviso dentro de la misma ventana', async () => {
    expect((await db.query<{ n: number }>(`select public.avisar_fichas_quietas() as n`)).rows[0].n).toBe(0);
    expect(await avisos()).toBe(1);
  });

  it('FQ-03 no avisa por casos cerrados', async () => {
    await db.query(`update public.casos set estado = 'CERRADO', desenlace = 'NO_REENCONTRADA', ultima_actividad_en = now() - interval '9 days' where id = $1`, [reciente]);
    await db.query(`delete from public.notificaciones`);
    await db.query(`update public.casos set ultima_actividad_en = now() - interval '9 days' where id = $1`, [quieto]);
    expect((await db.query<{ n: number }>(`select public.avisar_fichas_quietas() as n`)).rows[0].n).toBe(1);
  });

  it('FQ-04 nadie del cliente puede dispararla', async () => {
    expect((await como(db, DUENA, `select public.avisar_fichas_quietas()`)).error).toMatch(/permission denied/);
    expect((await como(db, null, `select public.avisar_fichas_quietas()`)).error).toMatch(/permission denied/);
  });

  it('FQ-05 la migración es idempotente', async () => {
    await expect(db.exec(await leerSql('migraciones/h12_aviso_ficha_quieta.sql'))).resolves.toBeDefined();
  });
});
