import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion';
import { supabaseConfigurado } from '../lib/supabase';
import { ETIQUETA_ROL, type Rol } from '../tipos/tipos';
import { Campana } from './Campana';
import { IconoMenu, IconoPata, IconoSalir, IconoX } from './Iconos';
import { Aviso } from './ui';

interface Enlace {
  a: string;
  texto: string;
  roles?: Rol[];
  requiereSesion?: boolean;
}

const ENLACES: Enlace[] = [
  { a: '/buscar', texto: 'Buscar' },
  { a: '/reportar', texto: 'Reportar hallazgo' },
  { a: '/casos/nuevo', texto: 'Reportar pérdida', roles: ['PROPIETARIO', 'ADMIN'] },
  { a: '/panel', texto: 'Mi panel', requiereSesion: true },
  { a: '/veterinario', texto: 'Lectura de microchip', roles: ['VETERINARIO'] },
];

export function Layout() {
  const { perfil, usuario, cerrarSesion } = useSesion();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const [rutaMenu, setRutaMenu] = useState(pathname);

  // Cierra el menú móvil al navegar
  if (rutaMenu !== pathname) {
    setRutaMenu(pathname);
    setMenu(false);
  }

  const visibles = ENLACES.filter((e) => {
    if (e.roles) return perfil && e.roles.includes(perfil.rol);
    if (e.requiereSesion) return Boolean(usuario);
    return true;
  });

  const claseEnlace = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${isActive ? 'bg-fondo text-tinta' : 'text-suave hover:text-tinta'}`;

  return (
    <div className="flex min-h-screen flex-col bg-fondo">
      <header className="no-imprimir sticky top-0 z-[1000] border-b border-borde bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-5">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tinta text-white">
              <IconoPata tamano={17} />
            </span>
            <span className="leading-none">
              <span className="block text-sm font-bold text-tinta">ChipPet</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-acento">Red de mascotas</span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Principal">
            {visibles.map((e) => (
              <NavLink key={e.a} to={e.a} className={claseEnlace}>
                {e.texto}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {usuario && perfil ? (
              <>
                <span className="hidden items-center gap-2 rounded-full border border-borde bg-fondo py-1 pl-1 pr-3 text-xs sm:flex">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-acento text-[10px] font-bold text-white">
                    {perfil.nombre.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-[140px] truncate font-medium text-tinta">{perfil.nombre}</span>
                  <span className="text-suave">· {ETIQUETA_ROL[perfil.rol]}</span>
                </span>
                <Campana usuarioId={usuario.id} />
                <button
                  type="button"
                  onClick={() => cerrarSesion()}
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-borde bg-white text-suave hover:text-tinta sm:flex"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <IconoSalir tamano={16} />
                </button>
              </>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/login" className="px-2 text-[13px] font-medium text-suave hover:text-tinta">
                  Iniciar sesión
                </Link>
                <Link to="/registro" className="rounded-lg bg-tinta px-3 py-2 text-[13px] font-medium text-white hover:bg-black">
                  Crear cuenta
                </Link>
              </div>
            )}
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white lg:hidden"
              onClick={() => setMenu((v) => !v)}
              aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menu}
            >
              {menu ? <IconoX tamano={18} /> : <IconoMenu tamano={18} />}
            </button>
          </div>
        </div>

        {menu && (
          <nav className="border-t border-borde bg-white px-3 py-2 lg:hidden" aria-label="Menú móvil">
            {perfil && (
              <p className="px-2 pb-2 pt-1 text-xs text-suave">
                {perfil.nombre} · {ETIQUETA_ROL[perfil.rol]}
              </p>
            )}
            <div className="flex flex-col">
              <NavLink to="/" end className={claseEnlace}>
                Inicio
              </NavLink>
              {visibles.map((e) => (
                <NavLink key={e.a} to={e.a} className={claseEnlace}>
                  {e.texto}
                </NavLink>
              ))}
              {usuario ? (
                <>
                  <NavLink to="/notificaciones" className={claseEnlace}>
                    Notificaciones
                  </NavLink>
                  <button type="button" onClick={() => cerrarSesion()} className="rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-alerta">
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={claseEnlace}>
                    Iniciar sesión
                  </NavLink>
                  <NavLink to="/registro" className={claseEnlace}>
                    Crear cuenta
                  </NavLink>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 sm:px-5 sm:py-8">
        {!supabaseConfigurado && (
          <Aviso tipo="alerta" titulo="Falta configurar Supabase" className="mb-4">
            Crea el archivo <code>.env</code> con <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver README) y reinicia el servidor.
          </Aviso>
        )}
        <Outlet />
      </main>

      <footer className="no-imprimir border-t border-borde bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-4 text-xs text-suave sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>
            <span className="font-bold text-tinta">ChipPet</span> © 2026 · Red de identificación y recuperación de mascotas.
          </p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-acento" /> Datos reservados protegidos · Historial inmutable
          </p>
        </div>
      </footer>
    </div>
  );
}
