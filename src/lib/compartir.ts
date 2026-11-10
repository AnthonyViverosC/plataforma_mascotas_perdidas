import { ETIQUETA_ESPECIE, ETIQUETA_SEXO, ETIQUETA_TAMANO, type CasoPublico } from '../tipos/tipos';
import { formatearFecha } from './formato';

/**
 * Difusión de un caso (cartel, WhatsApp, redes). Funciones puras: no tocan la
 * red ni el DOM, así se prueban sin navegador.
 */

/** Días que una ficha puede pasar sin movimiento antes de avisar al dueño. */
export const DIAS_INACTIVIDAD = 3;

type CasoDifusion = Pick<
  CasoPublico,
  'tipo' | 'mascota_nombre' | 'especie' | 'raza' | 'color_principal' | 'sexo' | 'tamano' | 'direccion_texto' | 'ocurrido_en' | 'temperamento'
>;

/** "Perro · Labrador · Macho · Mediano · color café" */
export function rasgosCaso(caso: CasoDifusion): string {
  return [
    caso.especie && ETIQUETA_ESPECIE[caso.especie],
    caso.raza || 'Mestizo',
    caso.sexo && ETIQUETA_SEXO[caso.sexo],
    caso.tamano && ETIQUETA_TAMANO[caso.tamano],
    caso.color_principal && `color ${caso.color_principal.toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Texto listo para pegar en un grupo de WhatsApp o en redes. Nunca lleva teléfonos. */
export function textoDifusion(caso: CasoDifusion, url: string): string {
  const perdida = caso.tipo === 'PERDIDA';
  const nombre = caso.mascota_nombre ?? 'esta mascota';
  const lineas = [
    perdida ? `🚨 SE BUSCA: ${nombre}` : `🐾 ENCONTRADO: ¿conoces a ${nombre === 'esta mascota' ? 'este animal' : nombre}?`,
    rasgosCaso(caso),
    `📍 ${caso.direccion_texto || 'Zona aproximada en el mapa'}`,
    `📅 ${perdida ? 'Se perdió' : 'Hallado'} el ${formatearFecha(caso.ocurrido_en, false)}`,
  ];
  if (caso.temperamento === 'HURANA' || caso.temperamento === 'PUEDE_MORDER') {
    lineas.push('⚠️ No intentes atraparla: avisa y mantén distancia.');
  }
  lineas.push('', perdida ? '¿La viste? Avisa aquí, sin registrarte:' : '¿Es tuya? Mira la ficha:', url);
  return lineas.join('\n');
}

/** Enlace universal de WhatsApp: abre la app con el texto ya escrito. */
export function enlaceWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** Días completos transcurridos desde la última actividad. */
export function diasSinActividad(ultimaActividad: string, ahora: Date = new Date()): number {
  const ms = ahora.getTime() - new Date(ultimaActividad).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Un caso vivo se considera "quieto" si lleva DIAS_INACTIVIDAD días o más sin movimiento. */
export function casoQuieto(
  caso: Pick<CasoPublico, 'estado' | 'ultima_actividad_en'>,
  ahora: Date = new Date(),
): boolean {
  const vivo = caso.estado === 'ABIERTO' || caso.estado === 'EN_VERIFICACION';
  return vivo && diasSinActividad(caso.ultima_actividad_en, ahora) >= DIAS_INACTIVIDAD;
}
