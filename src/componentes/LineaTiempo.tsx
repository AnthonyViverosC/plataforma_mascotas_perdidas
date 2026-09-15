import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { listarEventos, META_EVENTO, type TonoEvento } from '../lib/eventos';
import { formatearFecha, tiempoRelativo } from '../lib/formato';
import { mensajeError } from '../lib/supabase';
import { ETIQUETA_ROL, type EventoConAutor, type TipoEvento } from '../tipos/tipos';
import { Boton } from './Boton';
import {
  IconoAlerta,
  IconoCandado,
  IconoCheck,
  IconoChip,
  IconoDocumento,
  IconoEditar,
  IconoEscudo,
  IconoInterrogacion,
  IconoMapa,
  IconoMas,
  IconoOjo,
  IconoRadar,
  IconoX,
} from './Iconos';
import { Aviso, Cargando, Vacio } from './ui';

const ICONO: Record<TipoEvento, (p: { tamano?: number }) => ReactNode> = {
  CREACION: IconoMas,
  AVISTAMIENTO: IconoOjo,
  LECTURA_MICROCHIP: IconoChip,
  LECTURA_ANULADA: IconoX,
  COINCIDENCIA_SUGERIDA: IconoRadar,
  COINCIDENCIA_CONFIRMADA: IconoCheck,
  COINCIDENCIA_DESCARTADA: IconoX,
  COINCIDENCIA_NO_SEGURO: IconoInterrogacion,
  VERIFICACION_INICIADA: IconoEscudo,
  VERIFICACION_INTENTO: IconoEscudo,
  VERIFICACION_APROBADA: IconoCheck,
  VERIFICACION_RECHAZADA: IconoX,
  VERIFICACION_BLOQUEADA: IconoCandado,
  CAMBIO_DATOS: IconoEditar,
  CAMBIO_ESTADO: IconoAlerta,
  RADIO_AMPLIADO: IconoMapa,
  CIERRE: IconoDocumento,
};

const COLOR_TONO: Record<TonoEvento, { circulo: string; etiqueta: string }> = {
  neutro: { circulo: 'bg-fondo text-suave border-borde', etiqueta: 'bg-fondo text-suave' },
  acento: { circulo: 'bg-acento-claro text-acento border-acento/30', etiqueta: 'bg-acento-claro text-acento' },
  alerta: { circulo: 'bg-alerta-claro text-alerta border-alerta/30', etiqueta: 'bg-alerta-claro text-alerta' },
  aviso: { circulo: 'bg-aviso-claro text-aviso border-aviso/30', etiqueta: 'bg-aviso-claro text-aviso' },
  info: { circulo: 'bg-sky-50 text-sky-700 border-sky-200', etiqueta: 'bg-sky-50 text-sky-700' },
};

/**
 * Historial inmutable del caso: orden descendente, páginas de 20.
 * No ofrece ninguna acción de edición ni borrado.
 */
export function LineaTiempo({ casoId, version = 0 }: { casoId: string; version?: number }) {
  const [eventos, setEventos] = useState<EventoConAutor[]>([]);
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (p: number) => {
      setCargando(true);
      try {
        const r = await listarEventos(casoId, p);
        setEventos((prev) => (p === 0 ? r.eventos : [...prev, ...r.eventos.filter((e) => !prev.some((x) => x.id === e.id))]));
        setHayMas(r.hayMas);
        setPagina(p);
        setError(null);
      } catch (e) {
        setError(mensajeError(e));
      } finally {
        setCargando(false);
      }
    },
    [casoId],
  );

  useEffect(() => {
    void cargar(0);
  }, [cargar, version]);

  if (error) return <Aviso tipo="alerta" titulo="No se pudo cargar el historial">{error}</Aviso>;
  if (cargando && eventos.length === 0) return <Cargando texto="Cargando historial…" />;
  if (eventos.length === 0) return <Vacio titulo="Sin eventos registrados aún en este caso" />;

  return (
    <div>
      <ol className="relative space-y-4">
        {eventos.map((ev, i) => {
          const meta = META_EVENTO[ev.tipo];
          const colores = COLOR_TONO[meta.tono];
          const Icono = ICONO[ev.tipo];
          return (
            <li key={ev.id} className="relative flex gap-3">
              {i < eventos.length - 1 && <span className="absolute left-[15px] top-9 h-[calc(100%-12px)] w-px bg-borde" aria-hidden="true" />}
              <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${colores.circulo}`}>
                <Icono tamano={15} />
              </span>
              <div className="min-w-0 flex-1 rounded-lg border border-borde bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colores.etiqueta}`}>{meta.etiqueta}</span>
                    <span className="text-xs text-suave">{tiempoRelativo(ev.creado_en)}</span>
                  </div>
                  <span className="text-[11px] text-suave">
                    Por: <span className="font-medium text-tinta">{ev.autor ? `${ev.autor.nombre} (${ETIQUETA_ROL[ev.autor.rol]})` : 'Sistema'}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-tinta">{ev.descripcion}</p>
                <p className="mt-1 font-mono text-[11px] text-suave">{formatearFecha(ev.creado_en)}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {hayMas && (
        <div className="mt-4 flex justify-center">
          <Boton variante="secundario" tamano="sm" cargando={cargando} onClick={() => cargar(pagina + 1)}>
            Ver 20 eventos anteriores
          </Boton>
        </div>
      )}
    </div>
  );
}
