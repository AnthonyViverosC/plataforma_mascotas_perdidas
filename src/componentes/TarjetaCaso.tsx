import { Link } from 'react-router-dom';
import { formatearFecha, idCorto, tiempoRelativo } from '../lib/formato';
import { ETIQUETA_ESPECIE, ETIQUETA_TAMANO, type CasoPublico } from '../tipos/tipos';
import { IconoMapa, IconoPata, IconoReloj } from './Iconos';
import { Insignia, InsigniaEstadoCaso } from './ui';

export function TarjetaCaso({ caso, extra }: { caso: CasoPublico; extra?: string }) {
  return (
    <Link
      to={`/caso/${caso.id}`}
      className="group flex gap-3 overflow-hidden rounded-xl border border-borde bg-white p-3 shadow-tarjeta transition hover:border-acento/40"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-fondo">
        {caso.foto_url ? (
          <img src={caso.foto_url} alt={caso.mascota_nombre ?? 'Mascota'} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-suave">
            <IconoPata tamano={28} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-suave">{idCorto(caso.id)}</span>
          <InsigniaEstadoCaso estado={caso.estado} />
          {caso.tipo === 'HALLAZGO' && <Insignia tono="info">Hallazgo</Insignia>}
        </div>
        <p className="truncate text-sm font-bold text-tinta">{caso.mascota_nombre ?? 'Animal sin identificar'}</p>
        <p className="truncate text-xs text-suave">
          {[caso.especie && ETIQUETA_ESPECIE[caso.especie], caso.raza, caso.color_principal, caso.tamano && ETIQUETA_TAMANO[caso.tamano]]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-suave">
          <IconoMapa tamano={13} /> {caso.direccion_texto || 'Zona aproximada en el mapa'}
        </p>
        <p className="flex items-center gap-1 text-xs text-suave">
          <IconoReloj tamano={13} /> {formatearFecha(caso.ocurrido_en)} · {tiempoRelativo(caso.ocurrido_en)}
        </p>
        {extra && <p className="text-xs font-semibold text-acento">{extra}</p>}
      </div>
    </Link>
  );
}
