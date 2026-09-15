import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { tiempoRelativo } from '../lib/formato';
import { IconoCampana } from './Iconos';

/** Campana con contador de no leídas y listado desplegable. */
export function Campana({ usuarioId }: { usuarioId: string }) {
  const { notificaciones, noLeidas, marcarLeida, marcarTodas } = useNotificaciones(usuarioId);
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();

  useEffect(() => {
    if (!abierta) return;
    const cerrar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierta]);

  const abrir = async (id: string, enlace: string | null, leida: boolean) => {
    if (!leida) await marcarLeida(id);
    setAbierta(false);
    if (enlace) navegar(enlace);
  };

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-borde bg-white text-tinta hover:bg-fondo"
        aria-label={noLeidas ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierta}
      >
        <IconoCampana tamano={17} />
        {noLeidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-alerta px-1 text-[10px] font-bold text-white">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <div className="fixed inset-x-3 top-16 z-[1100] overflow-hidden rounded-xl border border-borde bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80">
          <div className="flex items-center justify-between border-b border-borde px-3 py-2">
            <p className="text-sm font-semibold">Notificaciones</p>
            {noLeidas > 0 && (
              <button type="button" className="text-xs font-medium text-acento hover:underline" onClick={() => marcarTodas()}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-borde overflow-y-auto">
            {notificaciones.length === 0 && <li className="px-3 py-6 text-center text-xs text-suave">No tienes notificaciones.</li>}
            {notificaciones.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => abrir(n.id, n.enlace, Boolean(n.leida_en))}
                  className={`flex w-full gap-2 px-3 py-2.5 text-left hover:bg-fondo ${n.leida_en ? '' : 'bg-acento-claro/40'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leida_en ? 'bg-transparent' : 'bg-acento'}`} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-tinta">{n.titulo}</span>
                    <span className="block text-xs text-suave">{n.cuerpo}</span>
                    <span className="mt-0.5 block text-[10px] text-suave">{tiempoRelativo(n.creado_en)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/notificaciones" onClick={() => setAbierta(false)} className="block border-t border-borde px-3 py-2 text-center text-xs font-semibold text-acento hover:bg-fondo">
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
