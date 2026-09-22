import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../componentes/Campo';
import { FormularioPerfil } from '../componentes/FormularioPerfil';
import { IconoPata, IconoRadar } from '../componentes/Iconos';
import { SelectorUbicacion } from '../componentes/Mapa';
import { SubirFotos } from '../componentes/SubirFotos';
import { TarjetaCaso } from '../componentes/TarjetaCaso';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { ejecutarCrucesDeReporte, type ResultadoCruceReporte } from '../lib/cruces';
import { registrarEvento } from '../lib/eventos';
import { distanciaKm, formatearDistancia, type Punto } from '../lib/geo';
import { describirMotivos } from '../lib/matching';
import { mensajeError, supabase } from '../lib/supabase';
import { aInputFechaLocal, erroresPorCampo, reporteSchema } from '../lib/validacion';
import {
  COLORES,
  ETIQUETA_ESPECIE,
  ETIQUETA_ESTADO_ANIMAL,
  ETIQUETA_SEXO,
  ETIQUETA_TAMANO,
  type CasoPublico,
  type Reporte,
} from '../tipos/tipos';

const pantallaMascota = reporteSchema.pick({ foto_url: true, especie: true, punto: true, ocurrido_en: true, estado_animal: true });

type Paso = 1 | 2 | 3;
const TITULOS: Record<Paso, string> = { 1: 'Tus datos', 2: 'Datos de la mascota', 3: 'Rasgos (opcional)' };

/**
 * Reporte de hallazgo o avistamiento en 3 pasos (HU D).
 *
 * El paso 1 recoge los datos de quien reporta y abre la sesión por detrás: es
 * obligatorio que vaya primero porque la foto se sube a la carpeta del usuario
 * (política "fotos: subir en carpeta propia") y el reporte exige autor_id = auth.uid().
 * Nunca se le pide a nadie crear una cuenta ni una contraseña.
 */
export function Reportar() {
  const { usuario, cargando } = useSesion();
  const [params] = useSearchParams();
  const casoRef = params.get('caso');

  // Antes del formulario se ofrece reconocer al animal entre los que ya están
  // reportados como perdidos: es lo primero que haría cualquiera con el animal
  // delante. Quien llega con ?caso=… se salta la galería.
  const [fase, setFase] = useState<'eligiendo' | 'formulario'>(casoRef ? 'formulario' : 'eligiendo');
  const [perdidas, setPerdidas] = useState<CasoPublico[]>([]);
  const [cargandoPerdidas, setCargandoPerdidas] = useState(true);

  // Siempre se arranca en el paso 1: los datos de quien reporta se piden en
  // cada reporte, aunque el navegador ya tenga una sesión abierta.
  const [paso, setPaso] = useState<Paso>(1);
  const [fotos, setFotos] = useState<string[]>([]);
  const [especie, setEspecie] = useState('');
  const [punto, setPunto] = useState<Punto | null>(null);
  const [fecha, setFecha] = useState(aInputFechaLocal(new Date()));
  const [estadoAnimal, setEstadoAnimal] = useState('');
  const [raza, setRaza] = useState('');
  const [color, setColor] = useState('');
  const [tamano, setTamano] = useState('');
  const [sexo, setSexo] = useState('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCruceReporte | null>(null);
  const [casoReferido, setCasoReferido] = useState<CasoPublico | null>(null);
  const ahoraMax = useMemo(() => aInputFechaLocal(new Date()), []);

  useEffect(() => {
    if (fase !== 'eligiendo') return;
    let activo = true;
    supabase
      .from('casos_publicos')
      .select('*')
      .eq('tipo', 'PERDIDA')
      .in('estado', ['ABIERTO', 'EN_VERIFICACION'])
      .order('creado_en', { ascending: false })
      .limit(24)
      .then(({ data }) => {
        if (!activo) return;
        setPerdidas((data as CasoPublico[] | null) ?? []);
        setCargandoPerdidas(false);
      });
    return () => {
      activo = false;
    };
  }, [fase]);

  useEffect(() => {
    if (!casoRef) return;
    let activo = true;
    supabase
      .from('casos_publicos')
      .select('*')
      .eq('id', casoRef)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo || !data) return;
        const c = data as CasoPublico;
        setCasoReferido(c);
        if (c.especie) setEspecie(c.especie);
      });
    return () => {
      activo = false;
    };
  }, [casoRef]);

  const datos = () => ({
    foto_url: fotos[0] ?? '',
    especie,
    punto,
    ocurrido_en: fecha,
    estado_animal: estadoAnimal,
    raza,
    color,
    tamano,
    sexo,
    nota,
  });

  const continuar = (e: FormEvent) => {
    e.preventDefault();
    const r = pantallaMascota.safeParse(datos());
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setPaso(3);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = reporteSchema.safeParse(datos());
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      setPaso(2);
      return;
    }
    if (!usuario) return;
    setEnviando(true);
    const { data, error } = await supabase
      .from('reportes')
      .insert({
        autor_id: usuario.id,
        especie: r.data.especie,
        raza: r.data.raza || null,
        color: r.data.color || null,
        tamano: r.data.tamano || null,
        sexo: r.data.sexo || null,
        estado_animal: r.data.estado_animal,
        lat: r.data.punto.lat,
        lng: r.data.punto.lng,
        ocurrido_en: new Date(r.data.ocurrido_en).toISOString(),
        nota: r.data.nota || null,
        foto_url: r.data.foto_url,
      })
      .select('*')
      .single();
    if (error || !data) {
      setEnviando(false);
      setErrorGeneral(mensajeError(error));
      return;
    }
    const reporte = data as Reporte;
    try {
      if (casoReferido) {
        const km = distanciaKm({ lat: casoReferido.lat_publica, lng: casoReferido.lng_publica }, reporte);
        await registrarEvento(
          casoReferido.id,
          'AVISTAMIENTO',
          `Nuevo reporte ciudadano (${ETIQUETA_ESTADO_ANIMAL[reporte.estado_animal].toLowerCase()}) a unos ${formatearDistancia(km)} de la zona del caso.`,
          usuario.id,
        );
      }
      setResultado(await ejecutarCrucesDeReporte(reporte));
    } catch (err) {
      setErrorGeneral(`Tu reporte se publicó, pero no pudimos calcular coincidencias: ${mensajeError(err)}`);
      setResultado({ resultados: [], nuevas: 0 });
    }
    setEnviando(false);
  };

  if (resultado) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Aviso tipo="exito" titulo="¡Gracias! Tu reporte fue publicado">
          Lo cruzamos con los casos de pérdida abiertos. {resultado.nuevas > 0 && `Avisamos a ${resultado.nuevas} ${resultado.nuevas === 1 ? 'dueño' : 'dueños'}.`}
        </Aviso>
        {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
        <Tarjeta className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <IconoRadar className="text-acento" />
            <h2 className="text-base font-bold">Casos de pérdida parecidos: {resultado.resultados.length}</h2>
          </div>
          {resultado.resultados.length === 0 ? (
            <Vacio titulo="No encontramos casos parecidos por ahora">Si un dueño reporta la pérdida más tarde, el cruce retroactivo encontrará tu reporte.</Vacio>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {resultado.resultados.map((x) => (
                <div key={x.casoId} className="space-y-1">
                  <TarjetaCaso caso={x.caso} extra={`Puntaje ${x.puntaje}/100 · ${describirMotivos(x.motivos)}`} />
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
        <div className="flex flex-wrap justify-end gap-2">
          <BotonEnlace to="/" variante="secundario">
            Volver al inicio
          </BotonEnlace>
          {casoReferido && <BotonEnlace to={`/caso/${casoReferido.id}`}>Volver al caso</BotonEnlace>}
        </div>
      </div>
    );
  }

  if (cargando) return <Cargando texto="Cargando…" />;

  if (fase === 'eligiendo') {
    const elegir = (c: CasoPublico | null) => {
      setCasoReferido(c);
      if (c?.especie) setEspecie(c.especie);
      setFase('formulario');
    };
    return (
      <div className="mx-auto max-w-3xl">
        <EncabezadoPagina
          titulo="¿Reconoces al animal que encontraste?"
          descripcion="Estas son las mascotas que sus dueños están buscando ahora mismo. Si es una de ellas, avisamos directo a su dueño."
        />
        {cargandoPerdidas ? (
          <Cargando />
        ) : perdidas.length === 0 ? (
          <Aviso tipo="info" className="mb-4">
            Ahora mismo no hay mascotas reportadas como perdidas. Describe al animal que encontraste y lo cruzaremos con lo que llegue después.
          </Aviso>
        ) : (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {perdidas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => elegir(c)}
                className="overflow-hidden rounded-xl border border-borde bg-white text-left shadow-tarjeta transition hover:-translate-y-0.5 hover:border-acento"
              >
                <div className="aspect-square bg-fondo">
                  {c.foto_url ? (
                    <img src={c.foto_url} alt={c.mascota_nombre ?? 'Mascota'} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-suave">
                      <IconoPata tamano={28} />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-sm font-bold">{c.mascota_nombre ?? 'Sin nombre'}</p>
                  <p className="truncate text-[11px] text-suave">{[c.raza, c.color_principal].filter(Boolean).join(' · ')}</p>
                  <p className="truncate text-[11px] text-suave">{c.direccion_texto || 'Zona aproximada'}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <Boton ancho tamano="lg" variante={perdidas.length === 0 ? 'primario' : 'secundario'} onClick={() => elegir(null)}>
          No es ninguna de estas — describir al animal
        </Boton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        etiqueta={`Paso ${paso} de 3 · ${TITULOS[paso]}`}
        titulo="Reportar un animal encontrado o avistado"
        descripcion="No necesitas crear una cuenta ni contraseña. Son tres pasos cortos."
      />
      {casoReferido && (
        <Aviso tipo="info" className="mb-4">
          Aportarás un avistamiento al caso de <strong>{casoReferido.mascota_nombre}</strong>. Quedará registrado en su historial.
        </Aviso>
      )}
      <div className="mb-4 flex gap-2" aria-hidden="true">
        {([1, 2, 3] as Paso[]).map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${paso >= n ? 'bg-acento' : 'bg-borde'}`} />
        ))}
      </div>

      {/* ---------- Paso 1 · quién reporta ---------- */}
      {paso === 1 && (
        <Tarjeta className="space-y-4 p-5">
          <div className="space-y-1">
            <EtiquetaSeccion>Tus datos</EtiquetaSeccion>
            <p className="text-sm text-suave">
              Necesitamos saber a quién escribirle si este animal resulta ser la mascota de alguien. Tu teléfono no se muestra en público: solo lo ve
              la otra parte cuando se supera la verificación.
            </p>
          </div>
          <FormularioPerfil rol="CIUDADANO" textoBoton="Continuar" onListo={() => setPaso(2)} />
        </Tarjeta>
      )}

      {/* ---------- Paso 2 · la mascota ---------- */}
      {paso === 2 && usuario && (
        <form onSubmit={continuar} className="space-y-4" noValidate>
          <Tarjeta className="space-y-3 p-5">
            <EtiquetaSeccion>Foto del animal</EtiquetaSeccion>
            <SubirFotos urls={fotos} onCambio={setFotos} usuarioId={usuario.id} carpeta="reportes" maximo={1} error={errores.foto_url} />
          </Tarjeta>
          <Tarjeta className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Selector etiqueta="Especie" value={especie} onChange={(e) => setEspecie(e.target.value)} error={errores.especie}>
                <option value="">Selecciona…</option>
                {Object.entries(ETIQUETA_ESPECIE).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </Selector>
              <Campo
                etiqueta="¿Cuándo lo viste?"
                type="datetime-local"
                value={fecha}
                max={ahoraMax}
                onChange={(e) => setFecha(e.target.value)}
                error={errores.ocurrido_en}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold">Estado del animal</legend>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ETIQUETA_ESTADO_ANIMAL).map(([v, t]) => (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      estadoAnimal === v ? 'border-acento bg-acento-claro font-semibold text-acento' : 'border-borde bg-white'
                    }`}
                  >
                    <input type="radio" name="estado_animal" value={v} checked={estadoAnimal === v} onChange={() => setEstadoAnimal(v)} className="accent-teal-700" />
                    {t}
                  </label>
                ))}
              </div>
              {errores.estado_animal && <p className="text-xs font-medium text-alerta">{errores.estado_animal}</p>}
            </fieldset>
          </Tarjeta>
          <Tarjeta className="space-y-3 p-5">
            <EtiquetaSeccion>¿Dónde lo viste?</EtiquetaSeccion>
            <SelectorUbicacion valor={punto} onCambio={setPunto} error={errores.punto} alto={240} />
          </Tarjeta>
          <Boton type="submit" ancho tamano="lg">
            Continuar
          </Boton>
        </form>
      )}

      {/* ---------- Paso 3 · rasgos opcionales ---------- */}
      {paso === 3 && (
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Tarjeta className="space-y-4 p-5">
            <p className="text-sm text-suave">Estos datos son opcionales, pero mejoran el cruce con los casos de pérdida.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Raza" opcional value={raza} onChange={(e) => setRaza(e.target.value)} error={errores.raza} placeholder="Si no sabes, déjalo vacío" />
              <Selector etiqueta="Color" opcional value={color} onChange={(e) => setColor(e.target.value)}>
                <option value="">No sé</option>
                {COLORES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selector>
              <Selector etiqueta="Tamaño" opcional value={tamano} onChange={(e) => setTamano(e.target.value)}>
                <option value="">No sé</option>
                {Object.entries(ETIQUETA_TAMANO).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </Selector>
              <Selector etiqueta="Sexo" opcional value={sexo} onChange={(e) => setSexo(e.target.value)}>
                <option value="">No sé</option>
                {Object.entries(ETIQUETA_SEXO).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </Selector>
            </div>
            <AreaTexto etiqueta="Nota" opcional maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} error={errores.nota} placeholder="Collar, heridas, hacia dónde fue…" />
          </Tarjeta>
          {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
          <div className="grid grid-cols-2 gap-2">
            <Boton variante="secundario" onClick={() => setPaso(2)} disabled={enviando}>
              Atrás
            </Boton>
            <Boton type="submit" cargando={enviando}>
              Enviar reporte
            </Boton>
          </div>
        </form>
      )}
    </div>
  );
}
