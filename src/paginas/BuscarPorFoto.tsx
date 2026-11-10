import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { Selector } from '../componentes/Campo';
import { IconoFoto, IconoRadar } from '../componentes/Iconos';
import { TarjetaCaso } from '../componentes/TarjetaCaso';
import { Aviso, Cargando, EncabezadoPagina, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';
import { conLimite, ETIQUETA_NIVEL, firmaDeImagen, nivelDe, similitud, type Firma } from '../lib/semejanza';
import { validarFoto } from '../lib/validacion';
import { ETIQUETA_ESPECIE, type CasoPublico } from '../tipos/tipos';

/** Cuántos resultados se muestran antes de pedir "Ver más". */
const VISIBLES = 8;
/** Cuántas fotos de casos se leen a la vez. */
const EN_PARALELO = 6;
/** Máximo de casos que se comparan en una búsqueda. */
const MAX_CASOS = 150;

interface Resultado {
  caso: CasoPublico;
  puntaje: number;
}

/**
 * Casos parecidos a partir de una foto (HU-10).
 *
 * La foto se lee y se compara en el navegador: no se sube ni se guarda, así que
 * no pide datos ni sesión. La semejanza compara colores y distribución de luz,
 * no reconoce a un animal concreto; por eso cada resultado lleva su porcentaje
 * y un aviso de que hay que confirmar entrando a la ficha del caso.
 */
export function BuscarPorFoto() {
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [especie, setEspecie] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fase, setFase] = useState<'inicio' | 'comparando' | 'listo'>('inicio');
  const [avance, setAvance] = useState({ hechos: 0, total: 0 });
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [sinLeer, setSinLeer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  // Libera la vista previa al cambiar de foto o salir
  useEffect(() => {
    return () => {
      if (vista) URL.revokeObjectURL(vista);
    };
  }, [vista]);

  const elegir = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problema = validarFoto(f);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setArchivo(f);
    setVista(URL.createObjectURL(f));
    setFase('inicio');
    setResultados([]);
    setVerTodos(false);
  };

  const buscar = async () => {
    if (!archivo) return;
    setError(null);
    setFase('comparando');
    setResultados([]);
    setSinLeer(0);
    setVerTodos(false);

    try {
      const firmaConsulta: Firma | null = await firmaDeImagen(archivo);
      if (!firmaConsulta) throw new Error('No pudimos leer esa foto. Prueba con otra imagen JPG, PNG o WEBP.');

      let consulta = supabase
        .from('casos_publicos')
        .select('*')
        .eq('tipo', 'PERDIDA')
        .in('estado', ['ABIERTO', 'EN_VERIFICACION'])
        .not('foto_url', 'is', null)
        .order('creado_en', { ascending: false })
        .limit(MAX_CASOS);
      if (especie) consulta = consulta.eq('especie', especie);
      const { data, error: err } = await consulta;
      if (err) throw new Error(mensajeError(err));
      const casos = (data as CasoPublico[] | null) ?? [];

      setAvance({ hechos: 0, total: casos.length });
      const firmas = await conLimite(
        casos,
        EN_PARALELO,
        (c) => firmaDeImagen(c.foto_url as string),
        (hechos) => setAvance({ hechos, total: casos.length }),
      );

      const lista: Resultado[] = [];
      let fallidas = 0;
      casos.forEach((caso, i) => {
        const f = firmas[i];
        if (f) lista.push({ caso, puntaje: similitud(firmaConsulta, f) });
        else fallidas += 1;
      });
      lista.sort((a, b) => b.puntaje - a.puntaje || b.caso.creado_en.localeCompare(a.caso.creado_en));
      setResultados(lista);
      setSinLeer(fallidas);
      setFase('listo');
    } catch (e) {
      setError(mensajeError(e));
      setFase('inicio');
    }
  };

  const mostrados = verTodos ? resultados : resultados.slice(0, VISIBLES);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <EncabezadoPagina
        etiqueta="Búsqueda por foto"
        titulo="¿A cuál se parece el animal que viste?"
        descripcion="Sube una foto y te mostramos los casos de mascotas perdidas más parecidos, de mayor a menor semejanza."
      />

      <Tarjeta className="space-y-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-borde bg-fondo text-suave transition hover:border-acento hover:text-acento sm:w-48"
            aria-label={vista ? 'Cambiar la foto' : 'Elegir una foto'}
          >
            {vista ? (
              <img src={vista} alt="Foto que elegiste" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs">
                <IconoFoto tamano={28} />
                Elegir foto
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1 space-y-3">
            <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={elegir} />
            <Selector etiqueta="Especie" opcional value={especie} onChange={(e) => setEspecie(e.target.value)} ayuda="Si la sabes, reduce los resultados a esa especie.">
              <option value="">Todas</option>
              {Object.entries(ETIQUETA_ESPECIE).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </Selector>
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" onClick={() => entrada.current?.click()} disabled={fase === 'comparando'}>
                {archivo ? 'Cambiar foto' : 'Elegir foto'}
              </Boton>
              <Boton onClick={() => void buscar()} disabled={!archivo} cargando={fase === 'comparando'} icono={<IconoRadar tamano={16} />}>
                Buscar parecidos
              </Boton>
            </div>
            <p className="text-xs text-suave">La foto se compara en tu celular: no se sube ni se guarda. JPG, PNG o WEBP, máximo 5 MB.</p>
          </div>
        </div>
        {error && <Aviso tipo="alerta">{error}</Aviso>}
      </Tarjeta>

      {fase === 'comparando' && <Cargando texto={`Comparando con ${avance.total} casos… ${avance.hechos}/${avance.total}`} />}

      {fase === 'listo' && (
        <section className="space-y-3" aria-live="polite">
          <Aviso tipo="aviso" titulo="Es una comparación aproximada">
            Medimos qué tanto se parecen los colores y la distribución de luz de las fotos. No identifica al animal: abre cada ficha y confirma con los
            datos del caso.
          </Aviso>

          {resultados.length === 0 ? (
            <Vacio titulo="No hay casos con foto para comparar">
              {sinLeer > 0
                ? `Hay ${sinLeer} casos, pero no pudimos leer sus fotos desde aquí.`
                : 'Ahora mismo no hay casos de pérdida abiertos con esa especie.'}{' '}
              Puedes revisar la lista completa en Buscar.
            </Vacio>
          ) : (
            <>
              <p className="text-xs text-suave">
                {resultados.length} {resultados.length === 1 ? 'caso comparado' : 'casos comparados'}, del más al menos parecido
                {sinLeer > 0 ? ` · ${sinLeer} sin poder leer su foto` : ''}.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {mostrados.map(({ caso, puntaje }) => (
                  <div key={caso.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Insignia tono={nivelDe(puntaje) === 'ALTA' ? 'acento' : nivelDe(puntaje) === 'MEDIA' ? 'aviso' : 'neutro'}>
                        {ETIQUETA_NIVEL[nivelDe(puntaje)]}
                      </Insignia>
                      <span className="font-mono text-xs font-semibold text-tinta">{puntaje}% de semejanza</span>
                    </div>
                    <TarjetaCaso caso={caso} />
                  </div>
                ))}
              </div>
              {!verTodos && resultados.length > VISIBLES && (
                <Boton variante="secundario" ancho onClick={() => setVerTodos(true)}>
                  Ver los {resultados.length - VISIBLES} restantes
                </Boton>
              )}
            </>
          )}

          <Tarjeta className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-suave">¿Ninguno es? Deja un reporte y el motor avisará al dueño cuando aparezca su caso.</p>
            <BotonEnlace to="/reportar" variante="secundario">
              Reportar al animal
            </BotonEnlace>
          </Tarjeta>
        </section>
      )}
    </div>
  );
}
