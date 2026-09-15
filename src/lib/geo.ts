/** Utilidades geográficas puras (sin dependencias de navegador ni de Leaflet). */

export interface Punto {
  lat: number;
  lng: number;
}

/** Centro por defecto de los mapas: Pasto, Nariño (Colombia). */
export const PUNTO_CENTRAL: Punto = { lat: 1.2136, lng: -77.2811 };

const RADIO_TIERRA_KM = 6371.0088;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Distancia Haversine en kilómetros (misma fórmula que distancia_km en SQL). */
export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Desplaza un punto `metros` hacia el rumbo `grados` (0 = norte, 90 = este). */
export function desplazar(p: Punto, metros: number, grados: number): Punto {
  const ang = aRadianes(grados);
  return {
    lat: p.lat + (metros * Math.cos(ang)) / 111320,
    lng: p.lng + (metros * Math.sin(ang)) / (111320 * Math.max(Math.cos(aRadianes(p.lat)), 0.01)),
  };
}

/** "1,2 km" · "850 m" */
export function formatearDistancia(km: number): string {
  if (km < 0.995) {
    return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  }
  return `${km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`;
}

/** Ubicación del dispositivo (si el usuario la permite). */
export function obtenerUbicacionActual(): Promise<Punto> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Tu navegador no permite obtener la ubicación. Marca el punto en el mapa.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('No pudimos obtener tu ubicación. Marca el punto en el mapa.')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
