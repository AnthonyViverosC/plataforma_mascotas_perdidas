/**
 * Orden de listados y exportación a CSV. `aCsv` y `ordenarPor` son puras;
 * `descargarCsv` es la única que toca el navegador.
 */

export type Orden = 'recientes' | 'antiguos' | 'cercanos';

/**
 * Ordena sin mutar la lista. "cercanos" necesita una función de distancia;
 * si no la hay (no se eligió zona), cae en "recientes".
 */
export function ordenarPor<T>(lista: T[], orden: Orden, fecha: (x: T) => string, distancia?: (x: T) => number): T[] {
  const copia = [...lista];
  if (orden === 'cercanos' && distancia) return copia.sort((a, b) => distancia(a) - distancia(b));
  const signo = orden === 'antiguos' ? 1 : -1;
  return copia.sort((a, b) => signo * fecha(a).localeCompare(fecha(b)));
}

const SEPARADOR = ';'; // Excel en español usa la coma como separador decimal.

/** Escapa una celda y neutraliza fórmulas (=, +, -, @) para evitar inyección en hojas de cálculo. */
export function celdaCsv(valor: string | number | null | undefined): string {
  let t = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function aCsv(encabezados: string[], filas: (string | number | null | undefined)[][]): string {
  return [encabezados, ...filas].map((f) => f.map(celdaCsv).join(SEPARADOR)).join('\r\n');
}

/** Descarga el CSV con BOM para que Excel respete las tildes. */
export function descargarCsv(nombre: string, encabezados: string[], filas: (string | number | null | undefined)[][]): void {
  const blob = new Blob(['﻿', aCsv(encabezados, filas)], { type: 'text/csv;charset=utf-8' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}
