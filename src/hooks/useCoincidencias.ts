import { useCallback, useEffect, useMemo, useState } from 'react';
import { exigir, mensajeError, supabase } from '../lib/supabase';
import type { CoincidenciaConReporte, EstadoCoincidencia } from '../tipos/tipos';

/**
 * Coincidencias de un caso. RLS solo devuelve filas al dueño del caso;
 * para cualquier otro usuario la lista llega vacía.
 */
export function useCoincidencias(casoId: string | undefined, habilitado: boolean) {
  const [todas, setTodas] = useState<CoincidenciaConReporte[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!casoId || !habilitado) {
      setTodas([]);
      return;
    }
    setCargando(true);
    const { data, error: err } = await supabase
      .from('coincidencias')
      .select('*, reporte:reportes(*)')
      .eq('caso_id', casoId)
      .order('puntaje', { ascending: false });
    setError(err ? mensajeError(err) : null);
    setTodas((data as CoincidenciaConReporte[] | null) ?? []);
    setCargando(false);
  }, [casoId, habilitado]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Cambia el estado; RLS garantiza que solo el dueño del caso pueda hacerlo. */
  const decidir = useCallback(
    async (id: string, estado: Exclude<EstadoCoincidencia, 'SUGERIDA'>) => {
      exigir(await supabase.from('coincidencias').update({ estado }).eq('id', id).select('id').single());
      await recargar();
    },
    [recargar],
  );

  const activas = useMemo(() => todas.filter((c) => c.estado === 'SUGERIDA' || c.estado === 'NO_SEGURO'), [todas]);
  const historico = useMemo(() => todas.filter((c) => c.estado === 'CONFIRMADA' || c.estado === 'DESCARTADA'), [todas]);

  return { activas, historico, cargando, error, recargar, decidir };
}
