import { describe, expect, it } from 'vitest';
import { mediana, porSemana, resumir, type CasoEstadistica } from '../src/lib/estadisticas';

const ahora = new Date('2026-11-10T12:00:00Z');
const caso = (p: Partial<CasoEstadistica>): CasoEstadistica => ({
  tipo: 'PERDIDA',
  estado: 'ABIERTO',
  desenlace: null,
  especie: 'PERRO',
  creado_en: '2026-11-01T12:00:00Z',
  ultima_actividad_en: '2026-11-02T12:00:00Z',
  ...p,
});

describe('estadísticas públicas', () => {
  it('ES-01 mediana par, impar y vacía', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it('ES-02 cuenta reencuentros por RESUELTO o desenlace REENCONTRADA', () => {
    const r = resumir(
      [
        caso({}),
        caso({ estado: 'EN_VERIFICACION', especie: 'GATO' }),
        caso({ estado: 'RESUELTO', ultima_actividad_en: '2026-11-03T12:00:00Z' }),
        caso({ estado: 'CERRADO', desenlace: 'REENCONTRADA', ultima_actividad_en: '2026-11-05T12:00:00Z' }),
        caso({ estado: 'CERRADO', desenlace: 'NO_REENCONTRADA' }),
        caso({ tipo: 'HALLAZGO' }),
      ],
      ahora,
    );
    expect(r.activos).toBe(2);
    expect(r.reencontradas).toBe(2);
    expect(r.terminados).toBe(3);
    expect(r.tasaReencuentro).toBe(67);
    expect(r.medianaDiasReencuentro).toBe(3); // 2 y 4 días
    expect(r.hallazgosActivos).toBe(1);
    expect(r.porEspecie).toEqual({ PERRO: 1, GATO: 1, OTRO: 0 });
  });

  it('ES-03 sin casos terminados la tasa es null, no 0', () => {
    expect(resumir([caso({})], ahora).tasaReencuentro).toBeNull();
  });

  it('ES-04 agrupa por semana y descarta lo que sale de la ventana', () => {
    const s = porSemana(
      [
        caso({ creado_en: '2026-11-10T00:00:00Z' }),
        caso({ creado_en: '2026-11-02T00:00:00Z' }),
        caso({ creado_en: '2025-01-01T00:00:00Z' }),
        caso({ tipo: 'HALLAZGO', creado_en: '2026-11-10T00:00:00Z' }),
      ],
      4,
      ahora,
    );
    expect(s).toEqual([0, 0, 1, 1]);
  });
});
