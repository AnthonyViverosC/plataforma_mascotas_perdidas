import type { CasoPublico, Especie } from '../tipos/tipos';

/**
 * Indicadores públicos de la red, calculados sobre `casos_publicos` (que no
 * expone ubicaciones exactas ni teléfonos). Funciones puras.
 */

export type CasoEstadistica = Pick<CasoPublico, 'tipo' | 'estado' | 'desenlace' | 'especie' | 'creado_en' | 'ultima_actividad_en'>;

export interface Resumen {
  activos: number;
  /** Casos de pérdida que terminaron con la mascota en casa (RESUELTO o desenlace REENCONTRADA). */
  reencontradas: number;
  /** Casos de pérdida terminados por cualquier motivo. */
  terminados: number;
  /** reencontradas / terminados, de 0 a 100; null si aún no termina ninguno. */
  tasaReencuentro: number | null;
  /** Mediana de días entre la publicación y la última actividad de los reencuentros. Aproximada. */
  medianaDiasReencuentro: number | null;
  nuevosUltimos30: number;
  hallazgosActivos: number;
  porEspecie: Record<Especie, number>;
}

const DIA = 86_400_000;

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const reencontrada = (c: CasoEstadistica) => c.estado === 'RESUELTO' || c.desenlace === 'REENCONTRADA';
const vivo = (c: CasoEstadistica) => c.estado === 'ABIERTO' || c.estado === 'EN_VERIFICACION';

export function resumir(casos: CasoEstadistica[], ahora: Date = new Date()): Resumen {
  const perdidas = casos.filter((c) => c.tipo === 'PERDIDA');
  const terminados = perdidas.filter((c) => !vivo(c));
  const exitos = terminados.filter(reencontrada);
  const porEspecie: Record<Especie, number> = { PERRO: 0, GATO: 0, OTRO: 0 };
  for (const c of perdidas) if (vivo(c) && c.especie) porEspecie[c.especie] += 1;

  return {
    activos: perdidas.filter(vivo).length,
    reencontradas: exitos.length,
    terminados: terminados.length,
    tasaReencuentro: terminados.length ? Math.round((exitos.length / terminados.length) * 100) : null,
    medianaDiasReencuentro: mediana(
      exitos.map((c) => Math.max(0, (new Date(c.ultima_actividad_en).getTime() - new Date(c.creado_en).getTime()) / DIA)),
    ),
    nuevosUltimos30: perdidas.filter((c) => ahora.getTime() - new Date(c.creado_en).getTime() <= 30 * DIA).length,
    hallazgosActivos: casos.filter((c) => c.tipo === 'HALLAZGO' && vivo(c)).length,
    porEspecie,
  };
}

/** Casos de pérdida publicados por semana, las últimas `semanas` (la última es la actual). */
export function porSemana(casos: CasoEstadistica[], semanas = 8, ahora: Date = new Date()): number[] {
  const cubetas = new Array<number>(semanas).fill(0);
  for (const c of casos) {
    if (c.tipo !== 'PERDIDA') continue;
    const atras = Math.floor((ahora.getTime() - new Date(c.creado_en).getTime()) / (7 * DIA));
    if (atras >= 0 && atras < semanas) cubetas[semanas - 1 - atras] += 1;
  }
  return cubetas;
}
