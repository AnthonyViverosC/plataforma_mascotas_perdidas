import type { ReactNode, SVGProps } from 'react';

type PropsIcono = SVGProps<SVGSVGElement> & { tamano?: number };

function Icono({ tamano = 18, children, ...resto }: PropsIcono & { children: ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  );
}

export const IconoPata = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="5.5" cy="10" r="2" />
    <circle cx="9.5" cy="5.5" r="2" />
    <circle cx="14.5" cy="5.5" r="2" />
    <circle cx="18.5" cy="10" r="2" />
    <path d="M12 11c-3 0-5.5 3.5-5.5 6a2.5 2.5 0 0 0 3.5 2.3c1.3-.5 2.7-.5 4 0A2.5 2.5 0 0 0 17.5 17c0-2.5-2.5-6-5.5-6z" />
  </Icono>
);
export const IconoCampana = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </Icono>
);
export const IconoMapa = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icono>
);
export const IconoReloj = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icono>
);
export const IconoEscudo = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icono>
);
export const IconoChip = (p: PropsIcono) => (
  <Icono {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </Icono>
);
export const IconoCalendario = (p: PropsIcono) => (
  <Icono {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icono>
);
export const IconoCheck = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M5 12l5 5L20 7" />
  </Icono>
);
export const IconoX = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icono>
);
export const IconoAlerta = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v4M12 17.5v.5" />
  </Icono>
);
export const IconoInfo = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.5" />
  </Icono>
);
export const IconoBuscar = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icono>
);
export const IconoMas = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icono>
);
export const IconoTelefono = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M6.5 3h3l1.5 4-2 1.2a12 12 0 0 0 5.8 5.8L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.2 2 2 0 0 1 5.5 3z" />
  </Icono>
);

export const IconoUsuario = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icono>
);
export const IconoSalir = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
    <path d="M10 17l-5-5 5-5M5 12h11" />
  </Icono>
);
export const IconoMenu = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icono>
);
export const IconoCandado = (p: PropsIcono) => (
  <Icono {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icono>
);
export const IconoImprimir = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M7 9V3h10v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v7H7z" />
  </Icono>
);
export const IconoFlechaIzq = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icono>
);
export const IconoEditar = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icono>
);
export const IconoEstetoscopio = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M6 3v6a4 4 0 0 0 8 0V3" />
    <path d="M10 13v2a5 5 0 0 0 10 0v-2" />
    <circle cx="20" cy="11" r="2" />
  </Icono>
);
export const IconoRadar = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Icono>
);
export const IconoDocumento = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Icono>
);
export const IconoInterrogacion = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.5" />
  </Icono>
);
export const IconoOjo = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icono>
);
export const IconoEstrella = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
  </Icono>
);
export const IconoFoto = (p: PropsIcono) => (
  <Icono {...p}>
    <rect x="3" y="5" width="18" height="15" rx="2" />
    <circle cx="9" cy="11" r="2" />
    <path d="M21 17l-5-5-9 8" />
  </Icono>
);
