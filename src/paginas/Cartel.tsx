import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Boton } from '../componentes/Boton';
import { IconoFlechaIzq, IconoImprimir } from '../componentes/Iconos';
import { Cargando, Vacio } from '../componentes/ui';
import { rasgosCaso } from '../lib/compartir';
import { formatearFecha } from '../lib/formato';
import { supabase } from '../lib/supabase';
import type { CasoPublico, FotoMascota } from '../tipos/tipos';

/**
 * Cartel imprimible de un caso: alto contraste, letra grande y un QR que abre
 * la ficha. Pensado para pegar en postes y tiendas del barrio, en blanco y negro.
 * El teléfono del dueño solo aparece mientras el caso está vivo (contacto_caso).
 */
export function Cartel() {
  const { id } = useParams();
  const [caso, setCaso] = useState<CasoPublico | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [telefono, setTelefono] = useState<string | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');
  const [conTelefono, setConTelefono] = useState(true);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    (async () => {
      const { data } = await supabase.from('casos_publicos').select('*').eq('id', id).maybeSingle();
      if (!activo) return;
      if (!data) {
        setEstado('noexiste');
        return;
      }
      const c = data as CasoPublico;
      const [f, ct] = await Promise.all([
        c.mascota_id
          ? supabase.from('fotos_mascota').select('url, es_principal, orden').eq('mascota_id', c.mascota_id).order('orden')
          : Promise.resolve({ data: [] }),
        supabase.rpc('contacto_caso', { p_caso: c.id }),
      ]);
      if (!activo) return;
      const fotos = ((f.data as Pick<FotoMascota, 'url' | 'es_principal' | 'orden'>[] | null) ?? []).sort(
        (a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden,
      );
      setCaso(c);
      setFoto(fotos[0]?.url ?? c.foto_url);
      setTelefono(((ct.data as { telefono: string }[] | null) ?? [])[0]?.telefono ?? null);
      setEstado('ok');
    })();
    return () => {
      activo = false;
    };
  }, [id]);

  if (estado === 'cargando') return <Cargando texto="Preparando el cartel…" />;
  if (estado === 'noexiste' || !caso) {
    return (
      <Vacio titulo="No encontramos este caso">
        <Link to="/buscar" className="font-semibold text-acento">Ver mascotas perdidas</Link>
      </Vacio>
    );
  }

  const perdida = caso.tipo === 'PERDIDA';
  const url = `${window.location.origin}/caso/${caso.id}`;
  const vivo = caso.estado === 'ABIERTO' || caso.estado === 'EN_VERIFICACION';
  const hurana = caso.temperamento === 'HURANA' || caso.temperamento === 'PUEDE_MORDER';

  return (
    <div className="space-y-4">
      <div className="no-imprimir flex flex-wrap items-center justify-between gap-2">
        <Link to={`/caso/${caso.id}`} className="flex items-center gap-1 text-sm text-suave hover:text-tinta">
          <IconoFlechaIzq tamano={16} /> Volver a la ficha
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {telefono && (
            <label className="flex items-center gap-2 text-xs text-suave">
              <input type="checkbox" checked={conTelefono} onChange={(e) => setConTelefono(e.target.checked)} />
              Incluir mi teléfono
            </label>
          )}
          <Boton icono={<IconoImprimir tamano={16} />} onClick={() => window.print()}>
            Imprimir cartel
          </Boton>
        </div>
      </div>
      {!vivo && (
        <p className="no-imprimir rounded-lg border border-borde bg-fondo p-3 text-xs text-suave">
          Este caso está cerrado. Puedes imprimir el cartel, pero ya no se aceptan avisos y no lleva teléfono.
        </p>
      )}

      {/* El cartel: tamaño carta, blanco y negro, legible desde 3 metros. */}
      <article className="cartel mx-auto flex max-w-[720px] flex-col items-center gap-4 border-[6px] border-black bg-white p-6 text-center text-black sm:p-10">
        <h1 className="text-5xl font-black uppercase leading-none tracking-tight sm:text-7xl">{perdida ? 'Se busca' : 'Encontrado'}</h1>
        <p className="text-3xl font-extrabold uppercase sm:text-4xl">{caso.mascota_nombre ?? (perdida ? 'Mascota' : '¿Es tuyo?')}</p>

        <div className="aspect-[4/3] w-full overflow-hidden border-4 border-black bg-neutral-100">
          {foto ? (
            <img src={foto} alt={caso.mascota_nombre ?? 'Mascota'} className="h-full w-full object-cover grayscale-[15%]" />
          ) : (
            <div className="flex h-full items-center justify-center text-lg font-semibold">Sin foto</div>
          )}
        </div>

        <p className="text-xl font-bold sm:text-2xl">{rasgosCaso(caso)}</p>
        <p className="text-lg sm:text-xl">
          {perdida ? 'Se perdió' : 'Hallado'} el <strong>{formatearFecha(caso.ocurrido_en, false)}</strong>
          {caso.direccion_texto ? (
            <>
              {' '}
              en <strong>{caso.direccion_texto}</strong>
            </>
          ) : null}
        </p>

        {hurana && (
          <p className="w-full border-4 border-black bg-black px-3 py-2 text-lg font-extrabold uppercase text-white">
            No intente atraparla · avise y mantenga distancia
          </p>
        )}

        <div className="flex w-full flex-col items-center gap-4 border-t-4 border-black pt-4 sm:flex-row sm:justify-between sm:text-left">
          <div className="space-y-1">
            <p className="text-2xl font-black uppercase">¿La viste?</p>
            <p className="text-base">Escanea el código y avisa desde el celular. No necesitas cuenta.</p>
            {vivo && telefono && conTelefono && <p className="pt-1 font-mono text-3xl font-black tracking-wider">{telefono}</p>}
          </div>
          <div className="shrink-0 border-4 border-black bg-white p-2">
            <QRCodeSVG value={url} size={150} level="Q" marginSize={0} />
          </div>
        </div>
        <p className="break-all font-mono text-xs">{url}</p>
      </article>
    </div>
  );
}
