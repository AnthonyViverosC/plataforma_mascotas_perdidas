import { describe, expect, it } from 'vitest';
import { crearBase, leerSql } from './baseDePrueba';

describe('instalación de la base (SQL)', () => {
  it('IN-01 los tres archivos base cargan en una base limpia y las migraciones h11 y h12 se pueden reaplicar encima', async () => {
    const db = await crearBase();
    for (const f of ['migraciones/h11_jornadas_busqueda.sql', 'migraciones/h12_aviso_ficha_quieta.sql']) {
      await expect(db.exec(await leerSql(f))).resolves.toBeDefined();
    }
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc where proname in ('convocar_jornada', 'jornadas_caso', 'avisar_fichas_quietas', 'placa_publica', 'cambiar_rol')`,
    );
    expect(r.rows[0].n).toBe(5);
  }, 60_000);
});
