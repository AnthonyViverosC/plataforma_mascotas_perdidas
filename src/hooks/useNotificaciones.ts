import { useCallback, useEffect, useState } from 'react';
import {
  listarNotificaciones,
  marcarLeida as marcarLeidaApi,
  marcarTodasLeidas as marcarTodasApi,
  suscribirNotificaciones,
} from '../lib/notificaciones';
import { mensajeError } from '../lib/supabase';
import type { Notificacion } from '../tipos/tipos';

export function useNotificaciones(usuarioId: string | null) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!usuarioId) {
      setNotificaciones([]);
      return;
    }
    setCargando(true);
    try {
      setNotificaciones(await listarNotificaciones());
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    void recargar();
    if (!usuarioId) return;
    const cancelar = suscribirNotificaciones(usuarioId, (n) => {
      setNotificaciones((prev) =>
        prev.some((p) => p.id === n.id) ? prev.map((p) => (p.id === n.id ? n : p)) : [n, ...prev],
      );
    });
    return cancelar;
  }, [usuarioId, recargar]);

  const marcarLeida = useCallback(async (id: string) => {
    await marcarLeidaApi(id);
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida_en: new Date().toISOString() } : n)));
  }, []);

  const marcarTodas = useCallback(async () => {
    await marcarTodasApi();
    const ahora = new Date().toISOString();
    setNotificaciones((prev) => prev.map((n) => (n.leida_en ? n : { ...n, leida_en: ahora })));
  }, []);

  const noLeidas = notificaciones.filter((n) => !n.leida_en).length;

  return { notificaciones, noLeidas, cargando, error, recargar, marcarLeida, marcarTodas };
}
