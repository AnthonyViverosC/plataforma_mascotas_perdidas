import type { ReactNode } from 'react';
import type { EstadoCaso, EstadoVerificacion, Temperamento } from '../tipos/tipos';
import { ETIQUETA_ESTADO_CASO, ETIQUETA_ESTADO_VERIFICACION } from '../tipos/tipos';
import { IconoAlerta, IconoCheck, IconoInfo } from './Iconos';

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-borde bg-white shadow-tarjeta ${className}`}>{children}</section>;
}

export function EtiquetaSeccion({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-suave ${className}`}>{children}</p>;
}

type Tono = 'neutro' | 'acento' | 'alerta' | 'aviso' | 'info' | 'oscuro';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-fondo text-suave border-borde',
  acento: 'bg-acento-claro text-acento border-acento/20',
  alerta: 'bg-alerta-claro text-alerta border-alerta/20',
  aviso: 'bg-aviso-claro text-aviso border-aviso/20',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  oscuro: 'bg-tinta text-white border-tinta',
};

export function Insignia({ tono = 'neutro', punto = false, children }: { tono?: Tono; punto?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONOS[tono]}`}
    >
      {punto && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const TONO_ESTADO_CASO: Record<EstadoCaso, Tono> = {
  ABIERTO: 'acento',
  EN_VERIFICACION: 'alerta',
  RESUELTO: 'info',
  CERRADO: 'neutro',
};

export function InsigniaEstadoCaso({ estado }: { estado: EstadoCaso }) {
  return (
    <Insignia tono={TONO_ESTADO_CASO[estado]} punto>
      {ETIQUETA_ESTADO_CASO[estado]}
    </Insignia>
  );
}

const TONO_VERIF: Record<EstadoVerificacion, Tono> = {
  PENDIENTE: 'aviso',
  APROBADA: 'acento',
  RECHAZADA: 'alerta',
  BLOQUEADA: 'oscuro',
};

export function InsigniaVerificacion({ estado }: { estado: EstadoVerificacion }) {
  return (
    <Insignia tono={TONO_VERIF[estado]} punto>
      {ETIQUETA_ESTADO_VERIFICACION[estado]}
    </Insignia>
  );
}

const ESTILO_AVISO: Record<'info' | 'alerta' | 'aviso' | 'exito', string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  alerta: 'border-alerta/30 bg-alerta-claro text-red-900',
  aviso: 'border-aviso/30 bg-aviso-claro text-amber-900',
  exito: 'border-acento/30 bg-acento-claro text-teal-900',
};

export function Aviso({
  tipo = 'info',
  titulo,
  children,
  className = '',
}: {
  tipo?: 'info' | 'alerta' | 'aviso' | 'exito';
  titulo?: string;
  children?: ReactNode;
  className?: string;
}) {
  const Icono = tipo === 'exito' ? IconoCheck : tipo === 'info' ? IconoInfo : IconoAlerta;
  return (
    <div role={tipo === 'alerta' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border px-3 py-2.5 text-sm ${ESTILO_AVISO[tipo]} ${className}`}>
      <Icono tamano={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="text-[13px] leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-suave" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-acento border-t-transparent" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Vacio({ icono, titulo, children }: { icono?: ReactNode; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borde bg-fondo/60 px-4 py-8 text-center">
      {icono && <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-suave shadow-tarjeta">{icono}</div>}
      <p className="text-sm font-semibold text-tinta">{titulo}</p>
      {children && <div className="max-w-sm text-xs text-suave">{children}</div>}
    </div>
  );
}

export function EncabezadoPagina({
  etiqueta,
  titulo,
  descripcion,
  acciones,
}: {
  etiqueta?: string;
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {etiqueta && <EtiquetaSeccion>{etiqueta}</EtiquetaSeccion>}
        <h1 className="text-xl font-bold tracking-tight text-tinta sm:text-2xl">{titulo}</h1>
        {descripcion && <p className="max-w-2xl text-sm text-suave">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

/** Aviso destacado para mascotas hurañas o que pueden morder (HU B). */
export function AvisoManejo({ temperamento, nota }: { temperamento: Temperamento | null; nota: string | null }) {
  if (temperamento !== 'HURANA' && temperamento !== 'PUEDE_MORDER') return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border-2 border-alerta bg-alerta-claro p-4 text-red-900">
      <IconoAlerta tamano={22} className="mt-0.5 shrink-0 text-alerta" />
      <div className="space-y-1">
        <p className="text-sm font-bold uppercase tracking-wide">
          {temperamento === 'PUEDE_MORDER' ? 'Puede morder' : 'Mascota huraña'}: no intente atraparla
        </p>
        <p className="text-sm">Repórtela y espere. Mantenga distancia y avise desde este sitio.</p>
        {nota && <p className="text-sm italic">“{nota}”</p>}
      </div>
    </div>
  );
}

export function FilaDato({ icono, etiqueta, valor }: { icono?: ReactNode; etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borde py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-xs text-suave">
        {icono}
        {etiqueta}
      </span>
      <span className="text-right text-xs font-semibold text-tinta">{valor}</span>
    </div>
  );
}
