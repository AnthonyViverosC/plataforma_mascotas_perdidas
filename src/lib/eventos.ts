import type { EventoConAutor, PerfilPublico, TipoEvento } from '../tipos/tipos';
import { exigir, supabase } from './supabase';

export const EVENTOS_POR_PAGINA = 20;

export type TonoEvento = 'neutro' | 'acento' | 'alerta' | 'aviso' | 'info';

export const META_EVENTO: Record<TipoEvento, { etiqueta: string; tono: TonoEvento }> = {
  CREACION: { etiqueta: 'Caso creado', tono: 'neutro' },
  AVISTAMIENTO: { etiqueta: 'Avistamiento', tono: 'acento' },
  LECTURA_MICROCHIP: { etiqueta: 'Lectura de microchip', tono: 'info' },
  LECTURA_ANULADA: { etiqueta: 'Lectura anulada', tono: 'alerta' },
  COINCIDENCIA_SUGERIDA: { etiqueta: 'Coincidencia sugerida', tono: 'aviso' },
  COINCIDENCIA_CONFIRMADA: { etiqueta: 'Coincidencia confirmada', tono: 'acento' },
  COINCIDENCIA_DESCARTADA: { etiqueta: 'Coincidencia descartada', tono: 'neutro' },
  COINCIDENCIA_NO_SEGURO: { etiqueta: 'Coincidencia en duda', tono: 'aviso' },
  VERIFICACION_INICIADA: { etiqueta: 'Verificación iniciada', tono: 'info' },
  VERIFICACION_INTENTO: { etiqueta: 'Intento de verificación', tono: 'info' },
  VERIFICACION_APROBADA: { etiqueta: 'Entrega aprobada', tono: 'acento' },
  VERIFICACION_RECHAZADA: { etiqueta: 'Entrega rechazada', tono: 'alerta' },
  VERIFICACION_BLOQUEADA: { etiqueta: 'Verificación bloqueada', tono: 'alerta' },
  CAMBIO_DATOS: { etiqueta: 'Cambio de datos', tono: 'neutro' },
  CAMBIO_ESTADO: { etiqueta: 'Cambio de estado', tono: 'alerta' },
  RADIO_AMPLIADO: { etiqueta: 'Radio de búsqueda', tono: 'info' },
  CIERRE: { etiqueta: 'Cierre del caso', tono: 'neutro' },
};

/** Nombre y rol públicos de varios usuarios (sin teléfono). */
export async function perfilesPublicos(ids: string[]): Promise<Map<string, PerfilPublico>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, PerfilPublico>();
  if (unicos.length === 0) return mapa;
  const filas = exigir(await supabase.from('perfiles_publicos').select('id, nombre, rol').in('id', unicos)) as PerfilPublico[];
  filas.forEach((p) => mapa.set(p.id, p));
  return mapa;
}

/**
 * Historial del caso en orden descendente, de 20 en 20.
 * Solo lectura: no existe ninguna función que edite o borre eventos.
 */
export async function listarEventos(casoId: string, pagina: number): Promise<{ eventos: EventoConAutor[]; hayMas: boolean }> {
  const desde = pagina * EVENTOS_POR_PAGINA;
  const filas = exigir(
    await supabase
      .from('eventos')
      .select('id, caso_id, tipo, autor_id, descripcion, creado_en')
      .eq('caso_id', casoId)
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + EVENTOS_POR_PAGINA), // pide 21 para saber si hay más
  ) as EventoConAutor[];

  const hayMas = filas.length > EVENTOS_POR_PAGINA;
  const pagina20 = filas.slice(0, EVENTOS_POR_PAGINA);
  const autores = await perfilesPublicos(pagina20.map((e) => e.autor_id ?? ''));
  return {
    eventos: pagina20.map((e) => ({ ...e, autor: e.autor_id ? autores.get(e.autor_id) ?? null : null })),
    hayMas,
  };
}

/** Eventos que el cliente puede registrar directamente (el resto los generan triggers en la BD). */
export async function registrarEvento(
  casoId: string,
  tipo: Extract<TipoEvento, 'AVISTAMIENTO' | 'CAMBIO_DATOS'>,
  descripcion: string,
  autorId: string,
): Promise<void> {
  exigir(await supabase.from('eventos').insert({ caso_id: casoId, tipo, descripcion, autor_id: autorId }));
}
