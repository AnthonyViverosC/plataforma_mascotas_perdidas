import { describe, expect, it } from 'vitest';
import { conLimite, firmaDesdePixeles, nivelDe, similitud } from '../src/lib/semejanza';

const N = 32;

type RGB = [number, number, number];

/** Imagen sintética: función (x, y) → color. */
function imagen(f: (x: number, y: number) => RGB): Uint8ClampedArray {
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [r, g, b] = f(x, y);
      const i = (y * N + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

const firma = (f: (x: number, y: number) => RGB) => firmaDesdePixeles(imagen(f), N, N);

// "Perro" oscuro sobre fondo claro, con la mancha en la mitad izquierda
const perroOscuro = (x: number, y: number): RGB => (x < 16 && y > 6 ? [40, 30, 25] : [200, 200, 190]);
// Mismo animal con un poco de ruido de cámara
const perroOscuroRuido = (x: number, y: number): RGB => {
  const [r, g, b] = perroOscuro(x, y);
  const d = ((x * 7 + y * 13) % 9) - 4;
  return [r + d, g + d, b + d];
};
// Otro animal: claro y dorado, con la mancha a la derecha
const perroDorado = (x: number, y: number): RGB => (x >= 16 && y > 6 ? [215, 170, 70] : [235, 235, 235]);
// Gris uniforme
const gris = (): RGB => [128, 128, 128];

describe('similitud entre fotos', () => {
  it('una foto contra sí misma da 100', () => {
    const a = firma(perroOscuro);
    expect(similitud(a, a)).toBe(100);
  });

  it('es simétrica', () => {
    const a = firma(perroOscuro);
    const b = firma(perroDorado);
    expect(similitud(a, b)).toBe(similitud(b, a));
  });

  it('la misma escena con ruido sigue siendo muy parecida', () => {
    expect(similitud(firma(perroOscuro), firma(perroOscuroRuido))).toBeGreaterThanOrEqual(90);
  });

  it('un animal oscuro se parece más a otro oscuro que a uno dorado', () => {
    const consulta = firma(perroOscuro);
    const mismo = similitud(consulta, firma(perroOscuroRuido));
    const otro = similitud(consulta, firma(perroDorado));
    expect(mismo).toBeGreaterThan(otro);
    expect(otro).toBeLessThan(40);
  });

  it('ordenar por semejanza deja primero a la foto más parecida', () => {
    const consulta = firma(perroOscuro);
    const candidatas = [
      { id: 'dorado', firma: firma(perroDorado) },
      { id: 'gris', firma: firma(gris) },
      { id: 'ruido', firma: firma(perroOscuroRuido) },
    ];
    const orden = candidatas
      .map((c) => ({ id: c.id, puntaje: similitud(consulta, c.firma) }))
      .sort((a, b) => b.puntaje - a.puntaje)
      .map((c) => c.id);
    expect(orden[0]).toBe('ruido');
  });

  it('el resultado siempre está entre 0 y 100', () => {
    const blanco = firma(() => [255, 255, 255]);
    const negro = firma(() => [0, 0, 0]);
    const s = similitud(blanco, negro);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('ignora los píxeles transparentes y no rompe con una imagen vacía', () => {
    const vacia = new Uint8ClampedArray(N * N * 4); // todo transparente
    const f = firmaDesdePixeles(vacia, N, N);
    expect(f.color.every((v) => v === 0)).toBe(true);
    expect(f.forma).toHaveLength(64);
  });
});

describe('nivelDe', () => {
  it('traduce el puntaje a una etiqueta', () => {
    expect(nivelDe(90)).toBe('ALTA');
    expect(nivelDe(75)).toBe('ALTA');
    expect(nivelDe(60)).toBe('MEDIA');
    expect(nivelDe(20)).toBe('BAJA');
  });
});

describe('conLimite', () => {
  it('procesa todo, respeta el orden de salida y no supera el límite de tareas a la vez', async () => {
    let activas = 0;
    let maximo = 0;
    const salida = await conLimite([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      activas += 1;
      maximo = Math.max(maximo, activas);
      await new Promise((r) => setTimeout(r, 5));
      activas -= 1;
      return n * 2;
    });
    expect(salida).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maximo).toBeLessThanOrEqual(3);
  });

  it('informa el avance', async () => {
    const avances: number[] = [];
    await conLimite([1, 2, 3], 2, async (n) => n, (h) => avances.push(h));
    expect(avances).toEqual([1, 2, 3]);
  });
});
