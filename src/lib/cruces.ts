/**
 * Orquestación del motor de coincidencias contra Supabase.
 * La lógica de puntaje vive en matching.ts (pura); aquí solo se cargan datos,
 * se ejecuta el motor y se persiste con guardar_coincidencias() (valida en la BD
 * y nunca vuelve a sugerir coincidencias ya decididas).
 */
import type { CasoPublico, Motivo, Reporte } from '../tipos/tipos';
import { cruzarCaso, cruzarHallazgo, VENTANA_RETROACTIVA_DIAS, type CasoParaCruce, type HallazgoParaCruce, type ResultadoCruce } from './matching';
import type { Punto } from './geo';
import { exigir, supabase } from './supabase';

const MS_DIA = 86_400_000;

export function hallazgoDesdeReporte(r: Reporte): HallazgoParaCruce {
  return {
    id: r.id,
    especie: r.especie,
    raza: r.raza,
    color: r.color,
    tamano: r.tamano,
    sexo: r.sexo,
    lat: r.lat,
    lng: r.lng,
    ocurridoEn: r.ocurrido_en,
    publicadoEn: r.creado_en,
  };
}

export function casoDesdePublico(c: CasoPublico, ubicacion?: Punto): CasoParaCruce {
  return {
    id: c.id,
    especie: c.especie ?? 'OTRO',
    raza: c.raza,
    color: c.color_principal,
    tamano: c.tamano,
    sexo: c.sexo,
    lat: ubicacion?.lat ?? c.lat_publica,
    lng: ubicacion?.lng ?? c.lng_publica,
    radioKm: c.radio_km,
    ocurridoEn: c.ocurrido_en,
    creadoEn: c.creado_en,
  };
}

async function guardar(resultados: ResultadoCruce[]): Promise<number> {
  if (resultados.length === 0) return 0;
  const items = resultados.map((r) => ({
    caso_id: r.casoId,
    reporte_id: r.reporteId,
    puntaje: r.puntaje,
    motivos: r.motivos satisfies Motivo[],
    retroactiva: r.retroactiva,
  }));
  return (exigir(await supabase.rpc('guardar_coincidencias', { p_items: items })) as number) ?? 0;
}

export interface ResultadoCruceCaso {
  resultados: (ResultadoCruce & { reporte: Reporte })[];
  nuevas: number;
}

/**
 * Cruza un caso de pérdida contra los reportes de su especie (hasta 90 días antes
 * de la pérdida). Lo usa el dueño al crear el caso, al ampliar el radio o al recalcular.
 */
export async function ejecutarCrucesDeCaso(casoId: string): Promise<ResultadoCruceCaso> {
  const caso = exigir(await supabase.from('casos_publicos').select('*').eq('id', casoId).single()) as CasoPublico;
  if (caso.tipo !== 'PERDIDA' || !caso.especie) return { resultados: [], nuevas: 0 };

  const exacta = exigir(await supabase.rpc('ubicacion_exacta_caso', { p_caso: casoId })) as Punto[] | null;
  const desde = new Date(new Date(caso.ocurrido_en).getTime() - VENTANA_RETROACTIVA_DIAS * MS_DIA).toISOString();

  const reportes = exigir(
    await supabase.from('reportes').select('*').eq('especie', caso.especie).gte('ocurrido_en', desde).limit(1000),
  ) as Reporte[];

  const resultados = cruzarCaso(casoDesdePublico(caso, exacta?.[0]), reportes.map(hallazgoDesdeReporte));
  const nuevas = await guardar(resultados);
  const porId = new Map(reportes.map((r) => [r.id, r]));
  return { resultados: resultados.map((r) => ({ ...r, reporte: porId.get(r.reporteId)! })), nuevas };
}

export interface ResultadoCruceReporte {
  resultados: (ResultadoCruce & { caso: CasoPublico })[];
  nuevas: number;
}

/** Cruza un reporte recién publicado contra los casos de pérdida abiertos de su especie. */
export async function ejecutarCrucesDeReporte(reporte: Reporte): Promise<ResultadoCruceReporte> {
  const casos = exigir(
    await supabase
      .from('casos_publicos')
      .select('*')
      .eq('tipo', 'PERDIDA')
      .in('estado', ['ABIERTO', 'EN_VERIFICACION'])
      .eq('especie', reporte.especie)
      .limit(1000),
  ) as CasoPublico[];

  const resultados = cruzarHallazgo(hallazgoDesdeReporte(reporte), casos.map((c) => casoDesdePublico(c)));
  const nuevas = await guardar(resultados);
  const porId = new Map(casos.map((c) => [c.id, c]));
  return { resultados: resultados.map((r) => ({ ...r, caso: porId.get(r.casoId)! })), nuevas };
}
