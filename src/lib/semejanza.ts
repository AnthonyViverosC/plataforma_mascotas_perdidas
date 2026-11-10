/**
 * Semejanza visual entre fotos (HU-10).
 *
 * Es una comparación ligera y local, no reconocimiento del animal: cada foto se
 * reduce a una "firma" con dos partes y se comparan las firmas.
 *
 *   · color: histograma de 64 colores (4 niveles por canal) de la zona central
 *     de la foto, que es donde suele estar el animal.
 *   · forma: 64 bits que dicen qué celdas de una cuadrícula de 8×8 son más
 *     claras que el promedio. Capta la distribución general de luz y sombra.
 *
 * Todo ocurre en el navegador: la foto de quien busca no se sube a ninguna parte.
 * La parte pura (firmaDesdePixeles y similitud) no toca el DOM y tiene pruebas.
 */

export interface Firma {
  /** 64 valores que suman 1. */
  color: number[];
  /** 64 bits, uno por celda de la cuadrícula 8×8. */
  forma: boolean[];
}

export const LADO_MUESTRA = 32;
const NIVELES = 4;
const CELDAS = 8;
/** Fracción de cada borde que se ignora al contar colores (el fondo). */
const MARGEN = 0.15;

/**
 * @param rgba píxeles como los devuelve canvas.getImageData (4 valores por píxel)
 */
export function firmaDesdePixeles(rgba: ArrayLike<number>, ancho: number, alto: number): Firma {
  const color = new Array<number>(NIVELES ** 3).fill(0);
  const x0 = Math.floor(ancho * MARGEN);
  const x1 = Math.ceil(ancho * (1 - MARGEN));
  const y0 = Math.floor(alto * MARGEN);
  const y1 = Math.ceil(alto * (1 - MARGEN));

  // Cada canal reparte su peso entre los dos niveles más cercanos (histograma
  // "suave"): sin esto, el ruido de cámara que cruza el borde de un nivel
  // cambiaría de casilla a medio animal y la misma foto no se parecería a sí misma.
  const reparto = (v: number): [number, number, number] => {
    const p = (v * NIVELES) / 256 - 0.5;
    const i0 = Math.floor(p);
    const w1 = p - i0;
    return [Math.min(NIVELES - 1, Math.max(0, i0)), Math.min(NIVELES - 1, Math.max(0, i0 + 1)), w1];
  };

  let contados = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * ancho + x) * 4;
      if (rgba[i + 3] < 128) continue; // transparente
      const [r0, r1, wr] = reparto(rgba[i]);
      const [g0, g1, wg] = reparto(rgba[i + 1]);
      const [b0, b1, wb] = reparto(rgba[i + 2]);
      for (const [r, pr] of [[r0, 1 - wr], [r1, wr]] as const) {
        for (const [g, pg] of [[g0, 1 - wg], [g1, wg]] as const) {
          for (const [b, pb] of [[b0, 1 - wb], [b1, wb]] as const) {
            color[r * NIVELES * NIVELES + g * NIVELES + b] += pr * pg * pb;
          }
        }
      }
      contados += 1;
    }
  }
  if (contados > 0) for (let b = 0; b < color.length; b++) color[b] /= contados;

  // Luminosidad media de cada celda
  const luz = new Array<number>(CELDAS * CELDAS).fill(0);
  for (let cy = 0; cy < CELDAS; cy++) {
    for (let cx = 0; cx < CELDAS; cx++) {
      const ini_x = Math.floor((cx * ancho) / CELDAS);
      const fin_x = Math.max(ini_x + 1, Math.floor(((cx + 1) * ancho) / CELDAS));
      const ini_y = Math.floor((cy * alto) / CELDAS);
      const fin_y = Math.max(ini_y + 1, Math.floor(((cy + 1) * alto) / CELDAS));
      let suma = 0;
      let n = 0;
      for (let y = ini_y; y < fin_y; y++) {
        for (let x = ini_x; x < fin_x; x++) {
          const i = (y * ancho + x) * 4;
          suma += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          n += 1;
        }
      }
      luz[cy * CELDAS + cx] = n ? suma / n : 0;
    }
  }
  const media = luz.reduce((a, b) => a + b, 0) / luz.length;
  return { color, forma: luz.map((v) => v > media) };
}

/** Semejanza de 0 a 100. 100 = firmas idénticas. */
export function similitud(a: Firma, b: Firma): number {
  // Intersección de histogramas: 1 si los colores se reparten igual.
  let interseccion = 0;
  for (let i = 0; i < a.color.length; i++) interseccion += Math.min(a.color[i], b.color[i]);

  let distintos = 0;
  for (let i = 0; i < a.forma.length; i++) if (a.forma[i] !== b.forma[i]) distintos += 1;
  // Dos fotos sin relación coinciden en la mitad de los bits por azar: eso vale 0.
  const forma = Math.max(0, 1 - (distintos / a.forma.length) * 2);

  return Math.round(100 * (0.7 * interseccion + 0.3 * forma));
}

export type NivelSemejanza = 'ALTA' | 'MEDIA' | 'BAJA';

export function nivelDe(puntaje: number): NivelSemejanza {
  if (puntaje >= 75) return 'ALTA';
  if (puntaje >= 55) return 'MEDIA';
  return 'BAJA';
}

export const ETIQUETA_NIVEL: Record<NivelSemejanza, string> = {
  ALTA: 'Muy parecida',
  MEDIA: 'Parecida',
  BAJA: 'Poco parecida',
};

// ---------------------------------------------------------------------
// Parte con navegador: leer una imagen y sacar su firma
// ---------------------------------------------------------------------

function cargarImagen(fuente: string, anonima: boolean): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    if (anonima) img.crossOrigin = 'anonymous';
    const plazo = window.setTimeout(() => rechazar(new Error('La imagen tardó demasiado.')), 10_000);
    img.onload = () => {
      window.clearTimeout(plazo);
      resolver(img);
    };
    img.onerror = () => {
      window.clearTimeout(plazo);
      rechazar(new Error('No se pudo leer la imagen.'));
    };
    img.src = fuente;
  });
}

/**
 * Firma de una foto subida por la persona (File) o de una foto publicada (URL).
 * Devuelve null si la imagen no se puede leer —por ejemplo, un servidor que no
 * permite leerla desde otra página— en lugar de romper toda la búsqueda.
 */
export async function firmaDeImagen(fuente: Blob | string): Promise<Firma | null> {
  const esBlob = typeof fuente !== 'string';
  const url = esBlob ? URL.createObjectURL(fuente) : fuente;
  try {
    const img = await cargarImagen(url, !esBlob);
    const lienzo = document.createElement('canvas');
    lienzo.width = LADO_MUESTRA;
    lienzo.height = LADO_MUESTRA;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, LADO_MUESTRA, LADO_MUESTRA);
    const { data } = ctx.getImageData(0, 0, LADO_MUESTRA, LADO_MUESTRA);
    return firmaDesdePixeles(data, LADO_MUESTRA, LADO_MUESTRA);
  } catch {
    return null;
  } finally {
    if (esBlob) URL.revokeObjectURL(url);
  }
}

/** Ejecuta `tarea` sobre cada elemento con a lo sumo `limite` tareas a la vez. */
export async function conLimite<T, R>(items: T[], limite: number, tarea: (item: T, i: number) => Promise<R>, alAvanzar?: (hechos: number) => void): Promise<R[]> {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;
  let hechos = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await tarea(items[i], i);
      hechos += 1;
      alAvanzar?.(hechos);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}
