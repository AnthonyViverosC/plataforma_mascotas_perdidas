import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

type Variante = 'primario' | 'secundario' | 'peligro' | 'acento' | 'fantasma';
type Tamano = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 select-none';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-tinta text-white hover:bg-black',
  secundario: 'border border-borde bg-white text-tinta hover:bg-fondo',
  peligro: 'border border-alerta/30 bg-white text-alerta hover:bg-alerta-claro',
  acento: 'bg-acento text-white hover:bg-teal-800',
  fantasma: 'text-suave hover:bg-fondo hover:text-tinta',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
};

const clases = (variante: Variante, tamano: Tamano, ancho: boolean, extra?: string) =>
  [BASE, VARIANTES[variante], TAMANOS[tamano], ancho ? 'w-full' : '', extra ?? ''].join(' ');

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  cargando?: boolean;
  ancho?: boolean;
  icono?: ReactNode;
}

export function Boton({
  variante = 'primario',
  tamano = 'md',
  cargando = false,
  ancho = false,
  icono,
  className,
  children,
  disabled,
  type = 'button',
  ...resto
}: PropsBoton) {
  return (
    <button type={type} className={clases(variante, tamano, ancho, className)} disabled={disabled || cargando} {...resto}>
      {cargando ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : (
        icono
      )}
      {children}
    </button>
  );
}

interface PropsBotonEnlace extends LinkProps {
  variante?: Variante;
  tamano?: Tamano;
  ancho?: boolean;
  icono?: ReactNode;
}

export function BotonEnlace({ variante = 'primario', tamano = 'md', ancho = false, icono, className, children, ...resto }: PropsBotonEnlace) {
  return (
    <Link className={clases(variante, tamano, ancho, className)} {...resto}>
      {icono}
      {children}
    </Link>
  );
}
