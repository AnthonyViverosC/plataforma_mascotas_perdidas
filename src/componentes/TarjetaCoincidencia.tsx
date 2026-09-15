import { useState } from 'react';
import { formatearFecha, tiempoRelativo } from '../lib/formato';
import { describirMotivos } from '../lib/matching';
import type { CoincidenciaConReporte, EstadoCoincidencia } from '../tipos/tipos';
import { ETIQUETA_ESPECIE, ETIQUETA_ESTADO_ANIMAL, ETIQUETA_ESTADO_COINCIDENCIA } from '../tipos/tipos';
import { Boton } from './Boton';
import { IconoCheck, IconoInterrogacion, IconoMapa, IconoReloj, IconoX } from './Iconos';
import { Insignia } from './ui';

const ETIQUETA_CRITERIO: Record<string, string> = {
  MICROCHIP: 'Microchip',
  DISTANCIA: 'Distancia',
  TIEMPO: 'Tiempo',
  RAZA: 'Raza',
  COLOR: 'Color',
  TAMANO: 'Tamaño',
  SEXO: 'Sexo',
};

function colorPuntaje(p: number) {
  if (p >= 75) return 'bg-acento';
  if (p >= 50) return 'bg-aviso';
  return 'bg-gray-400';
}

type Decision = Exclude<EstadoCoincidencia, 'SUGERIDA'>;

/** Sugerencia del motor con foto, zona, fecha, puntaje y desglose en lenguaje natural (HU-02). */
export function TarjetaCoincidencia({
  coincidencia,
  onDecidir,
}: {
  coincidencia: CoincidenciaConReporte;
  onDecidir?: (estado: Decision) => Promise<void>;
}) {
  const [enCurso, setEnCurso] = useState<Decision | null>(null);
  const r = coincidencia.reporte;
  const distancia = coincidencia.motivos.find((m) => m.criterio === 'DISTANCIA');
  const decidida = coincidencia.estado === 'CONFIRMADA' || coincidencia.estado === 'DESCARTADA';

  const decidir = async (estado: Decision) => {
    if (!onDecidir) return;
    setEnCurso(estado);
    try {
      await onDecidir(estado);
    } finally {
      setEnCurso(null);
    }
  };

  return (
    <article className={`overflow-hidden rounded-xl border bg-white ${decidida ? 'border-borde opacity-80' : 'border-borde shadow-tarjeta'}`}>
      <div className="flex flex-col gap-3 p-3 sm:flex-row">
        <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-lg bg-fondo sm:h-28 sm:w-28">
          {r?.foto_url && <img src={r.foto_url} alt="Foto del reporte" className="h-full w-full object-cover" loading="lazy" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {coincidencia.retroactiva && <Insignia tono="info">Retroactiva</Insignia>}
            {coincidencia.estado !== 'SUGERIDA' && (
              <Insignia tono={coincidencia.estado === 'CONFIRMADA' ? 'acento' : coincidencia.estado === 'DESCARTADA' ? 'neutro' : 'aviso'}>
                {ETIQUETA_ESTADO_COINCIDENCIA[coincidencia.estado]}
              </Insignia>
            )}
            {r && <Insignia>{ETIQUETA_ESTADO_ANIMAL[r.estado_animal]}</Insignia>}
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 space-y-1 text-xs text-suave">
              <p className="flex items-center gap-1.5">
                <IconoMapa tamano={14} />
                Zona: {distancia ? `${distancia.detalle} de la última ubicación` : 'sin dato'}
              </p>
              {r && (
                <p className="flex items-center gap-1.5">
                  <IconoReloj tamano={14} />
                  {formatearFecha(r.ocurrido_en)} · {tiempoRelativo(r.ocurrido_en)}
                </p>
              )}
              {r && (
                <p>
                  {ETIQUETA_ESPECIE[r.especie]}
                  {r.raza ? ` · ${r.raza}` : ''}
                  {r.color ? ` · ${r.color}` : ''}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-mono text-2xl font-bold leading-none text-tinta">{coincidencia.puntaje}</p>
              <p className="text-[10px] uppercase tracking-wide text-suave">de 100</p>
            </div>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-fondo">
            <div className={`h-full ${colorPuntaje(coincidencia.puntaje)}`} style={{ width: `${coincidencia.puntaje}%` }} />
          </div>

          <p className="text-sm font-medium text-tinta">{describirMotivos(coincidencia.motivos)}</p>

          <details className="text-xs text-suave">
            <summary className="cursor-pointer select-none font-medium text-acento">Ver desglose del puntaje</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {coincidencia.motivos.map((m) => (
                <li key={m.criterio} className="flex justify-between rounded bg-fondo px-2 py-1">
                  <span>{ETIQUETA_CRITERIO[m.criterio] ?? m.criterio}</span>
                  <span className="font-mono font-semibold text-tinta">+{m.aporte}</span>
                </li>
              ))}
            </ul>
          </details>
          {r?.nota && <p className="text-xs italic text-suave">“{r.nota}”</p>}
        </div>
      </div>

      {onDecidir && !decidida && (
        <div className="grid grid-cols-1 gap-2 border-t border-borde bg-fondo/60 p-3 sm:grid-cols-3">
          <Boton variante="acento" tamano="sm" icono={<IconoCheck tamano={14} />} cargando={enCurso === 'CONFIRMADA'} disabled={Boolean(enCurso)} onClick={() => decidir('CONFIRMADA')}>
            Es mi mascota
          </Boton>
          <Boton variante="peligro" tamano="sm" icono={<IconoX tamano={14} />} cargando={enCurso === 'DESCARTADA'} disabled={Boolean(enCurso)} onClick={() => decidir('DESCARTADA')}>
            No es mi mascota
          </Boton>
          <Boton
            variante="secundario"
            tamano="sm"
            icono={<IconoInterrogacion tamano={14} />}
            cargando={enCurso === 'NO_SEGURO'}
            disabled={Boolean(enCurso) || coincidencia.estado === 'NO_SEGURO'}
            onClick={() => decidir('NO_SEGURO')}
          >
            No estoy seguro
          </Boton>
        </div>
      )}
      {decidida && coincidencia.decidida_en && (
        <p className="border-t border-borde px-3 py-2 text-[11px] text-suave">Decidida el {formatearFecha(coincidencia.decidida_en)}</p>
      )}
    </article>
  );
}
