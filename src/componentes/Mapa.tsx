import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { obtenerUbicacionActual, PUNTO_CENTRAL, type Punto } from '../lib/geo';
import { Boton } from './Boton';
import { IconoMapa } from './Iconos';

type TonoMarcador = 'tinta' | 'acento' | 'alerta' | 'aviso';

const iconos: Record<TonoMarcador, L.DivIcon> = {
  tinta: crearIcono('tinta'),
  acento: crearIcono('acento'),
  alerta: crearIcono('alerta'),
  aviso: crearIcono('aviso'),
};

function crearIcono(tono: TonoMarcador) {
  return L.divIcon({
    className: '',
    html: `<span class="marcador marcador-${tono}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  });
}

const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TESELAS = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function Recentrar({ centro, zoom }: { centro: Punto; zoom?: number }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.setView([centro.lat, centro.lng], zoom ?? mapa.getZoom(), { animate: true });
  }, [centro.lat, centro.lng, zoom, mapa]);
  return null;
}

function CapturarClic({ onClic }: { onClic: (p: Punto) => void }) {
  useMapEvents({
    click: (e) => onClic({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

/** Selector de ubicación: toca el mapa para marcar el punto. */
export function SelectorUbicacion({
  valor,
  onCambio,
  alto = 280,
  error,
  radioKm,
}: {
  valor: Punto | null;
  onCambio: (p: Punto) => void;
  alto?: number;
  error?: string;
  radioKm?: number;
}) {
  const [centro, setCentro] = useState<Punto>(valor ?? PUNTO_CENTRAL);
  const [buscando, setBuscando] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);

  const usarMiUbicacion = async () => {
    setBuscando(true);
    setErrorGps(null);
    try {
      const p = await obtenerUbicacionActual();
      setCentro(p);
      onCambio(p);
    } catch (e) {
      setErrorGps((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className={`overflow-hidden rounded-lg border ${error ? 'border-alerta' : 'border-borde'}`} style={{ height: alto }}>
        <MapContainer center={[centro.lat, centro.lng]} zoom={14} className="h-full w-full" scrollWheelZoom>
          <TileLayer attribution={ATRIBUCION} url={TESELAS} />
          <Recentrar centro={centro} />
          <CapturarClic onClic={onCambio} />
          {valor && <Marker position={[valor.lat, valor.lng]} icon={iconos.alerta} />}
          {valor && radioKm ? (
            <Circle center={[valor.lat, valor.lng]} radius={radioKm * 1000} pathOptions={{ color: '#0f766e', weight: 1, fillOpacity: 0.06 }} />
          ) : null}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-suave">
          <IconoMapa tamano={14} />
          {valor ? (
            <span className="font-mono">
              {valor.lat.toFixed(5)}, {valor.lng.toFixed(5)}
            </span>
          ) : (
            'Toca el mapa para marcar el punto.'
          )}
        </p>
        <Boton variante="secundario" tamano="sm" onClick={usarMiUbicacion} cargando={buscando}>
          Usar mi ubicación
        </Boton>
      </div>
      {(error || errorGps) && (
        <p role="alert" className="text-xs font-medium text-alerta">
          {error ?? errorGps}
        </p>
      )}
    </div>
  );
}

export interface PuntoMapa extends Punto {
  id: string;
  titulo: string;
  detalle?: string;
  enlace?: string;
  tono?: TonoMarcador;
}

/** Mapa de solo lectura con varios puntos y, opcionalmente, un círculo de radio. */
export function MapaPuntos({
  puntos,
  centro,
  circulo,
  alto = 260,
  zoom = 13,
}: {
  puntos: PuntoMapa[];
  centro?: Punto;
  circulo?: Punto & { radioKm: number };
  alto?: number;
  zoom?: number;
}) {
  const c = useMemo(() => centro ?? (puntos[0] ? { lat: puntos[0].lat, lng: puntos[0].lng } : PUNTO_CENTRAL), [centro, puntos]);
  return (
    <div className="overflow-hidden rounded-lg border border-borde" style={{ height: alto }}>
      <MapContainer center={[c.lat, c.lng]} zoom={zoom} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer attribution={ATRIBUCION} url={TESELAS} />
        <Recentrar centro={c} zoom={zoom} />
        {circulo && (
          <Circle
            center={[circulo.lat, circulo.lng]}
            radius={circulo.radioKm * 1000}
            pathOptions={{ color: '#0f766e', weight: 1, fillOpacity: 0.06, dashArray: '4 4' }}
          />
        )}
        {puntos.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={iconos[p.tono ?? 'tinta']}>
            <Popup>
              <div className="space-y-1 text-xs">
                <p className="font-semibold">{p.titulo}</p>
                {p.detalle && <p className="text-suave">{p.detalle}</p>}
                {p.enlace && (
                  <Link to={p.enlace} className="font-semibold text-acento underline">
                    Ver ficha
                  </Link>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
