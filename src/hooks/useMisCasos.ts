import { useCallback, useEffect, useState } from 'react';
import { mensajeError, supabase } from '../lib/supabase';
import type { CasoPublico } from '../tipos/tipos';

/** Casos creados por el usuario (incluidos los cerrados). */
export function useMisCasos(usuarioId: string | null) {
  const [casos, setCasos] = useState<CasoPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!usuarioId) {
      setCasos([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data, error: err } = await supabase
      .from('casos_publicos')
      .select('*')
      .eq('creador_id', usuarioId)
      .order('creado_en', { ascending: false });
    setError(err ? mensajeError(err) : null);
    setCasos((data as CasoPublico[] | null) ?? []);
    setCargando(false);
  }, [usuarioId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { casos, cargando, error, recargar };
}
