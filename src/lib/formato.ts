const ZONA = 'America/Bogota';

/** "30 oct 2025 · 09:14" */
export function formatearFecha(iso: string | Date, conHora = true): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: ZONA }).replace('.', '');
  if (!conHora) return fecha;
  const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA });
  return `${fecha} · ${hora}`;
}

/** "hace 30 min", "hace 2 horas", "hace 3 días" */
export function tiempoRelativo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'hace un momento';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const dias = Math.round(h / 24);
  if (dias < 30) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return formatearFecha(d, false);
}

/** Identificador corto y estable para mostrar: "#CAS-8F2A" */
export function idCorto(id: string, prefijo = 'CAS'): string {
  return `#${prefijo}-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}

/** "981 098 102 458 912" */
export function formatearChip(codigo: string): string {
  return codigo.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** "••• ••• ••• ••8 912" (para la vista pública) */
export function enmascararChip(codigo: string): string {
  const visible = codigo.slice(-4);
  return formatearChip('•'.repeat(codigo.length - 4) + visible);
}
