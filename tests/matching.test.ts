import { describe, expect, it } from 'vitest';
import {
  UMBRAL_COINCIDENCIA,
  calcularCoincidencia,
  cruzarCaso,
  describirMotivos,
  evaluarCoincidencia,
  type CasoParaCruce,
  type HallazgoParaCruce,
} from '../src/lib/matching';
import { desplazar, distanciaKm } from '../src/lib/geo';

const HORA = 3_600_000;
const DIA = 24 * HORA;
const centro = { lat: 1.2136, lng: -77.2811 };
const perdida = new Date('2026-09-10T08:00:00-05:00');

function caso(parcial: Partial<CasoParaCruce> = {}): CasoParaCruce {
  return {
    id: 'caso-1',
    especie: 'PERRO',
    raza: 'Pastor alemán',
    color: 'Negro',
    tamano: 'GRANDE',
    sexo: 'MACHO',
    microchip: null,
    lat: centro.lat,
    lng: centro.lng,
    radioKm: 5,
    ocurridoEn: perdida,
    creadoEn: new Date(perdida.getTime() + HORA),
    ...parcial,
  };
}

function hallazgo(parcial: Partial<HallazgoParaCruce> = {}): HallazgoParaCruce {
  const p = desplazar(centro, 1000, 90);
  const ocurrido = new Date(perdida.getTime() + 6 * HORA);
  return {
    id: 'rep-1',
    especie: 'PERRO',
    raza: 'Pastor Alemán',
    color: 'negro',
    tamano: 'GRANDE',
    sexo: 'MACHO',
    microchip: null,
    lat: p.lat,
    lng: p.lng,
    ocurridoEn: ocurrido,
    publicadoEn: new Date(ocurrido.getTime() + HORA),
    ...parcial,
  };
}

describe('Motor de coincidencias', () => {
  it('T-01 · misma raza, 1 km, 6 h después → puntaje ≥ 80 con motivos desglosados', () => {
    const h = hallazgo();
    expect(distanciaKm(centro, h)).toBeCloseTo(1, 1);

    const r = evaluarCoincidencia(caso(), h);
    expect(r).not.toBeNull();
    expect(r!.puntaje).toBeGreaterThanOrEqual(80);
    expect(r!.retroactiva).toBe(false);

    const criterios = r!.motivos.map((m) => m.criterio);
    expect(criterios).toEqual(expect.arrayContaining(['DISTANCIA', 'TIEMPO', 'RAZA', 'COLOR', 'TAMANO', 'SEXO']));
    expect(r!.motivos.find((m) => m.criterio === 'RAZA')!.aporte).toBe(20);
    expect(r!.motivos.find((m) => m.criterio === 'DISTANCIA')!.aporte).toBeCloseTo(24, 0);
    expect(r!.motivos.find((m) => m.criterio === 'TIEMPO')!.aporte).toBeCloseTo(19.3, 1);

    const texto = describirMotivos(r!.motivos);
    expect(texto).toContain('misma raza');
    expect(texto).toContain('a 1 km');
    expect(texto).toContain('6 horas después de la pérdida');
  });

  it('T-02 · especies distintas → sin coincidencia', () => {
    expect(calcularCoincidencia(caso(), hallazgo({ especie: 'GATO' }))).toBeNull();
    expect(evaluarCoincidencia(caso(), hallazgo({ especie: 'GATO' }))).toBeNull();
  });

  it('T-03 · hallazgo 30 días antes de la pérdida → coincidencia retroactiva', () => {
    const ocurrido = new Date(perdida.getTime() - 30 * DIA);
    const h = hallazgo({ ocurridoEn: ocurrido, publicadoEn: new Date(ocurrido.getTime() + HORA) });

    const r = evaluarCoincidencia(caso(), h);
    expect(r).not.toBeNull();
    expect(r!.retroactiva).toBe(true);
    expect(r!.motivos.find((m) => m.criterio === 'TIEMPO')!.aporte).toBe(0);

    // Si el mismo reporte se hubiese publicado después del caso, la regla de 7 días lo descarta.
    const noRetro = hallazgo({ ocurridoEn: ocurrido, publicadoEn: new Date(perdida.getTime() + 2 * DIA) });
    expect(calcularCoincidencia(caso(), noRetro)).toBeNull();

    // Más allá de 90 días tampoco se considera.
    const antiguo = new Date(perdida.getTime() - 91 * DIA);
    expect(calcularCoincidencia(caso(), hallazgo({ ocurridoEn: antiguo, publicadoEn: antiguo }))).toBeNull();
  });

  it('T-04 · puntaje 34 → no se crea la coincidencia', () => {
    // Fuera del radio (0), raza exacta (20), mismo tamaño (10), color distinto,
    // sexo desconocido y 134,4 h de diferencia → tiempo = 20 · (1 − 134,4/168) = 4.
    const lejos = desplazar(centro, 8000, 0);
    const ocurrido = new Date(perdida.getTime() + 134.4 * HORA);
    const h = hallazgo({
      lat: lejos.lat,
      lng: lejos.lng,
      color: 'Blanco',
      sexo: 'DESCONOCIDO',
      ocurridoEn: ocurrido,
      publicadoEn: new Date(ocurrido.getTime() + HORA),
    });

    const bruto = calcularCoincidencia(caso(), h);
    expect(bruto).not.toBeNull();
    expect(bruto!.puntaje).toBe(34);
    expect(bruto!.puntaje).toBeLessThan(UMBRAL_COINCIDENCIA);
    expect(evaluarCoincidencia(caso(), h)).toBeNull();
    expect(cruzarCaso(caso(), [h])).toHaveLength(0);
  });

  it('T-05 · microchip idéntico → puntaje 100', () => {
    const chip = '985112345678901';
    const lejos = desplazar(centro, 20000, 180);
    const r = evaluarCoincidencia(
      caso({ microchip: chip }),
      hallazgo({ microchip: chip, lat: lejos.lat, lng: lejos.lng, color: 'Blanco', raza: 'Labrador' }),
    );
    expect(r).not.toBeNull();
    expect(r!.puntaje).toBe(100);
    expect(r!.motivos).toEqual([{ criterio: 'MICROCHIP', aporte: 100, detalle: 'Microchip idéntico' }]);
  });

  it('ordena los resultados de mayor a menor puntaje', () => {
    const cerca = hallazgo({ id: 'cerca' });
    const media = hallazgo({ id: 'media', color: 'Blanco', ...desplazar(centro, 3000, 45) });
    const r = cruzarCaso(caso(), [media, cerca]);
    expect(r.map((x) => x.reporteId)).toEqual(['cerca', 'media']);
  });

  it('raza mestizo o vacía aporta 10 puntos', () => {
    const r = calcularCoincidencia(caso({ raza: 'Mestizo' }), hallazgo({ raza: 'Pastor alemán' }));
    expect(r!.motivos.find((m) => m.criterio === 'RAZA')!.aporte).toBe(10);
    const r2 = calcularCoincidencia(caso(), hallazgo({ raza: null }));
    expect(r2!.motivos.find((m) => m.criterio === 'RAZA')!.aporte).toBe(10);
  });
});
