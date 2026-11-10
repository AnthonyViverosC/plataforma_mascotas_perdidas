import { describe, expect, it } from 'vitest';
import { casoQuieto, diasSinActividad, enlaceWhatsApp, rasgosCaso, textoDifusion } from '../src/lib/compartir';

const base = {
  tipo: 'PERDIDA' as const,
  mascota_nombre: 'Max',
  especie: 'PERRO' as const,
  raza: 'Labrador',
  color_principal: 'Dorado',
  sexo: 'MACHO' as const,
  tamano: 'GRANDE' as const,
  direccion_texto: 'Barrio San Andrés',
  ocurrido_en: '2026-11-01T15:00:00Z',
  temperamento: 'SOCIABLE' as const,
};

describe('difusión de casos', () => {
  it('D-01 arma los rasgos en orden y usa "Mestizo" sin raza', () => {
    expect(rasgosCaso(base)).toBe('Perro · Labrador · Macho · Grande · color dorado');
    expect(rasgosCaso({ ...base, raza: null })).toContain('Mestizo');
  });

  it('D-02 el texto de una pérdida lleva el nombre, la zona y el enlace', () => {
    const t = textoDifusion(base, 'https://x.test/caso/1');
    expect(t.startsWith('🚨 SE BUSCA: Max')).toBe(true);
    expect(t).toContain('Barrio San Andrés');
    expect(t.trim().endsWith('https://x.test/caso/1')).toBe(true);
  });

  it('D-03 avisa de no atraparla cuando es huraña o puede morder', () => {
    expect(textoDifusion({ ...base, temperamento: 'HURANA' }, 'u')).toContain('No intentes atraparla');
    expect(textoDifusion(base, 'u')).not.toContain('No intentes atraparla');
  });

  it('D-04 un hallazgo sin nombre pregunta por "este animal"', () => {
    const t = textoDifusion({ ...base, tipo: 'HALLAZGO', mascota_nombre: null }, 'u');
    expect(t).toContain('ENCONTRADO: ¿conoces a este animal?');
  });

  it('D-05 el enlace de WhatsApp codifica el texto completo', () => {
    const url = enlaceWhatsApp('Hola & adiós\nlínea 2');
    expect(url).toBe('https://wa.me/?text=Hola%20%26%20adi%C3%B3s%0Al%C3%ADnea%202');
  });

  it('D-06 cuenta días completos y nunca negativos', () => {
    const ahora = new Date('2026-11-10T12:00:00Z');
    expect(diasSinActividad('2026-11-07T11:59:00Z', ahora)).toBe(3);
    expect(diasSinActividad('2026-11-07T12:01:00Z', ahora)).toBe(2);
    expect(diasSinActividad('2026-11-11T00:00:00Z', ahora)).toBe(0);
  });

  it('D-07 solo un caso vivo puede estar quieto', () => {
    const ahora = new Date('2026-11-10T12:00:00Z');
    const viejo = '2026-11-01T00:00:00Z';
    expect(casoQuieto({ estado: 'ABIERTO', ultima_actividad_en: viejo }, ahora)).toBe(true);
    expect(casoQuieto({ estado: 'EN_VERIFICACION', ultima_actividad_en: viejo }, ahora)).toBe(true);
    expect(casoQuieto({ estado: 'CERRADO', ultima_actividad_en: viejo }, ahora)).toBe(false);
    expect(casoQuieto({ estado: 'ABIERTO', ultima_actividad_en: '2026-11-09T00:00:00Z' }, ahora)).toBe(false);
  });
});

describe('formato de fechas futuras', () => {
  it('D-08 tiempoHasta en minutos, horas y días', async () => {
    const { tiempoHasta } = await import('../src/lib/formato');
    const ahora = new Date('2026-11-10T12:00:00Z');
    expect(tiempoHasta('2026-11-10T12:20:00Z', ahora)).toBe('en 20 min');
    expect(tiempoHasta('2026-11-10T15:00:00Z', ahora)).toBe('en 3 horas');
    expect(tiempoHasta('2026-11-12T12:00:00Z', ahora)).toBe('en 2 días');
    expect(tiempoHasta('2026-11-10T11:00:00Z', ahora)).toBe('ahora');
  });
});

describe('validación de jornadas', () => {
  it('D-09 exige hora entre 30 min y 30 días y un punto de encuentro', async () => {
    const { jornadaSchema } = await import('../src/lib/validacion');
    const ahora = new Date('2026-11-10T12:00:00Z');
    const ok = jornadaSchema(ahora).safeParse({ iniciaEn: '2026-11-11T12:00:00Z', punto: 'Parque Bolívar', nota: '' });
    expect(ok.success).toBe(true);
    const pronto = jornadaSchema(ahora).safeParse({ iniciaEn: '2026-11-10T12:10:00Z', punto: 'Parque', nota: '' });
    expect(pronto.success).toBe(false);
    const lejos = jornadaSchema(ahora).safeParse({ iniciaEn: '2026-12-31T12:00:00Z', punto: 'Parque', nota: '' });
    expect(lejos.success).toBe(false);
    const sinPunto = jornadaSchema(ahora).safeParse({ iniciaEn: '2026-11-11T12:00:00Z', punto: ' ab ', nota: '' });
    expect(sinPunto.success).toBe(false);
  });
});
