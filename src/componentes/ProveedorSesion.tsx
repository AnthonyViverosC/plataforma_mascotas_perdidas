import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../tipos/tipos';
import { SesionContexto, type ValorSesion } from '../hooks/sesionContexto';

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);

  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setSesion(data.session);
      setCargandoSesion(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });
    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const uid = sesion?.user.id ?? null;

  const cargarPerfil = useCallback(async (id: string | null) => {
    if (!id) {
      setPerfil(null);
      return;
    }
    setCargandoPerfil(true);
    const { data } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
    setPerfil((data as Perfil | null) ?? null);
    setCargandoPerfil(false);
  }, []);

  useEffect(() => {
    void cargarPerfil(uid);
  }, [uid, cargarPerfil]);

  const valor = useMemo<ValorSesion>(
    () => ({
      sesion,
      usuario: sesion?.user ?? null,
      perfil,
      cargando: cargandoSesion || cargandoPerfil || (Boolean(uid) && !perfil && cargandoPerfil),
      recargarPerfil: () => cargarPerfil(uid),
      cerrarSesion: async () => {
        await supabase.auth.signOut();
        setPerfil(null);
      },
    }),
    [sesion, perfil, cargandoSesion, cargandoPerfil, uid, cargarPerfil],
  );

  return <SesionContexto.Provider value={valor}>{children}</SesionContexto.Provider>;
}
