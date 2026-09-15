import type { Notificacion } from '../tipos/tipos';
import { exigir, supabase } from './supabase';

/**
 * Las notificaciones se crean exclusivamente en la base de datos (triggers y funciones
 * SECURITY DEFINER). El cliente solo las lee y las marca como leídas.
 */

export async function listarNotificaciones(limite = 50): Promise<Notificacion[]> {
  return exigir(
    await supabase
      .from('notificaciones')
      .select('id, usuario_id, titulo, cuerpo, enlace, leida_en, creado_en')
      .order('creado_en', { ascending: false })
      .limit(limite),
  ) as Notificacion[];
}

export async function marcarLeida(id: string): Promise<void> {
  exigir(await supabase.from('notificaciones').update({ leida_en: new Date().toISOString() }).eq('id', id));
}

export async function marcarTodasLeidas(): Promise<void> {
  exigir(await supabase.from('notificaciones').update({ leida_en: new Date().toISOString() }).is('leida_en', null));
}

/**
 * Escucha notificaciones nuevas o marcadas como leídas en tiempo real.
 * Cada suscripción usa un canal propio para que la campana y la página convivan.
 * Devuelve la función para cancelar.
 */
export function suscribirNotificaciones(usuarioId: string, alCambiar: (n: Notificacion) => void): () => void {
  const canal = supabase
    .channel(`notificaciones-${usuarioId}-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${usuarioId}` },
      (payload) => {
        if (payload.new && 'id' in payload.new) alCambiar(payload.new as Notificacion);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}
