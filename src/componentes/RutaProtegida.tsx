import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion';
import { ETIQUETA_ROL, type Rol } from '../tipos/tipos';
import { BotonEnlace } from './Boton';
import { IconoCandado } from './Iconos';
import { Cargando, Tarjeta } from './ui';

/**
 * Exige sesión y, opcionalmente, uno de los roles indicados.
 * La protección real está en RLS; esto solo evita mostrar pantallas inútiles.
 */
export function RutaProtegida({ roles, children }: { roles?: Rol[]; children: ReactNode }) {
  const { usuario, perfil, cargando } = useSesion();
  const { pathname, search } = useLocation();

  if (cargando || (usuario && !perfil)) return <Cargando texto="Verificando tu sesión…" />;
  if (!usuario) return <Navigate to={`/entrar?volver=${encodeURIComponent(pathname + search)}`} replace />;

  if (roles && perfil && !roles.includes(perfil.rol)) {
    return (
      <Tarjeta className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-alerta-claro text-alerta">
          <IconoCandado tamano={22} />
        </div>
        <h1 className="text-lg font-bold">No tienes permisos para esta sección</h1>
        <p className="mt-1 text-sm text-suave">
          Esta pantalla es solo para el rol {roles.map((r) => ETIQUETA_ROL[r]).join(' o ')}. Tu rol actual es {ETIQUETA_ROL[perfil.rol]}.
        </p>
        <p className="mt-1 text-sm text-suave">Para usarla, cambia de perfil desde el menú superior.</p>
        <BotonEnlace to="/panel" variante="secundario" className="mt-4">
          Volver a mi panel
        </BotonEnlace>
      </Tarjeta>
    );
  }
  return <>{children}</>;
}
