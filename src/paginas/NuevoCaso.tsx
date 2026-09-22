import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../componentes/Campo';
import { FormularioPerfil } from '../componentes/FormularioPerfil';
import { IconoCandado, IconoRadar } from '../componentes/Iconos';
import { SelectorUbicacion } from '../componentes/Mapa';
import { SubirFotos } from '../componentes/SubirFotos';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { ejecutarCrucesDeCaso, type ResultadoCruceCaso } from '../lib/cruces';
import { formatearFecha } from '../lib/formato';
import type { Punto } from '../lib/geo';
import { describirMotivos } from '../lib/matching';
import { mensajeError, supabase } from '../lib/supabase';
import { aInputFechaLocal, casoPerdidaSchema, erroresPorCampo, mascotaSchema } from '../lib/validacion';
import {
  COLORES,
  ETIQUETA_ESPECIE,
  ETIQUETA_ESTADO_ANIMAL,
  ETIQUETA_SEXO,
  ETIQUETA_TAMANO,
  ETIQUETA_TEMPERAMENTO,
  type Mascota,
} from '../tipos/tipos';

const MASCOTA_VACIA = {
  nombre: '',
  especie: '',
  raza: '',
  color_principal: '',
  tamano: '',
  sexo: 'DESCONOCIDO',
  microchip: '',
  temperamento: 'TRANQUILA',
  nota_manejo: '',
};

const EJEMPLOS = [
  '¿Cómo se llama su juguete favorito?',
  '¿En qué parte del cuerpo tiene una cicatriz o marca?',
  '¿Qué palabra o sonido la hace venir corriendo?',
];

/**
 * Reportar una mascota perdida, de corrido (historia C).
 *
 * Antes eran tres pantallas encadenadas —perfil, registrar mascota, crear el
 * caso— y quien llegaba sin sesión chocaba con una puerta. Ahora es un solo
 * asistente: la mascota se registra aquí mismo si hace falta.
 */
export function NuevoCaso() {
  const { usuario } = useSesion();
  const [params] = useSearchParams();

  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [conCaso, setConCaso] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);

  // null = mascota nueva; si no, el id de una ya registrada
  const [mascotaId, setMascotaId] = useState<string | null>(params.get('mascota'));
  const [nueva, setNueva] = useState(MASCOTA_VACIA);
  const [fotos, setFotos] = useState<string[]>([]);
  const [reservados, setReservados] = useState([
    { pregunta: '', respuesta: '' },
    { pregunta: '', respuesta: '' },
    { pregunta: '', respuesta: '' },
  ]);

  const [punto, setPunto] = useState<Punto | null>(null);
  const [fecha, setFecha] = useState(aInputFechaLocal(new Date()));
  const [zona, setZona] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [radio, setRadio] = useState(5);

  // Paso 0 = tus datos. Se pide siempre, aunque ya haya sesión: el navegador
  // puede ser de otra persona y el caso saldría a nombre del anterior.
  const [paso, setPaso] = useState<0 | 1 | 2>(0);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ casoId: string; cruce: ResultadoCruceCaso | null; errorCruce?: string } | null>(null);

  const ahoraMax = useMemo(() => aInputFechaLocal(new Date()), []);
  const haceUnAno = useMemo(() => aInputFechaLocal(new Date(Date.now() - 365 * 86_400_000)), []);

  useEffect(() => {
    if (!usuario) {
      setCargando(false);
      return;
    }
    let activo = true;
    Promise.all([
      supabase.from('mascotas').select('*').eq('propietario_id', usuario.id).order('nombre'),
      supabase
        .from('casos_publicos')
        .select('mascota_id')
        .eq('creador_id', usuario.id)
        .eq('tipo', 'PERDIDA')
        .in('estado', ['ABIERTO', 'EN_VERIFICACION']),
    ]).then(([m, c]) => {
      if (!activo) return;
      setMascotas((m.data as Mascota[] | null) ?? []);
      setConCaso(new Set(((c.data as { mascota_id: string }[] | null) ?? []).map((x) => x.mascota_id)));
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [usuario]);

  const cambiarMascota = (campo: keyof typeof MASCOTA_VACIA, valor: string) => setNueva((d) => ({ ...d, [campo]: valor }));
  const cambiarReservado = (i: number, campo: 'pregunta' | 'respuesta', valor: string) =>
    setReservados((l) => l.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));

  const esNueva = mascotaId === null;

  const validarMascota = () => {
    if (!esNueva) {
      if (conCaso.has(mascotaId!)) {
        setErrores({ mascota_id: 'Esa mascota ya tiene un caso de pérdida abierto.' });
        return false;
      }
      setErrores({});
      return true;
    }
    const r = mascotaSchema.safeParse({ ...nueva, fotos, reservados });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      setErrorGeneral('Revisa los campos marcados en rojo.');
      return false;
    }
    setErrores({});
    setErrorGeneral(null);
    return true;
  };

  const continuar = (e: FormEvent) => {
    e.preventDefault();
    if (validarMascota()) setPaso(2);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = casoPerdidaSchema
      .omit({ mascota_id: true })
      .safeParse({ punto, ocurrido_en: fecha, direccion_texto: zona, descripcion, radio_km: radio });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setEnviando(true);

    let idMascota = mascotaId;
    try {
      if (esNueva) {
        const m = mascotaSchema.parse({ ...nueva, fotos, reservados });
        const { fotos: urls, reservados: res, ...datos } = m;
        const { data, error } = await supabase.rpc('guardar_mascota', {
          p_id: null,
          p_mascota: { ...datos, microchip: datos.microchip || null },
          p_fotos: urls.map((url, i) => ({ url, es_principal: i === 0 })),
          p_reservados: res,
        });
        if (error) throw error;
        idMascota = data as string;
      }

      const { data: caso, error: errCaso } = await supabase
        .from('casos')
        .insert({
          mascota_id: idMascota,
          creador_id: usuario!.id,
          tipo: 'PERDIDA',
          lat: r.data.punto.lat,
          lng: r.data.punto.lng,
          direccion_texto: r.data.direccion_texto || null,
          ocurrido_en: new Date(r.data.ocurrido_en).toISOString(),
          descripcion: r.data.descripcion,
          radio_km: r.data.radio_km,
        })
        .select('id')
        .single();
      if (errCaso || !caso) throw errCaso;

      const casoId = (caso as { id: string }).id;
      try {
        setResultado({ casoId, cruce: await ejecutarCrucesDeCaso(casoId) });
      } catch (err) {
        setResultado({ casoId, cruce: null, errorCruce: mensajeError(err) });
      }
    } catch (err) {
      setErrorGeneral(mensajeError(err));
      setPaso(1);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <Cargando />;

  if (resultado) {
    const lista = resultado.cruce?.resultados ?? [];
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Aviso tipo="exito" titulo="Caso publicado">
          Ya está en línea con una ubicación aproximada (±300 m). El motor revisó los reportes de los últimos 90 días.
        </Aviso>
        {resultado.errorCruce && <Aviso tipo="alerta">No se pudieron calcular las coincidencias: {resultado.errorCruce}</Aviso>}
        <Tarjeta className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <IconoRadar className="text-acento" />
            <h2 className="text-base font-bold">Coincidencias encontradas: {lista.length}</h2>
          </div>
          {lista.length === 0 ? (
            <Vacio titulo="Aún no hay reportes parecidos">Te avisaremos en cuanto alguien reporte un animal que coincida.</Vacio>
          ) : (
            <ul className="space-y-2">
              {lista.map((x) => (
                <li key={x.reporteId} className="flex gap-3 rounded-lg border border-borde p-2">
                  <img src={x.reporte.foto_url} alt="Reporte" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold">{x.puntaje}</span>
                      <span className="text-xs text-suave">/100</span>
                      {x.retroactiva && <Insignia tono="info">Retroactiva</Insignia>}
                      <Insignia>{ETIQUETA_ESTADO_ANIMAL[x.reporte.estado_animal]}</Insignia>
                    </div>
                    <p className="text-sm">{describirMotivos(x.motivos)}</p>
                    <p className="text-xs text-suave">{formatearFecha(x.reporte.ocurrido_en)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <div className="flex justify-end">
          <BotonEnlace to={`/caso/${resultado.casoId}`}>Ir a la ficha del caso</BotonEnlace>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        etiqueta={`Paso ${paso + 1} de 3 · ${paso === 0 ? 'Tus datos' : paso === 1 ? 'Tu mascota' : 'Dónde se perdió'}`}
        titulo="Reportar mascota perdida"
      />
      <div className="mb-4 flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${paso >= n ? 'bg-acento' : 'bg-borde'}`} />
        ))}
      </div>

      {paso === 0 ? (
        <Tarjeta className="space-y-4 p-5">
          <div className="space-y-1">
            <EtiquetaSeccion>Tus datos</EtiquetaSeccion>
            <p className="text-sm text-suave">
              Para que quien encuentre a tu mascota sepa a quién avisar. Sin cuenta ni contraseña.
            </p>
          </div>
          <FormularioPerfil
            rol="PROPIETARIO"
            pedirBarrio
            textoBoton="Continuar"
            onListo={({ barrio }) => {
              setZona(barrio);
              setPaso(1);
            }}
          />
        </Tarjeta>
      ) : paso === 1 ? (
        <form onSubmit={continuar} className="space-y-5" noValidate>
          {mascotas.length > 0 && (
            <Tarjeta className="space-y-3 p-5">
              <EtiquetaSeccion>¿Cuál se perdió?</EtiquetaSeccion>
              <div className="grid gap-2 sm:grid-cols-2">
                {mascotas.map((m) => {
                  const bloqueada = conCaso.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={bloqueada}
                      onClick={() => setMascotaId(m.id)}
                      className={`rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${
                        mascotaId === m.id ? 'border-acento bg-acento-claro font-semibold text-acento' : 'border-borde bg-white'
                      }`}
                    >
                      {m.nombre}
                      <span className="block text-xs font-normal text-suave">
                        {bloqueada ? 'Ya tiene un caso abierto' : [ETIQUETA_ESPECIE[m.especie], m.color_principal].join(' · ')}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setMascotaId(null)}
                  className={`rounded-lg border border-dashed p-3 text-left text-sm ${
                    esNueva ? 'border-acento bg-acento-claro font-semibold text-acento' : 'border-borde bg-white'
                  }`}
                >
                  Es otra mascota
                  <span className="block text-xs font-normal text-suave">La registro ahora</span>
                </button>
              </div>
              {errores.mascota_id && <p className="text-xs font-medium text-alerta">{errores.mascota_id}</p>}
            </Tarjeta>
          )}

          {esNueva && (
            <>
              <Tarjeta className="space-y-4 p-5">
                <EtiquetaSeccion>Datos de la mascota</EtiquetaSeccion>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Nombre" value={nueva.nombre} onChange={(e) => cambiarMascota('nombre', e.target.value)} error={errores.nombre} />
                  <Selector etiqueta="Especie" value={nueva.especie} onChange={(e) => cambiarMascota('especie', e.target.value)} error={errores.especie}>
                    <option value="">Selecciona…</option>
                    {Object.entries(ETIQUETA_ESPECIE).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </Selector>
                  <Campo etiqueta="Raza" opcional value={nueva.raza} onChange={(e) => cambiarMascota('raza', e.target.value)} error={errores.raza} placeholder="Ej. Mestizo" />
                  <Selector
                    etiqueta="Color principal"
                    value={nueva.color_principal}
                    onChange={(e) => cambiarMascota('color_principal', e.target.value)}
                    error={errores.color_principal}
                  >
                    <option value="">Selecciona…</option>
                    {COLORES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Selector>
                  <Selector etiqueta="Tamaño" value={nueva.tamano} onChange={(e) => cambiarMascota('tamano', e.target.value)} error={errores.tamano}>
                    <option value="">Selecciona…</option>
                    {Object.entries(ETIQUETA_TAMANO).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </Selector>
                  <Selector etiqueta="Sexo" value={nueva.sexo} onChange={(e) => cambiarMascota('sexo', e.target.value)}>
                    {Object.entries(ETIQUETA_SEXO).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </Selector>
                  <Campo
                    etiqueta="Microchip"
                    opcional
                    inputMode="numeric"
                    maxLength={15}
                    value={nueva.microchip}
                    onChange={(e) => cambiarMascota('microchip', e.target.value.replace(/\D/g, ''))}
                    error={errores.microchip}
                    className="font-mono"
                  />
                  <Selector etiqueta="Temperamento" value={nueva.temperamento} onChange={(e) => cambiarMascota('temperamento', e.target.value)}>
                    {Object.entries(ETIQUETA_TEMPERAMENTO).map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </Selector>
                </div>
                <AreaTexto
                  etiqueta="Nota de manejo"
                  opcional={nueva.temperamento !== 'HURANA' && nueva.temperamento !== 'PUEDE_MORDER'}
                  maxLength={300}
                  value={nueva.nota_manejo}
                  onChange={(e) => cambiarMascota('nota_manejo', e.target.value)}
                  error={errores.nota_manejo}
                  ayuda="Cómo acercarse. Si es huraña o puede morder, la ficha lo mostrará destacado."
                />
              </Tarjeta>

              <Tarjeta className="space-y-3 p-5">
                <EtiquetaSeccion>Fotos (1 a 6)</EtiquetaSeccion>
                <SubirFotos urls={fotos} onCambio={setFotos} usuarioId={usuario!.id} carpeta="mascotas" maximo={6} error={errores.fotos} />
              </Tarjeta>

              <Tarjeta className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <IconoCandado tamano={16} className="text-acento" />
                  <EtiquetaSeccion>3 datos que solo tú sabes</EtiquetaSeccion>
                </div>
                <Aviso tipo="aviso">
                  Sirven para comprobar que eres el dueño si alguien la encuentra. Nada que se vea en la ficha: ni color, ni raza, ni nombre.
                </Aviso>
                {errores.reservados && <Aviso tipo="alerta">{errores.reservados}</Aviso>}
                {reservados.map((r, i) => (
                  <div key={i} className="grid gap-3 rounded-lg border border-borde bg-fondo/50 p-3 sm:grid-cols-2">
                    <Campo
                      etiqueta={`Pregunta ${i + 1}`}
                      value={r.pregunta}
                      onChange={(e) => cambiarReservado(i, 'pregunta', e.target.value)}
                      error={errores[`reservados.${i}.pregunta`]}
                      placeholder={EJEMPLOS[i]}
                    />
                    <Campo
                      etiqueta={`Respuesta ${i + 1}`}
                      value={r.respuesta}
                      onChange={(e) => cambiarReservado(i, 'respuesta', e.target.value)}
                      error={errores[`reservados.${i}.respuesta`]}
                      autoComplete="off"
                    />
                  </div>
                ))}
              </Tarjeta>
            </>
          )}

          {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
          <Boton type="submit" ancho tamano="lg">
            Continuar
          </Boton>
        </form>
      ) : (
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <Tarjeta className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="¿Cuándo se perdió?"
                type="datetime-local"
                value={fecha}
                max={ahoraMax}
                min={haceUnAno}
                onChange={(e) => setFecha(e.target.value)}
                error={errores.ocurrido_en}
              />
              <Selector etiqueta="Radio de búsqueda" value={radio} onChange={(e) => setRadio(Number(e.target.value))} error={errores.radio_km}>
                {[1, 2, 3, 5, 10, 20].map((k) => (
                  <option key={k} value={k}>
                    {k} km
                  </option>
                ))}
              </Selector>
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-3 p-5">
            <EtiquetaSeccion>Última ubicación conocida</EtiquetaSeccion>
            <SelectorUbicacion valor={punto} onCambio={setPunto} error={errores.punto} radioKm={radio} />
            <p className="text-xs text-suave">El punto exacto solo lo ves tú: en público se muestra desplazado hasta 300 m.</p>
            <Campo
              etiqueta="Barrio o zona"
              opcional
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              error={errores.direccion_texto}
              placeholder="Ej. Parque Infantil, barrio Las Cuadras"
              ayuda="No escribas tu dirección exacta."
            />
          </Tarjeta>

          <Tarjeta className="p-5">
            <AreaTexto
              etiqueta="¿Cómo se perdió?"
              maxLength={1000}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              error={errores.descripcion}
              placeholder="¿Llevaba collar? ¿Hacia dónde pudo ir?"
            />
          </Tarjeta>

          {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
          <div className="grid grid-cols-2 gap-2">
            <Boton variante="secundario" onClick={() => setPaso(1)} disabled={enviando}>
              Atrás
            </Boton>
            <Boton type="submit" cargando={enviando}>
              Publicar caso
            </Boton>
          </div>
        </form>
      )}
    </div>
  );
}
