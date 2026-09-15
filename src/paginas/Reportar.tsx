import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../componentes/Campo';
import { FormularioPerfil } from '../componentes/FormularioPerfil';
import { IconoRadar } from '../componentes/Iconos';
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

const pantalla1 = reporteSchema.pick({ foto_url: true, especie: true, punto: true, ocurrido_en: true, estado_animal: true });

/** Reporte de hallazgo o avistamiento: 2 pantallas como máximo (HU D). */
export function Reportar() {
  const { usuario, cargando } = useSesion();
  const [params] = useSearchParams();
  const casoRef = params.get('caso');

  const [paso, setPaso] = useState<1 | 2>(1);
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
    const r = pantalla1.safeParse(datos());
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setPaso(2);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = reporteSchema.safeParse(datos());
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      setPaso(1);
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
          <BotonEnlace to="/panel" variante="secundario">
            Ir a mi panel
          </BotonEnlace>
          {casoReferido && <BotonEnlace to={`/caso/${casoReferido.id}`}>Volver al caso</BotonEnlace>}
        </div>
      </div>
    );
  }

  if (cargando) return <Cargando texto="Cargando…" />;

  if (!usuario) {
    return (
      <div className="mx-auto max-w-lg">
        <EncabezadoPagina
          etiqueta="Reporte sin cuenta"
          titulo="Reportar un animal encontrado o avistado"
          descripcion="No necesitas crear una cuenta. Déjanos tu nombre y un teléfono para que el dueño pueda coordinar la entrega."
        />
        {casoReferido && (
          <Aviso tipo="info" className="mb-4">
            Aportarás un avistamiento al caso de <strong>{casoReferido.mascota_nombre}</strong>.
          </Aviso>
        )}
        <Tarjeta className="space-y-4 p-5">
          <FormularioPerfil rol="CIUDADANO" textoBoton="Continuar" />
          <p className="text-center text-sm text-suave">
            ¿Eres el dueño o un auxiliar veterinario?{' '}
            <Link to={`/entrar?volver=${encodeURIComponent('/reportar' + (casoRef ? `?caso=${casoRef}` : ''))}`} className="font-semibold text-acento hover:underline">
              Elige otro perfil
            </Link>
          </p>
        </Tarjeta>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina
        etiqueta={`Paso ${paso} de 2`}
        titulo="Reportar un animal encontrado o avistado"
        descripcion="Solo lo esencial: una foto, la especie, dónde y cuándo lo viste y cómo está."
      />
      {casoReferido && (
        <Aviso tipo="info" className="mb-4">
          Aportarás un avistamiento al caso de <strong>{casoReferido.mascota_nombre}</strong>. Quedará registrado en su historial.
        </Aviso>
      )}
      <div className="mb-4 flex gap-2" aria-hidden="true">
        <span className={`h-1.5 flex-1 rounded-full ${paso >= 1 ? 'bg-acento' : 'bg-borde'}`} />
        <span className={`h-1.5 flex-1 rounded-full ${paso >= 2 ? 'bg-acento' : 'bg-borde'}`} />
      </div>

      {paso === 1 ? (
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
      ) : (
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
            <Boton variante="secundario" onClick={() => setPaso(1)} disabled={enviando}>
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
