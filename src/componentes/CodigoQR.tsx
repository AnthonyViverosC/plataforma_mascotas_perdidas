import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Boton } from './Boton';
import { IconoDescargar, IconoImprimir } from './Iconos';

/** Dirección que abre quien escanea la placa. Usa el sitio desde el que se mira. */
const urlDePlaca = (codigo: string): string => `${window.location.origin}/placa/${codigo}`;

/**
 * Código QR de una placa, con botones para imprimirlo o descargarlo.
 * Nivel de corrección "Q" (25 %): sigue leyéndose con la placa rayada o sucia.
 */
export function CodigoQR({ codigo, nombre, tamano = 220 }: { codigo: string; nombre: string; tamano?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const url = urlDePlaca(codigo);

  const descargar = () => {
    const svg = contenedor.current?.querySelector('svg');
    if (!svg) return;
    const texto = new XMLSerializer().serializeToString(svg);
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml' }));
    enlace.download = `placa-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${codigo}.svg`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  return (
    <div className="space-y-3">
      <div ref={contenedor} className="inline-block rounded-xl border border-borde bg-white p-4" role="img" aria-label={`Código QR de la placa de ${nombre}`}>
        <QRCodeSVG value={url} size={tamano} level="Q" marginSize={0} />
      </div>
      <p className="break-all font-mono text-[11px] text-suave">{url}</p>
      <div className="no-imprimir flex flex-wrap gap-2">
        <Boton variante="secundario" tamano="sm" icono={<IconoImprimir tamano={14} />} onClick={() => window.print()}>
          Imprimir
        </Boton>
        <Boton variante="secundario" tamano="sm" icono={<IconoDescargar tamano={14} />} onClick={descargar}>
          Descargar SVG
        </Boton>
      </div>
    </div>
  );
}
