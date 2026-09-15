import { useNavigate } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { IconoCampana } from '../componentes/Iconos';
import { Aviso, Cargando, EncabezadoPagina, Tarjeta, Vacio } from '../componentes/ui';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { useSesion } from '../hooks/useSesion';
import { formatearFecha, tiempoRelativo } from '../lib/formato';

export function Notificaciones() {
  const { usuario } = useSesion();
  const { notificaciones, noLeidas, cargando, error, marcarLeida, marcarTodas } = useNotificaciones(usuario?.id ?? null);
  const navegar = useNavigate();

  const abrir = async (id: string, enlace: string | null, leida: boolean) => {
    if (!leida) await marcarLeida(id);
    if (enlace) navegar(enlace);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        etiqueta="Bandeja"
        titulo="Notificaciones"
        descripcion={noLeidas ? `Tienes ${noLeidas} sin leer.` : 'Estás al día.'}
        acciones={
          noLeidas > 0 ? (
            <Boton variante="secundario" tamano="sm" onClick={() => marcarTodas()}>
              Marcar todas como leídas
            </Boton>
          ) : undefined
        }
      />
      {error && <Aviso tipo="alerta">{error}</Aviso>}
      {cargando && notificaciones.length === 0 ? (
        <Cargando />
      ) : notificaciones.length === 0 ? (
        <Vacio icono={<IconoCampana />} titulo="No tienes notificaciones">
          Te avisaremos de coincidencias, verificaciones y lecturas de microchip de tus mascotas.
        </Vacio>
      ) : (
        <Tarjeta className="divide-y divide-borde">
          {notificaciones.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => abrir(n.id, n.enlace, Boolean(n.leida_en))}
              className={`flex w-full gap-3 p-4 text-left hover:bg-fondo ${n.leida_en ? '' : 'bg-acento-claro/40'}`}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leida_en ? 'bg-borde' : 'bg-acento'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{n.titulo}</span>
                  <span className="text-[11px] text-suave" title={formatearFecha(n.creado_en)}>
                    {tiempoRelativo(n.creado_en)}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-suave">{n.cuerpo}</span>
              </span>
            </button>
          ))}
        </Tarjeta>
      )}
    </div>
  );
}
