import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { Campo } from '../componentes/Campo';
import { IconoCheck, IconoEscudo, IconoImprimir, IconoInfo, IconoReloj, IconoX } from '../componentes/Iconos';
import { Aviso, Cargando, EtiquetaSeccion, InsigniaVerificacion, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { perfilesPublicos } from '../lib/eventos';
import { formatearFecha, idCorto } from '../lib/formato';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, preguntasVerificacionSchema } from '../lib/validacion';
import {
  ETIQUETA_ESPECIE,
  type CasoPublico,
  type PerfilPublico,
  type PreguntaVerificacion,
  type RespuestaVerif,
  type ResultadoIntento,
  type Verificacion as TVerificacion,
} from '../tipos/tipos';

interface Contacto {
  papel: string;
  nombre: string;
  telefono: string;
}

const PREGUNTAS_MINIMAS = 3;
const vacias = () => Array.from({ length: PREGUNTAS_MINIMAS }, () => ({ pregunta: '', respuesta: '' }));

/**
 * Verificación de propiedad (HU-03). Dos pantallas complementarias:
 * cada actor ve solo lo suyo.
 *
 *   · Quien encontró al animal: crea las preguntas (si la mascota no tiene
 *     datos reservados de su dueño) y después revisa y decide la entrega.
 *   · Quien reclama: responde sin ver jamás una respuesta correcta.
 *
 * Los datos de contacto aparecen únicamente con la entrega ya aprobada.
 */
export function Verificacion() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const [v, setV] = useState<TVerificacion | null>(null);
  const [caso, setCaso] = useState<CasoPublico | null>(null);
  const [preguntas, setPreguntas] = useState<PreguntaVerificacion[]>([]);
  const [respuestas, setRespuestas] = useState<RespuestaVerif[]>([]);
  const [partes, setPartes] = useState<Map<string, PerfilPublico>>(new Map());
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [nuevas, setNuevas] = useState(vacias);
  const [erroresNuevas, setErroresNuevas] = useState<Record<string, string>>({});
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [ultimo, setUltimo] = useState<ResultadoIntento | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<'preguntas' | 'responder' | 'aprobar' | 'rechazar' | null>(null);

  const cargar = useCallback(async () => {
    if (!id || !usuario) return;
    const { data } = await supabase.from('verificaciones').select('*').eq('id', id).maybeSingle();
    const ver = data as TVerificacion | null;
    if (!ver) {
      setEstado('noexiste');
      return;
    }
    setV(ver);
    const participante = usuario.id === ver.reclamante_id || usuario.id === ver.verificador_id;

    const [c, p, r, per] = await Promise.all([
      supabase.from('casos_publicos').select('*').eq('id', ver.caso_id).maybeSingle(),
      participante ? supabase.rpc('preguntas_verificacion', { p_verificacion: ver.id }) : Promise.resolve({ data: [] }),
      supabase.from('respuestas_verif').select('*').eq('verificacion_id', ver.id).order('intento', { ascending: false }),
      perfilesPublicos([ver.reclamante_id, ver.verificador_id]),
    ]);
    setCaso((c.data as CasoPublico | null) ?? null);
    setPreguntas((p.data as PreguntaVerificacion[] | null) ?? []);
    const todas = (r.data as RespuestaVerif[] | null) ?? [];
    const ultimas = todas.filter((x) => x.intento === ver.intentos);
    setRespuestas(ultimas);
    setMarcas((prev) => {
      const nuevo: Record<string, boolean> = {};
      ultimas.forEach((x) => {
        nuevo[x.id] = prev[x.id] ?? x.correcta ?? x.coincide_auto;
      });
      return nuevo;
    });
    setPartes(per);

    // Solo con la entrega aprobada. La propia RPC no los devuelve antes.
    if (participante && ver.estado === 'APROBADA') {
      const { data: cts } = await supabase.rpc('contactos_verificacion', { p_verificacion: ver.id });
      setContactos((cts as Contacto[] | null) ?? []);
    } else {
      setContactos([]);
    }
    setEstado('ok');
  }, [id, usuario]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (v?.estado !== 'PENDIENTE') return;
    const t = window.setInterval(() => void cargar(), 8000);
    return () => window.clearInterval(t);
  }, [v?.estado, cargar]);

  if (estado === 'cargando') return <Cargando texto="Cargando verificación…" />;
  if (estado === 'noexiste' || !v || !usuario) {
    return <Vacio titulo="Verificación no disponible">No existe o no participas en ella.</Vacio>;
  }

  const esReclamante = usuario.id === v.reclamante_id;
  const esVerificador = usuario.id === v.verificador_id;
  const pendiente = v.estado === 'PENDIENTE';
  const faltanPreguntas = preguntas.length === 0;
  const puedeCrearPreguntas = esVerificador && pendiente && faltanPreguntas && v.intentos === 0;
  const puedeResponder = esReclamante && pendiente && !faltanPreguntas && !v.superada && v.intentos < 3;
  const puedeResolver = esVerificador && pendiente && v.intentos > 0 && respuestas.length > 0;
  const reclamante = partes.get(v.reclamante_id);
  const verificador = partes.get(v.verificador_id);
  const claveDe = (r: RespuestaVerif) => r.pregunta_verif_id ?? r.dato_reservado_id ?? '';
  const textoPregunta = (r: RespuestaVerif) => preguntas.find((p) => p.id === claveDe(r))?.pregunta ?? 'Pregunta de seguridad';
  const acertadas = respuestas.filter((r) => r.correcta);

  const crearPreguntas = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = preguntasVerificacionSchema.safeParse(nuevas);
    if (!r.success) {
      setErroresNuevas(erroresPorCampo(r.error));
      return;
    }
    setErroresNuevas({});
    setEnviando('preguntas');
    const { error: err } = await supabase.rpc('crear_preguntas_verificacion', { p_verificacion: v.id, p_preguntas: r.data });
    setEnviando(null);
    if (err) {
      setError(mensajeError(err));
      return;
    }
    setNuevas(vacias);
    await cargar();
  };

  const responder = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (preguntas.some((p) => !borrador[p.id]?.trim())) {
      setError('Responde todas las preguntas antes de enviar.');
      return;
    }
    setEnviando('responder');
    const { data, error: err } = await supabase.rpc('verificar_respuestas', { p_verificacion: v.id, p_respuestas: borrador });
    setEnviando(null);
    if (err) {
      setError(mensajeError(err));
      return;
    }
    setUltimo(data as ResultadoIntento);
    setBorrador({});
    await cargar();
  };

  const resolver = async (aprobar: boolean) => {
    setError(null);
    setEnviando(aprobar ? 'aprobar' : 'rechazar');
    const { error: err } = await supabase.rpc('resolver_verificacion', { p_verificacion: v.id, p_marcas: marcas, p_aprobar: aprobar });
    setEnviando(null);
    if (err) {
      setError(mensajeError(err));
      return;
    }
    await cargar();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ---------- Cabecera común ---------- */}
      <Tarjeta className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-tinta px-2 py-1 font-mono text-[11px] text-white">Caso {idCorto(v.caso_id)}</span>
          <InsigniaVerificacion estado={v.estado} />
        </div>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Verificación de propiedad — {caso?.mascota_nombre ?? 'Mascota'}</h1>
        <p className="mt-1 text-sm text-suave">
          {caso?.especie ? `${ETIQUETA_ESPECIE[caso.especie]} · ` : ''}
          Reclama <strong className="text-tinta">{reclamante?.nombre ?? '—'}</strong> · Encontró al animal{' '}
          <strong className="text-tinta">{verificador?.nombre ?? '—'}</strong>
        </p>
        {pendiente && !faltanPreguntas && (
          <p className="mt-2 flex items-center gap-2 text-xs text-suave">
            <IconoEscudo tamano={14} className="text-acento" />
            Hay que acertar al menos 2 preguntas · intentos {v.intentos}/3
          </p>
        )}
      </Tarjeta>

      {v.estado === 'BLOQUEADA' && (
        <Aviso tipo="alerta" titulo="Verificación bloqueada">
          Se alcanzaron 3 intentos fallidos. No entregues al animal a esta persona.
        </Aviso>
      )}
      {v.estado === 'RECHAZADA' && <Aviso tipo="alerta" titulo="Entrega rechazada">Quien encontró al animal rechazó la entrega.</Aviso>}
      {error && <Aviso tipo="alerta">{error}</Aviso>}

      {/* ---------- Pantalla de quien encontró al animal ---------- */}
      {esVerificador && puedeCrearPreguntas && (
        <Tarjeta className="p-4 sm:p-5">
          <EtiquetaSeccion className="text-acento">Tu paso</EtiquetaSeccion>
          <h2 className="mt-1 text-base font-bold">Crea las preguntas de seguridad</h2>
          <p className="mt-1 text-sm text-suave">
            Esta mascota no tiene datos guardados por su dueño. Mira al animal que tienes delante y escribe {PREGUNTAS_MINIMAS} preguntas que solo su
            dueño sabría responder. Quien reclame no verá nunca tus respuestas.
          </p>
          <form onSubmit={crearPreguntas} className="mt-4 space-y-3">
            {nuevas.map((p, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-borde p-3">
                <Campo
                  etiqueta={`Pregunta ${i + 1}`}
                  value={p.pregunta}
                  maxLength={200}
                  onChange={(e) => setNuevas((l) => l.map((x, j) => (j === i ? { ...x, pregunta: e.target.value } : x)))}
                  error={erroresNuevas[`${i}.pregunta`]}
                  placeholder="¿Qué lleva en el collar?"
                />
                <Campo
                  etiqueta="Respuesta correcta"
                  value={p.respuesta}
                  maxLength={200}
                  onChange={(e) => setNuevas((l) => l.map((x, j) => (j === i ? { ...x, respuesta: e.target.value } : x)))}
                  error={erroresNuevas[`${i}.respuesta`]}
                  ayuda="No importan mayúsculas ni tildes."
                  placeholder="Una placa azul"
                />
              </div>
            ))}
            {erroresNuevas._ && <p className="text-xs font-medium text-alerta">{erroresNuevas._}</p>}
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" tamano="sm" onClick={() => setNuevas((l) => [...l, { pregunta: '', respuesta: '' }])}>
                Añadir otra pregunta
              </Boton>
              <Boton type="submit" cargando={enviando === 'preguntas'} icono={<IconoCheck tamano={16} />}>
                Guardar preguntas
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}

      {esVerificador && !puedeCrearPreguntas && (
        <Tarjeta className="p-4 sm:p-5">
          <EtiquetaSeccion className="text-acento">Tu paso</EtiquetaSeccion>
          <h2 className="mt-1 text-base font-bold">Revisa las respuestas y decide</h2>
          <p className="mt-1 mb-3 text-xs text-suave">
            Compara con lo que ves en el animal. “Registro” indica si coincide con la respuesta guardada, sin revelarla.
          </p>
          {respuestas.length === 0 ? (
            <Vacio icono={<IconoReloj />} titulo="Esperando las respuestas del reclamante" />
          ) : (
            <ul className="space-y-2">
              {respuestas.map((r) => (
                <li key={r.id} className="rounded-lg border border-borde p-3">
                  <p className="text-xs text-suave">{textoPregunta(r)}</p>
                  <p className="mt-0.5 text-sm font-semibold">“{r.respuesta_dada}”</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold ${r.coincide_auto ? 'text-acento' : 'text-alerta'}`}>
                      Registro: {r.coincide_auto ? 'coincide' : 'no coincide'}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={!puedeResolver}
                        onClick={() => setMarcas((m) => ({ ...m, [r.id]: true }))}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                          marcas[r.id] === true ? 'border-acento bg-acento text-white' : 'border-borde bg-white'
                        }`}
                      >
                        <IconoCheck tamano={12} /> Correcta
                      </button>
                      <button
                        type="button"
                        disabled={!puedeResolver}
                        onClick={() => setMarcas((m) => ({ ...m, [r.id]: false }))}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                          marcas[r.id] === false ? 'border-alerta bg-alerta text-white' : 'border-borde bg-white'
                        }`}
                      >
                        <IconoX tamano={12} /> Incorrecta
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {puedeResolver && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Boton variante="peligro" onClick={() => resolver(false)} cargando={enviando === 'rechazar'} disabled={Boolean(enviando)}>
                Rechazar
              </Boton>
              <Boton variante="acento" onClick={() => resolver(true)} cargando={enviando === 'aprobar'} disabled={Boolean(enviando)}>
                Aprobar entrega
              </Boton>
            </div>
          )}
        </Tarjeta>
      )}

      {/* ---------- Pantalla de quien reclama ---------- */}
      {esReclamante && (
        <Tarjeta className="p-4 sm:p-5">
          <EtiquetaSeccion className="text-acento">Tu paso</EtiquetaSeccion>
          <h2 className="mt-1 text-base font-bold">Responde las preguntas de seguridad</h2>
          {faltanPreguntas ? (
            <Vacio icono={<IconoReloj />} titulo="Las preguntas todavía no están listas">
              Quien encontró al animal las está preparando. Te avisamos en cuanto pueda responderlas.
            </Vacio>
          ) : v.superada && pendiente ? (
            <Aviso tipo="exito" titulo="Respuestas enviadas" className="mt-3">
              Superaste las preguntas. Quien encontró al animal revisará y decidirá la entrega.
            </Aviso>
          ) : (
            <>
              {ultimo && !ultimo.superada && ultimo.estado === 'PENDIENTE' && (
                <Aviso tipo="aviso" titulo={`Intento ${ultimo.intentos} de 3 no superado`} className="mt-3">
                  Acertaste {ultimo.aciertos} de {ultimo.total}. Te quedan {3 - ultimo.intentos}{' '}
                  {3 - ultimo.intentos === 1 ? 'intento' : 'intentos'}.
                </Aviso>
              )}
              <form onSubmit={responder} className="mt-3 space-y-3">
                {preguntas.map((p, i) => (
                  <div key={p.id} className="rounded-lg border border-borde p-3">
                    <label htmlFor={`r-${p.id}`} className="flex items-start gap-2 text-sm font-semibold">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tinta text-[10px] text-white">{i + 1}</span>
                      {p.pregunta}
                    </label>
                    <input
                      id={`r-${p.id}`}
                      value={borrador[p.id] ?? ''}
                      onChange={(e) => setBorrador((b) => ({ ...b, [p.id]: e.target.value }))}
                      disabled={!puedeResponder}
                      autoComplete="off"
                      maxLength={200}
                      placeholder="Escribe tu respuesta…"
                      className="mt-2 h-10 w-full rounded-lg border border-borde bg-white px-3 text-sm focus:outline-none disabled:bg-fondo"
                    />
                  </div>
                ))}
                {puedeResponder && (
                  <Boton type="submit" ancho icono={<IconoCheck tamano={16} />} cargando={enviando === 'responder'}>
                    Validar respuestas
                  </Boton>
                )}
              </form>
            </>
          )}
        </Tarjeta>
      )}

      {/* ---------- Resultado aprobado: la única pantalla con contactos ---------- */}
      {v.estado === 'APROBADA' && (
        <Tarjeta className="border-2 border-acento p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <EtiquetaSeccion className="text-acento">Constancia de verificación</EtiquetaSeccion>
              <h2 className="text-lg font-bold">Entrega aprobada</h2>
            </div>
            <Boton variante="secundario" tamano="sm" icono={<IconoImprimir tamano={14} />} onClick={() => window.print()} className="no-imprimir">
              Imprimir
            </Boton>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-suave">Caso</dt>
              <dd className="font-mono font-semibold">{idCorto(v.caso_id)} · {caso?.mascota_nombre}</dd>
            </div>
            <div>
              <dt className="text-xs text-suave">Fecha de resolución</dt>
              <dd className="font-semibold">{v.resuelta_en ? formatearFecha(v.resuelta_en) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-suave">Resultado</dt>
              <dd className="font-semibold text-acento">{acertadas.length} de {respuestas.length} preguntas acertadas</dd>
            </div>
            <div>
              <dt className="text-xs text-suave">Partes</dt>
              <dd className="font-semibold">{reclamante?.nombre} (reclamante) · {verificador?.nombre} (entrega)</dd>
            </div>
          </dl>

          {contactos.length > 0 && (
            <div className="mt-4 rounded-lg border border-acento/30 bg-acento-claro p-3">
              <EtiquetaSeccion className="mb-2 text-acento">Contacto para coordinar la entrega</EtiquetaSeccion>
              <ul className="space-y-1 text-sm">
                {contactos.map((c) => (
                  <li key={c.papel} className="flex flex-wrap justify-between gap-2">
                    <span className="text-suave">{c.papel}</span>
                    <span className="font-semibold">
                      {c.nombre} · <a href={`tel:${c.telefono}`} className="text-acento">{c.telefono}</a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 border-t border-borde pt-3 text-xs text-suave">
            La plataforma no certifica la propiedad legal del animal. Se recomienda realizar la entrega en un lugar público o en una veterinaria.
          </p>
        </Tarjeta>
      )}

      {caso && (
        <Link to={`/caso/${caso.id}`} className="no-imprimir flex gap-3 rounded-xl border border-borde bg-white p-3 shadow-tarjeta hover:border-acento/40">
          {caso.foto_url && <img src={caso.foto_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
          <div className="min-w-0 text-xs">
            <p className="text-sm font-bold">{caso.mascota_nombre}</p>
            <p className="font-semibold text-acento">Ver la ficha del caso y su historial</p>
          </div>
        </Link>
      )}

      <p className="flex gap-2 rounded-lg border border-borde bg-white p-3 text-xs text-suave">
        <IconoInfo tamano={16} className="shrink-0" />
        Las respuestas correctas nunca se envían a tu navegador: la comparación ocurre en la base de datos.
      </p>
    </div>
  );
}
