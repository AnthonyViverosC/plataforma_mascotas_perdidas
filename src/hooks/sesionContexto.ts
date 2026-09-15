import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Perfil } from '../tipos/tipos';

export interface ValorSesion {
  sesion: Session | null;
  usuario: User | null;
  perfil: Perfil | null;
  cargando: boolean;
  recargarPerfil: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

export const SesionContexto = createContext<ValorSesion | null>(null);
