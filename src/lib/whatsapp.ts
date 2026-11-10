/**
 * Lectura de mensajes de grupos de WhatsApp (HU-07).
 *
 * Funciones puras: reciben el texto que el coordinador de la fundación pega (o
 * el .txt que exporta WhatsApp) y devuelven un borrador de caso por mensaje.
 * Nada de esto se publica solo: el coordinador revisa y completa cada borrador
 * (foto, ubicación) antes de publicarlo.
 *
 * Privacidad: los reportes son públicos, así que el texto original se guarda con
 * los celulares y correos tapados. Lo que no se pueda tapar con certeza se tapa
 * de más, nunca de menos.
 */
import type { Especie, EstadoAnimal, Sexo, Tamano } from '../tipos/tipos';

export interface CasoImportado {
  /** Posición del mensaje en el texto pegado (sirve de clave en la interfaz). */
  indice: number;
  /** Texto del mensaje con celulares y correos tapados, máximo 500 caracteres. */
  texto: string;
  /** Quien escribió el mensaje en el grupo, si el texto venía con ese dato. */
  autor: string | null;
  /** Fecha y hora del mensaje, si venía en la exportación. */
  fecha: Date | null;
  especie: Especie | '';
  color: string;
  tamano: Tamano | '';
  sexo: Sexo | '';
  estadoAnimal: EstadoAnimal;
  /** Referencia de zona que se alcanzó a leer ("barrio Las Cuadras"). */
  zona: string;
  /** Cuántos celulares o correos se taparon en este mensaje. */
  contactosTapados: number;
}

export interface ResultadoLectura {
  casos: CasoImportado[];
  /** Mensajes descartados: avisos del sistema, fotos sin texto, mensajes vacíos. */
  descartados: number;
}

export const MAX_NOTA = 500;
export const MARCA_TAPADO = '[contacto omitido]';

/** Minúsculas y sin tildes, para comparar palabras. */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------
// 1. Separar el texto en mensajes
// ---------------------------------------------------------------------

// 12/9/26, 3:45 p. m. - Nombre: texto      (Android)
// [12/9/26, 3:45:12 p. m.] Nombre: texto    (iOS)
const INICIO_MENSAJE =
  /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s?m\.?)?\]?\s*[-–—]?\s*([^:]{1,60}?):\s?(.*)$/i;

const SISTEMA = [
  'los mensajes y las llamadas estan cifrados',
  'creo el grupo',
  'creaste el grupo',
  'te anadio',
  'te anadieron',
  'se unio usando el enlace',
  'salio del grupo',
  'cambio el asunto',
  'cambio el icono',
  'elimino este mensaje',
  'se elimino este mensaje',
  'cambio su numero',
];

const MULTIMEDIA = /<\s*(?:multimedia|media|archivo)[^>]*(?:omitid[oa]|omitted)\s*>|\b(?:imagen|image|video|sticker|gif|audio)\s+(?:omitid[oa]|omitted)\b/gi;

// Línea con fecha y hora pero sin "Autor:" → aviso del sistema ("Ana creó el grupo")
const SOLO_SELLO = /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s?m\.?)?\]?\s*[-–—]?\s*(.*)$/i;

interface Bruto {
  autor: string | null;
  fecha: Date | null;
  texto: string;
  /** Aviso del sistema de WhatsApp, no un mensaje de una persona. */
  sistema?: boolean;
}

function construirFecha(d: string, m: string, a: string, h: string, mi: string, ampm?: string): Date | null {
  const dia = Number(d);
  const mes = Number(m);
  let anio = Number(a);
  if (anio < 100) anio += 2000;
  let hora = Number(h);
  const minuto = Number(mi);
  const marca = ampm?.toLowerCase();
  if (marca === 'p' && hora < 12) hora += 12;
  if (marca === 'a' && hora === 12) hora = 0;
  const f = new Date(anio, mes - 1, dia, hora, minuto);
  // Rechaza fechas imposibles como 31/02 (JavaScript las "corrige" sin avisar)
  if (f.getFullYear() !== anio || f.getMonth() !== mes - 1 || f.getDate() !== dia) return null;
  return f;
}

export function separarMensajes(entrada: string): Bruto[] {
  const limpio = entrada.replace(/[\u200e\u200f]/g, '').replace(/[\u202f\u00a0]/g, ' ').replace(/\r\n?/g, '\n');
  const lineas = limpio.split('\n');
  const haySellos = lineas.some((l) => INICIO_MENSAJE.test(l.trim()));

  if (!haySellos) {
    // Texto libre: un mensaje por bloque separado con línea en blanco.
    return limpio
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map((texto) => ({ autor: null, fecha: null, texto }));
  }

  const mensajes: Bruto[] = [];
  let actual: Bruto | null = null;
  for (const linea of lineas) {
    const m = INICIO_MENSAJE.exec(linea.trim());
    const sello = m ? null : SOLO_SELLO.exec(linea.trim());
    if (m) {
      actual = { autor: m[7].trim(), fecha: construirFecha(m[1], m[2], m[3], m[4], m[5], m[6]), texto: m[8] };
      mensajes.push(actual);
    } else if (sello) {
      actual = { autor: null, fecha: construirFecha(sello[1], sello[2], sello[3], sello[4], sello[5], sello[6]), texto: sello[7], sistema: true };
      mensajes.push(actual);
    } else if (actual) {
      actual.texto += `\n${linea}`;
    }
  }
  return mensajes;
}

// ---------------------------------------------------------------------
// 2. Tapar contactos
// ---------------------------------------------------------------------
const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Celulares colombianos (con o sin +57) y cualquier número suelto de 7 a 10 dígitos.
const CELULAR = /(?:\+?57[\s.-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
// Sin lookbehind: Safari anterior a 16.4 no lo entiende y rompería toda la aplicación.
const NUMERO_LARGO = /(^|[^\d/])\d{7,10}(?![\d/])/g;

export function taparContactos(texto: string): { texto: string; tapados: number } {
  let tapados = 0;
  const reemplazar = () => {
    tapados += 1;
    return MARCA_TAPADO;
  };
  const t = texto
    .replace(CORREO, reemplazar)
    .replace(CELULAR, reemplazar)
    .replace(NUMERO_LARGO, (_todo, antes: string) => `${antes}${reemplazar()}`);
  return { texto: t, tapados };
}

// ---------------------------------------------------------------------
// 3. Rasgos del animal
// ---------------------------------------------------------------------
function primeraPosicion(n: string, patron: RegExp): number {
  const m = patron.exec(n);
  return m ? m.index : -1;
}

export function detectarEspecie(n: string): Especie | '' {
  const perro = primeraPosicion(n, /\b(perr[oa]s?|perrit[oa]s?|cachorr[oa]s?|canin[oa]s?)\b/);
  const gato = primeraPosicion(n, /\b(gat[oa]s?|gatit[oa]s?|felin[oa]s?|michi)\b/);
  if (perro >= 0 && (gato < 0 || perro < gato)) return 'PERRO';
  if (gato >= 0) return 'GATO';
  if (/\b(conej|loro|tortuga|pajaro|hamster|cuy)/.test(n)) return 'OTRO';
  return '';
}

// Cada color con las palabras que lo nombran. Los compuestos van primero.
const COLORES_PALABRAS: [string, RegExp][] = [
  ['Café claro', /\b(cafe claro|beige|canela|caramelo)\b/],
  ['Atigrado', /\b(atigrad[oa]|rayad[oa]|tigre)\b/],
  ['Tricolor', /\b(tricolor|carey)\b/],
  ['Manchado', /\b(manchad[oa]|pintad[oa]|moteado|dalmata)\b/],
  ['Negro', /\b(negr[oa]|negrit[oa])\b/],
  ['Blanco', /\b(blanc[oa]|blanquit[oa])\b/],
  ['Marrón', /\b(marron|cafe|chocolate|castano)\b/],
  ['Gris', /\b(gris|plomo|plomizo)\b/],
  ['Dorado', /\b(dorad[oa]|amarill[oa]|rubi[oa])\b/],
  ['Crema', /\bcrema\b/],
  ['Naranja', /\b(naranja|anaranjad[oa]|colorad[oa]|pelirroj[oa])\b/],
];
const COLORES_EXPLICITOS = new Set(['Atigrado', 'Tricolor', 'Manchado']);

export function detectarColor(n: string): string {
  const hallados = COLORES_PALABRAS.filter(([, p]) => p.test(n)).map(([c]) => c);
  const explicito = hallados.find((c) => COLORES_EXPLICITOS.has(c));
  if (explicito) return explicito;
  if (hallados.length === 1) return hallados[0];
  // "blanco y negro": dos colores a la vez describen un pelaje manchado.
  if (hallados.length === 2) return 'Manchado';
  if (hallados.length >= 3) return 'Tricolor';
  return '';
}

export function detectarTamano(n: string): Tamano | '' {
  if (/\b(pequen[oa]|chiquit[oa]|mini|toy)\b/.test(n)) return 'PEQUENO';
  if (/\b(mediano|mediana)\b/.test(n)) return 'MEDIANO';
  if (/\b(grande|gigante|talla grande)\b/.test(n)) return 'GRANDE';
  return '';
}

export function detectarSexo(n: string): Sexo | '' {
  if (/\b(macho)\b/.test(n)) return 'MACHO';
  if (/\b(hembra|perra|gata)\b/.test(n)) return 'HEMBRA';
  return '';
}

export function detectarEstado(n: string): EstadoAnimal {
  if (/\b(herid[oa]|lastimad[oa]|enferm[oa]|atropellad[oa]|desnutrid[oa]|urgente)\b/.test(n)) return 'REQUIERE_ATENCION';
  if (/(rescat|recogi|recogimos|lo tenemos|la tenemos|lo tengo|la tengo|en mi casa|en nuestra casa|hogar de paso|acogid|alberg|resguard|custodi)/.test(n))
    return 'LO_RECOGI';
  if (/(se fue|huyo|desaparecio|ya no esta)/.test(n)) return 'SE_FUE';
  return 'SIGUE_EN_LUGAR';
}

export function detectarZona(texto: string): string {
  const m = /\b(?:barrio|sector|conjunto|urbanizaci[oó]n|parque|plaza|avenida|calle|carrera|cerca (?:de|del)|por el|por la)\s+[^.,;\n]{2,40}/i.exec(texto);
  return m ? m[0].trim() : '';
}

// ---------------------------------------------------------------------
// 4. Todo junto
// ---------------------------------------------------------------------
function recortar(t: string): string {
  const compacto = t.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  return compacto.length <= MAX_NOTA ? compacto : `${compacto.slice(0, MAX_NOTA - 1).trimEnd()}…`;
}

/** Convierte el texto pegado en borradores de caso. */
export function leerMensajes(entrada: string): ResultadoLectura {
  const casos: CasoImportado[] = [];
  let descartados = 0;

  for (const bruto of separarMensajes(entrada)) {
    const sinMedios = bruto.texto.replace(MULTIMEDIA, ' ').trim();
    const n = normalizar(sinMedios);
    const esSistema = bruto.sistema === true || SISTEMA.some((s) => n.includes(s));
    // Un mensaje de menos de 15 letras no describe a un animal ("ok", "gracias").
    if (esSistema || n.replace(/[^a-z]/g, '').length < 15) {
      descartados += 1;
      continue;
    }
    const { texto, tapados } = taparContactos(sinMedios);
    casos.push({
      indice: casos.length,
      texto: recortar(texto),
      autor: bruto.autor,
      fecha: bruto.fecha,
      especie: detectarEspecie(n),
      color: detectarColor(n),
      tamano: detectarTamano(n),
      sexo: detectarSexo(n),
      estadoAnimal: detectarEstado(n),
      zona: detectarZona(texto),
      contactosTapados: tapados,
    });
  }
  return { casos, descartados };
}

/**
 * Huella estable del mensaje: sirve para no importarlo dos veces. Se calcula
 * sobre el texto ya normalizado (sin tildes ni espacios de más) y la fecha del
 * mensaje, así que volver a pegar la misma conversación da las mismas huellas.
 */
export async function huellaMensaje(caso: Pick<CasoImportado, 'texto' | 'fecha'>): Promise<string> {
  const base = `${normalizar(caso.texto).replace(/\s+/g, ' ').trim()}|${caso.fecha ? caso.fecha.toISOString().slice(0, 16) : ''}`;
  const bytes = new TextEncoder().encode(base);
  const resumen = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, '0')).join('');
  return `wa-${hex.slice(0, 32)}`;
}
