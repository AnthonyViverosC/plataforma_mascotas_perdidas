import { Link } from 'react-router-dom';
import { formatearFecha, idCorto, tiempoRelativo } from '../lib/formato';
import { ETIQUETA_ESPECIE, ETIQUETA_ESTADO_ANIMAL, ETIQUETA_SEXO, ETIQUETA_TAMANO, type Reporte } from '../tipos/tipos';
import { IconoPata, IconoReloj } from './Iconos';
import { Insignia } from './ui';

/**
 * Reporte de hallazgo o avistamiento en la lista de búsqueda.
 * Abre la ficha completa: quien busca a su mascota necesita ver la foto
 * grande, el resto de rasgos y el punto en el mapa antes de decidir.
 */
export function TarjetaReporte({ reporte, extra }: { reporte: Reporte; extra?: string }) {
  const rasgos = [
    ETIQUETA_ESPECIE[reporte.especie],
    reporte.raza,
    reporte.color,
    reporte.tamano && ETIQUETA_TAMANO[reporte.tamano],
    reporte.sexo && reporte.sexo !== 'DESCONOCIDO' ? ETIQUETA_SEXO[reporte.sexo] : null,
  ].filter(Boolean);

  return (
    <Link
      to={`/reporte/${reporte.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-borde bg-white shadow-tarjeta transition hover:border-acento/40"
    >
      <div className="h-40 w-full overflow-hidden bg-fondo">
        {reporte.foto_url ? (
          <img
            src={reporte.foto_url}
            alt="Animal reportado"
            className="h-full w-full object-cover transition group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-suave">
            <IconoPata tamano={28} />
          </div>
        )}
      </div>
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-suave">{idCorto(reporte.id, 'REP')}</span>
          <Insignia tono="acento">{ETIQUETA_ESTADO_ANIMAL[reporte.estado_animal]}</Insignia>
        </div>
        <p className="truncate text-sm font-semibold">{rasgos.join(' · ')}</p>
        <p className="flex items-center gap-1 text-xs text-suave">
          <IconoReloj tamano={13} /> {formatearFecha(reporte.ocurrido_en)} · {tiempoRelativo(reporte.ocurrido_en)}
        </p>
        {reporte.nota && <p className="line-clamp-2 text-xs italic text-suave">“{reporte.nota}”</p>}
        {extra && <p className="text-xs font-semibold text-acento">{extra}</p>}
        <p className="pt-0.5 text-xs font-semibold text-acento group-hover:underline">Ver toda la información →</p>
      </div>
    </Link>
  );
}
