import { describe, expect, it } from 'vitest';
import { aCsv, celdaCsv, ordenarPor } from '../src/lib/exportar';

const lista = [
  { id: 'b', fecha: '2026-11-05', km: 3 },
  { id: 'a', fecha: '2026-10-01', km: 9 },
  { id: 'c', fecha: '2026-11-09', km: 1 },
];
const fecha = (x: (typeof lista)[number]) => x.fecha;
const km = (x: (typeof lista)[number]) => x.km;

describe('orden de listados', () => {
  it('O-01 más recientes primero', () => {
    expect(ordenarPor(lista, 'recientes', fecha).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('O-02 más antiguos primero (voluntarios)', () => {
    expect(ordenarPor(lista, 'antiguos', fecha).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('O-03 más cercanos con zona; sin zona cae en recientes', () => {
    expect(ordenarPor(lista, 'cercanos', fecha, km).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(ordenarPor(lista, 'cercanos', fecha).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('O-04 no muta la lista original', () => {
    ordenarPor(lista, 'antiguos', fecha);
    expect(lista[0].id).toBe('b');
  });
});

describe('exportación CSV', () => {
  it('E-01 escapa comillas, separadores y saltos de línea', () => {
    expect(celdaCsv('Café "oscuro"; manchas')).toBe('"Café ""oscuro""; manchas"');
    expect(celdaCsv('dos\nlíneas')).toBe('"dos\nlíneas"');
    expect(celdaCsv(null)).toBe('');
  });
  it('E-02 neutraliza fórmulas para que Excel no las ejecute', () => {
    expect(celdaCsv('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(celdaCsv('+57 300')).toBe("'+57 300");
  });
  it('E-03 arma filas con ; y CRLF', () => {
    expect(aCsv(['A', 'B'], [[1, 'x'], [2, null]])).toBe('A;B\r\n1;x\r\n2;');
  });
});
