/**
 * Motor de coincidencias — funciones puras y testeables.
 *
 * Reglas:
 *   - Especie distinta → descartar.
 *   - Hallazgo ocurrido más de 7 días antes de la pérdida → descartar
 *     (en cruces retroactivos la ventana se amplía a 90 días).
 *   - Microchip idéntico → 100.
 *   - Distancia 30 · Tiempo 20 · Raza 20/10 · Color 15 · Tamaño 10 · Sexo 5.
 *   - Solo se guardan coincidencias con puntaje ≥ 35.
 *
 * Un cruce es "retroactivo" cuando el reporte se publicó antes de crearse el caso
 * (se evalúa al crear el caso revisando los reportes de hasta 90 días atrás).
 */
import type { Especie, Motivo, Sexo, Tamano } from '../tipos/tipos';
import { distanciaKm, formatearDistancia } from './geo';

export const UMBRAL_COINCIDENCIA = 35;
export const VENTANA_NORMAL_DIAS = 7;
export const VENTANA_RETROACTIVA_DIAS = 90;
export const HORAS_MAX_TIEMPO = 168;

const MS_HORA = 3_600_000;

export interface CasoParaCruce {
  id: string;
  especie: Especie;
  raza: string | null;
  color: string | null;
  tamano: Tamano | null;
  sexo: Sexo | null;
  microchip?: string | null;
  lat: number;
  lng: number;
  radioKm: number;
  ocurridoEn: Date | string;
  creadoEn: Date | string;
}

export interface HallazgoParaCruce {
  id: string;
  especie: Especie;
  raza: string | null;
  color: string | null;
  tamano: Tamano | null;
  sexo: Sexo | null;
  microchip?: string | null;
  lat: number;
  lng: number;
  ocurridoEn: Date | string;
  publicadoEn: Date | string;
}

export interface ResultadoCruce {
  casoId: string;
  reporteId: string;
  puntaje: number;
  motivos: Motivo[];
  retroactiva: boolean;
  distanciaKm: number;
}

const aFecha = (v: Date | string) => (v instanceof Date ? v : new Date(v));

/** Minúsculas, sin tildes ni signos (equivale a normalizar_texto en SQL). */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const esMestizoOVacia = (raza: string) => raza === '' || raza === 'mestizo' || raza === 'mestiza' || raza === 'criollo';

function describirHoras(horas: number): string {
  const abs = Math.abs(horas);
  let cantidad: string;
  if (abs < 1) cantidad = 'menos de 1 hora';
  else if (abs < 48) {
    const h = Math.round(abs);
    cantidad = `${h} ${h === 1 ? 'hora' : 'horas'}`;
  } else {
    const d = Math.round(abs / 24);
    cantidad = `${d} ${d === 1 ? 'día' : 'días'}`;
  }
  return `${cantidad} ${horas >= 0 ? 'después' : 'antes'} de la pérdida`;
}

const redondear = (n: number) => Math.round(n * 10) / 10;

/**
 * Calcula el puntaje sin aplicar el umbral.
 * Devuelve `null` solo cuando el cruce se descarta (especie o ventana de tiempo).
 */
export function calcularCoincidencia(caso: CasoParaCruce, hallazgo: HallazgoParaCruce): ResultadoCruce | null {
  if (caso.especie !== hallazgo.especie) return null;

  const retroactiva = aFecha(hallazgo.publicadoEn).getTime() < aFecha(caso.creadoEn).getTime();
  const horas = (aFecha(hallazgo.ocurridoEn).getTime() - aFecha(caso.ocurridoEn).getTime()) / MS_HORA;
  const ventanaDias = retroactiva ? VENTANA_RETROACTIVA_DIAS : VENTANA_NORMAL_DIAS;
  if (horas < -ventanaDias * 24) return null;

  const km = distanciaKm({ lat: caso.lat, lng: caso.lng }, { lat: hallazgo.lat, lng: hallazgo.lng });
  const base = { casoId: caso.id, reporteId: hallazgo.id, retroactiva, distanciaKm: km };

  const chipCaso = (caso.microchip ?? '').trim();
  const chipHallazgo = (hallazgo.microchip ?? '').trim();
  if (chipCaso !== '' && chipCaso === chipHallazgo) {
    return { ...base, puntaje: 100, motivos: [{ criterio: 'MICROCHIP', aporte: 100, detalle: 'Microchip idéntico' }] };
  }

  const motivos: Motivo[] = [];
  const radio = caso.radioKm > 0 ? caso.radioKm : 5;

  const aporteDistancia = 30 * Math.max(0, 1 - km / radio);
  motivos.push({ criterio: 'DISTANCIA', aporte: redondear(aporteDistancia), detalle: `a ${formatearDistancia(km)}` });

  const aporteTiempo = 20 * Math.max(0, 1 - Math.abs(horas) / HORAS_MAX_TIEMPO);
  motivos.push({ criterio: 'TIEMPO', aporte: redondear(aporteTiempo), detalle: describirHoras(horas) });

  const razaCaso = normalizar(caso.raza);
  const razaHallazgo = normalizar(hallazgo.raza);
  if (esMestizoOVacia(razaCaso) || esMestizoOVacia(razaHallazgo)) {
    motivos.push({ criterio: 'RAZA', aporte: 10, detalle: 'raza compatible (mestizo o sin dato)' });
  } else if (razaCaso === razaHallazgo) {
    motivos.push({ criterio: 'RAZA', aporte: 20, detalle: 'misma raza' });
  }

  const colorCaso = normalizar(caso.color);
  if (colorCaso !== '' && colorCaso === normalizar(hallazgo.color)) {
    motivos.push({ criterio: 'COLOR', aporte: 15, detalle: 'mismo color' });
  }

  if (caso.tamano && caso.tamano === hallazgo.tamano) {
    motivos.push({ criterio: 'TAMANO', aporte: 10, detalle: 'mismo tamaño' });
  }

  if (caso.sexo && hallazgo.sexo && caso.sexo !== 'DESCONOCIDO' && caso.sexo === hallazgo.sexo) {
    motivos.push({ criterio: 'SEXO', aporte: 5, detalle: 'mismo sexo' });
  }

  // El puntaje usa los aportes continuos sin redondear; los motivos muestran 1 decimal.
  const fijos = motivos
    .filter((m) => m.criterio !== 'DISTANCIA' && m.criterio !== 'TIEMPO')
    .reduce((s, m) => s + m.aporte, 0);
  const puntaje = Math.min(100, Math.max(0, Math.round(aporteDistancia + aporteTiempo + fijos)));
  return { ...base, puntaje, motivos };
}

/** Aplica el umbral: devuelve la coincidencia solo si debe guardarse (puntaje ≥ 35). */
export function evaluarCoincidencia(caso: CasoParaCruce, hallazgo: HallazgoParaCruce): ResultadoCruce | null {
  const r = calcularCoincidencia(caso, hallazgo);
  return r && r.puntaje >= UMBRAL_COINCIDENCIA ? r : null;
}

const porPuntaje = (a: ResultadoCruce, b: ResultadoCruce) => b.puntaje - a.puntaje || a.distanciaKm - b.distanciaKm;

/** Cruza un caso de pérdida contra muchos hallazgos. */
export function cruzarCaso(caso: CasoParaCruce, hallazgos: HallazgoParaCruce[]): ResultadoCruce[] {
  return hallazgos
    .map((h) => evaluarCoincidencia(caso, h))
    .filter((r): r is ResultadoCruce => r !== null)
    .sort(porPuntaje);
}

/** Cruza un hallazgo contra muchos casos de pérdida. */
export function cruzarHallazgo(hallazgo: HallazgoParaCruce, casos: CasoParaCruce[]): ResultadoCruce[] {
  return casos
    .map((c) => evaluarCoincidencia(c, hallazgo))
    .filter((r): r is ResultadoCruce => r !== null)
    .sort(porPuntaje);
}

const ORDEN_LECTURA: Motivo['criterio'][] = ['MICROCHIP', 'RAZA', 'COLOR', 'TAMANO', 'SEXO', 'DISTANCIA', 'TIEMPO'];

/** Desglose en lenguaje natural: "misma raza · a 1,2 km · 6 horas después de la pérdida". */
export function describirMotivos(motivos: Motivo[]): string {
  return [...motivos]
    .filter((m) => m.aporte > 0 || m.criterio === 'DISTANCIA' || m.criterio === 'TIEMPO')
    .sort((a, b) => ORDEN_LECTURA.indexOf(a.criterio) - ORDEN_LECTURA.indexOf(b.criterio))
    .map((m) => m.detalle)
    .join(' · ');
}
