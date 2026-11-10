import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Tarjeta } from '../componentes/ui';
import { porSemana, resumir, type CasoEstadistica, type Resumen } from '../lib/estadisticas';
import { mensajeError, supabase } from '../lib/supabase';
import { ETIQUETA_ESPECIE, type Especie } from '../tipos/tipos';

const SEMANAS = 8;

/**
 * Indicadores públicos de la red. Salen de `casos_publicos` (sin ubicaciones
 * exactas ni teléfonos) y de un conteo de `reportes`: nada personal.
 */
export function Estadisticas() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [semanas, setSemanas] = useState<number[]>([]);
  const [avistamientos30, setAvistamientos30] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    Promise.all([
      supabase.from('casos_publicos').select('tipo, estado, desenlace, especie, creado_en, ultima_actividad_en').limit(5000),
      supabase.from('reportes').select('id', { count: 'exact', head: true }).gte('creado_en', hace30),
    ]).then(([c, r]) => {
      if (!activo) return;
      const err = c.error ?? r.error;
      if (err) setError(mensajeError(err));
      const casos = (c.data as CasoEstadistica[] | null) ?? [];
      setResumen(resumir(casos));
      setSemanas(porSemana(casos, SEMANAS));
      setAvistamientos30(r.count ?? 0);
    });
    return () => {
      activo = false;
    };
  }, []);

  if (!resumen) return error ? <Aviso tipo="alerta">{error}</Aviso> : <Cargando texto="Calculando indicadores…" />;

  const maxSemana = Math.max(1, ...semanas);
  const totalEspecies = Math.max(1, Object.values(resumen.porEspecie).reduce((a, b) => a + b, 0));

  const tiles: { valor: string; etiqueta: string; detalle?: string }[] = [
    { valor: String(resumen.activos), etiqueta: 'Buscando su casa', detalle: 'Casos de pérdida abiertos' },
    { valor: String(resumen.reencontradas), etiqueta: 'Reencontradas', detalle: 'Volvieron con su familia' },
    {
      valor: resumen.tasaReencuentro === null ? '—' : `${resumen.tasaReencuentro} %`,
      etiqueta: 'Tasa de reencuentro',
      detalle: resumen.terminados ? `Sobre ${resumen.terminados} casos terminados` : 'Aún no termina ningún caso',
    },
    {
      valor: resumen.medianaDiasReencuentro === null ? '—' : `${Math.round(resumen.medianaDiasReencuentro * 10) / 10} d`,
      etiqueta: 'Tiempo típico hasta el reencuentro',
      detalle: 'Mediana, aproximada',
    },
    { valor: String(avistamientos30 ?? 0), etiqueta: 'Avisos ciudadanos', detalle: 'Reportes de los últimos 30 días' },
    { valor: String(resumen.hallazgosActivos), etiqueta: 'Hallazgos sin dueño', detalle: 'Animales encontrados esperando' },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        etiqueta="Transparencia"
        titulo="Cómo va la red"
        descripcion="Datos en vivo de todos los casos. No incluyen ubicaciones exactas ni datos de contacto."
      />
      {error && <Aviso tipo="alerta">{error}</Aviso>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <Tarjeta key={t.etiqueta} className="p-4">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-tinta">{t.valor}</p>
            <p className="mt-1 text-sm font-semibold text-tinta">{t.etiqueta}</p>
            {t.detalle && <p className="text-xs text-suave">{t.detalle}</p>}
          </Tarjeta>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-4">
          <EtiquetaSeccion className="mb-3">Pérdidas publicadas por semana</EtiquetaSeccion>
          <div className="flex h-40 items-end gap-2" role="img" aria-label={`Pérdidas por semana, de la más antigua a la actual: ${semanas.join(', ')}`}>
            {semanas.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold tabular-nums text-suave">{n}</span>
                <div
                  className={`w-full rounded-t ${i === semanas.length - 1 ? 'bg-acento' : 'bg-acento/40'}`}
                  style={{ height: `${Math.max(2, (n / maxSemana) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-suave">
            <span>Hace {SEMANAS - 1} semanas</span>
            <span>Esta semana</span>
          </div>
        </Tarjeta>

        <Tarjeta className="p-4">
          <EtiquetaSeccion className="mb-3">Casos abiertos por especie</EtiquetaSeccion>
          <ul className="space-y-3">
            {(Object.keys(resumen.porEspecie) as Especie[]).map((e) => {
              const n = resumen.porEspecie[e];
              return (
                <li key={e} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold">{ETIQUETA_ESPECIE[e]}</span>
                    <span className="tabular-nums text-suave">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-fondo">
                    <div className="h-full rounded-full bg-tinta" style={{ width: `${(n / totalEspecies) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-suave">
            ¿Quieres ayudar?{' '}
            <Link to="/buscar" className="font-semibold text-acento hover:underline">
              Revisa los casos más antiguos de tu zona
            </Link>
            : son los que menos gente está viendo.
          </p>
        </Tarjeta>
      </div>
    </div>
  );
}
