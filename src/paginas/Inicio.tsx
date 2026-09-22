import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { IconoBuscar, IconoOjo, IconoPata } from '../componentes/Iconos';
import { TarjetaCaso } from '../componentes/TarjetaCaso';
import { Aviso, Cargando, Vacio } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';
import type { CasoPublico } from '../tipos/tipos';

/**
 * Portada. Una sola pregunta —¿qué vienes a hacer?— y tres respuestas.
 * Sin párrafos de presentación: la persona llega con una urgencia concreta.
 */
const ACCIONES = [
  {
    a: '/reportar',
    titulo: 'Encontré una mascota',
    texto: 'Súbela y avisamos a su dueño',
    icono: <IconoOjo tamano={26} />,
    destacada: true,
  },
  {
    a: '/casos/nuevo',
    titulo: 'Perdí mi mascota',
    texto: 'Publica el caso y busca coincidencias',
    icono: <IconoPata tamano={26} />,
  },
  {
    a: '/buscar',
    titulo: 'Ver mascotas',
    texto: 'Perdidas y encontradas cerca de ti',
    icono: <IconoBuscar tamano={26} />,
  },
];

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

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">¿Qué necesitas hacer?</h1>

        <div className="grid gap-3 sm:grid-cols-3">
          {ACCIONES.map((a) => (
            <Link
              key={a.a}
              to={a.a}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-6 text-center shadow-tarjeta transition hover:-translate-y-1 ${
                a.destacada ? 'border-tinta bg-tinta text-white' : 'border-borde bg-white text-tinta hover:border-acento/50'
              }`}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  a.destacada ? 'bg-white/15' : 'bg-acento-claro text-acento'
                }`}
              >
                {a.icono}
              </span>
              <span className="text-base font-bold leading-tight">{a.titulo}</span>
              <span className={`text-xs ${a.destacada ? 'text-white/70' : 'text-suave'}`}>{a.texto}</span>
            </Link>
          ))}
        </div>

        <form onSubmit={buscar} className="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="busqueda-inicio">
            Buscar por nombre, raza o color
          </label>
          <input
            id="busqueda-inicio"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca por nombre, raza o color…"
            className="h-11 flex-1 rounded-lg border border-borde px-3 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/30"
          />
          <Boton type="submit" tamano="lg" variante="secundario" icono={<IconoBuscar tamano={16} />}>
            Buscar
          </Boton>
        </form>

        <p className="text-center text-xs text-suave">Sin cuenta ni contraseña. Solo te pedimos un nombre y un teléfono cuando haga falta.</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold">Buscando su casa ahora</h2>
          <Link to="/buscar" className="text-sm font-semibold text-acento hover:underline">
            Ver todas
          </Link>
        </div>
        {error && <Aviso tipo="alerta">{error}</Aviso>}
        {cargando ? (
          <Cargando />
        ) : casos.length === 0 ? (
          <Vacio icono={<IconoPata />} titulo="No hay casos abiertos en este momento" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {casos.map((c) => (
              <TarjetaCaso key={c.id} caso={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
