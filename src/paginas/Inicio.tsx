import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { IconoBuscar, IconoEscudo, IconoOjo, IconoPata, IconoRadar } from '../componentes/Iconos';
import { MapaPuntos } from '../componentes/Mapa';
import { TarjetaCaso } from '../componentes/TarjetaCaso';
import { Aviso, Cargando, EtiquetaSeccion, Tarjeta, Vacio } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';
import type { CasoPublico } from '../tipos/tipos';

export function Inicio() {
  const navegar = useNavigate();
  const [q, setQ] = useState('');
  const [casos, setCasos] = useState<CasoPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    supabase
      .from('casos_publicos')
      .select('*')
      .eq('tipo', 'PERDIDA')
      .in('estado', ['ABIERTO', 'EN_VERIFICACION'])
      .order('creado_en', { ascending: false })
      .limit(6)
      .then(({ data, error: err }) => {
        if (!activo) return;
        setCasos((data as CasoPublico[] | null) ?? []);
        setError(err ? mensajeError(err) : null);
        setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    navegar(`/buscar${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  const acciones = [
    { a: '/casos/nuevo', titulo: 'Reportar mascota perdida', texto: 'Marca la última ubicación y activa el cruce automático.', icono: <IconoPata />, oscuro: true },
    { a: '/reportar', titulo: 'Reportar hallazgo o avistamiento', texto: 'Una foto, la ubicación y listo. Dos pantallas.', icono: <IconoOjo /> },
    { a: '/buscar', titulo: 'Buscar mascotas', texto: 'Filtra por especie, raza, color, zona y fechas.', icono: <IconoBuscar /> },
  ];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-borde bg-white shadow-tarjeta">
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div className="space-y-4">
            <EtiquetaSeccion className="text-acento">Red de identificación y recuperación</EtiquetaSeccion>
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
              Encontremos a tu mascota, <span className="text-acento">y entreguémosla a su verdadero dueño.</span>
            </h1>
            <p className="max-w-xl text-sm text-suave sm:text-base">
              Los dueños reportan pérdidas, los ciudadanos reportan hallazgos y el sistema cruza ambos reportes automáticamente. Antes de la entrega,
              verificamos al dueño con preguntas que solo él conoce.
            </p>
            <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="busqueda-inicio">
                Buscar por nombre, raza o color
              </label>
              <input
                id="busqueda-inicio"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, raza o color… ej. pastor alemán"
                className="h-11 flex-1 rounded-lg border border-borde px-3 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/30"
              />
              <Boton type="submit" tamano="lg" icono={<IconoBuscar tamano={16} />}>
                Buscar
              </Boton>
            </form>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { icono: <IconoRadar />, t: 'Cruce automático', d: 'Puntaje 0-100 con motivos' },
              { icono: <IconoEscudo />, t: 'Verificación', d: '3 preguntas reservadas' },
              { icono: <IconoPata />, t: 'Historial', d: 'Inmutable y público' },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-borde bg-fondo p-3">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-acento shadow-tarjeta">{x.icono}</div>
                <p className="text-xs font-semibold">{x.t}</p>
                <p className="text-[11px] text-suave">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {acciones.map((a) => (
          <Link
            key={a.a}
            to={a.a}
            className={`flex gap-3 rounded-xl border p-4 shadow-tarjeta transition hover:-translate-y-0.5 ${
              a.oscuro ? 'border-tinta bg-tinta text-white' : 'border-borde bg-white text-tinta hover:border-acento/40'
            }`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${a.oscuro ? 'bg-white/10' : 'bg-acento-claro text-acento'}`}>
              {a.icono}
            </span>
            <span>
              <span className="block text-sm font-bold">{a.titulo}</span>
              <span className={`block text-xs ${a.oscuro ? 'text-white/70' : 'text-suave'}`}>{a.texto}</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <EtiquetaSeccion>Casos recientes</EtiquetaSeccion>
            <h2 className="text-lg font-bold">Mascotas que siguen buscando su casa</h2>
          </div>
          <Link to="/buscar" className="text-sm font-semibold text-acento hover:underline">
            Ver todos
          </Link>
        </div>
        {error && <Aviso tipo="alerta">{error}</Aviso>}
        {cargando ? (
          <Cargando />
        ) : casos.length === 0 ? (
          <Vacio icono={<IconoPata />} titulo="No hay casos abiertos en este momento" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="grid gap-3 sm:grid-cols-2">
              {casos.map((c) => (
                <TarjetaCaso key={c.id} caso={c} />
              ))}
            </div>
            <Tarjeta className="p-2">
              <MapaPuntos
                alto={360}
                zoom={12}
                puntos={casos.map((c) => ({
                  id: c.id,
                  lat: c.lat_publica,
                  lng: c.lng_publica,
                  titulo: c.mascota_nombre ?? 'Mascota',
                  detalle: 'Ubicación aproximada',
                  enlace: `/caso/${c.id}`,
                  tono: 'alerta',
                }))}
              />
              <p className="px-1 pt-2 text-[11px] text-suave">Las ubicaciones son aproximadas (±300 m) para proteger a los dueños.</p>
            </Tarjeta>
          </div>
        )}
      </section>
    </div>
  );
}
