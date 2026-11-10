import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { como, crearBase, crearUsuario } from './baseDePrueba';

/**
 * Garantías de privacidad y de integridad que viven en la base (README,
 * decisiones 4, 5, 6, 10, 12 y 22). Se prueban con los roles reales del
 * cliente: anon y authenticated.
 */
const DUENA = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTRO = 'aaaaaaaa-0000-0000-0000-000000000002';
const MASCOTA = 'aaaaaaaa-0000-0000-0000-0000000000aa';

let db: PGlite;
let caso: string;

describe('seguridad en la base (SQL)', () => {
  beforeAll(async () => {
    db = await crearBase();
    await crearUsuario(db, DUENA, 'Laura', 'PROPIETARIO');
    await crearUsuario(db, OTRO, 'Pedro', 'CIUDADANO');
    await db.exec(`set session_replication_role = replica;
      insert into public.mascotas (id, propietario_id, nombre, especie, color_principal, tamano)
      values ('${MASCOTA}', '${DUENA}', 'Luna', 'GATO', 'Gris', 'PEQUENO');
      set session_replication_role = origin;`);
    caso = (
      await db.query<{ id: string }>(
        `insert into public.casos (mascota_id, creador_id, tipo, lat, lng, ocurrido_en) values ($1, $2, 'PERDIDA', 1.2136, -77.2811, now()) returning id`,
        [MASCOTA, DUENA],
      )
    ).rows[0].id;
  }, 60_000);

  it('SQ-01 nadie del cliente lee la ubicación exacta del caso', async () => {
    expect((await como(db, null, `select lat, lng from public.casos`)).error).toMatch(/permission denied/);
    expect((await como(db, OTRO, `select lat from public.casos`)).error).toMatch(/permission denied/);
  });

  it('SQ-02 el punto público queda entre 100 y 300 m del real', async () => {
    const r = await db.query<{ m: number }>(
      `select public.distancia_km(lat, lng, lat_publica, lng_publica) * 1000 as m from public.casos where id = $1`,
      [caso],
    );
    expect(r.rows[0].m).toBeGreaterThanOrEqual(99);
    expect(r.rows[0].m).toBeLessThanOrEqual(301);
  });

  it('SQ-03 solo la creadora obtiene la ubicación exacta', async () => {
    const suya = await como<{ lat: number }>(db, DUENA, `select * from public.ubicacion_exacta_caso($1)`, [caso]);
    expect(suya.filas?.[0]?.lat).toBeCloseTo(1.2136, 4);
    const ajena = await como(db, OTRO, `select * from public.ubicacion_exacta_caso($1)`, [caso]);
    expect(ajena.filas?.length ?? 0).toBe(0);
  });

  it('SQ-04 el perfil público no expone el teléfono', async () => {
    expect((await como(db, null, `select telefono from public.perfiles_publicos`)).error).toBeDefined();
    const r = await como<{ nombre: string }>(db, null, `select nombre from public.perfiles_publicos where id = $1`, [DUENA]);
    expect(r.filas?.[0]?.nombre).toBe('Laura');
  });

  it('SQ-05 nadie se vuelve administrador, ni al registrarse ni cambiando de perfil', async () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000009';
    await crearUsuario(db, id, 'Intruso', 'ADMIN');
    const rol = await db.query<{ rol: string }>(`select rol from public.perfiles where id = $1`, [id]);
    expect(rol.rows[0].rol).toBe('CIUDADANO');
    expect((await como(db, OTRO, `select public.cambiar_rol('ADMIN')`)).error).toMatch(/administrador/);
    expect((await como(db, OTRO, `update public.perfiles set rol = 'ADMIN' where id = $1`, [OTRO])).error).toMatch(/permission denied/);
  });

  it('SQ-06 un ciudadano no puede crear un caso de pérdida', async () => {
    const r = await como(db, OTRO, `insert into public.casos (mascota_id, creador_id, tipo, lat, lng, ocurrido_en) values ($1, $2, 'PERDIDA', 1, -77, now())`, [
      MASCOTA,
      OTRO,
    ]);
    expect(r.error).toMatch(/row-level security/);
  });

  it('SQ-07 el historial es inmutable, incluso para el superusuario', async () => {
    await expect(db.query(`update public.eventos set descripcion = 'x' where caso_id = $1`, [caso])).rejects.toThrow(/inmutable/);
    await expect(db.query(`delete from public.eventos where caso_id = $1`, [caso])).rejects.toThrow(/inmutable/);
  });

  it('SQ-08 el teléfono del dueño se publica solo mientras el caso está vivo', async () => {
    const vivo = await como<{ telefono: string }>(db, null, `select * from public.contacto_caso($1)`, [caso]);
    expect(vivo.filas?.[0]?.telefono).toBe('3001234567');
    await db.query(`update public.casos set estado = 'CERRADO', desenlace = 'REENCONTRADA' where id = $1`, [caso]);
    const cerrado = await como(db, null, `select * from public.contacto_caso($1)`, [caso]);
    expect(cerrado.filas?.length ?? 0).toBe(0);
  });
});
