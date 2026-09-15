import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { IconoCheck, IconoEscudo, IconoImprimir, IconoInfo, IconoReloj, IconoX } from '../componentes/Iconos';
import { Aviso, Cargando, EtiquetaSeccion, InsigniaVerificacion, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { perfilesPublicos } from '../lib/eventos';
import { formatearFecha, idCorto } from '../lib/formato';
import { mensajeError, supabase } from '../lib/supabase';
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

/** Flujo de verificación de propiedad (HU-03). */
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
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [ultimo, setUltimo] = useState<ResultadoIntento | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<'responder' | 'aprobar' | 'rechazar' | null>(null);

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

    if (participante && (ver.superada || ver.estado === 'APROBADA')) {
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

  // Actualización periódica mientras está pendiente ("estado en tiempo real")
  useEffect(() => {
    if (v?.estado !== 'PENDIENTE') return;
    const t = window.setInterval(() => void cargar(), 8000);
    return () => window.clearInterval(t);
  }, [v?.estado, cargar]);

  if (estado === 'cargando') return <Cargando texto="Cargando verificación…" />;
  if (estado === 'noexiste' || !v || !usuario) {
    return <Vacio titulo="Verificación no disponible">No existe o no participas en ella. Solo las partes y el dueño del caso pueden verla.</Vacio>;
  }

  const esReclamante = usuario.id === v.reclamante_id;
  const esVerificador = usuario.id === v.verificador_id;
  const pendiente = v.estado === 'PENDIENTE';
  const puedeResponder = esReclamante && pendiente && !v.superada && v.intentos < 3;
  const puedeResolver = esVerificador && pendiente && v.intentos > 0 && respuestas.length > 0;
  const reclamante = partes.get(v.reclamante_id);
  const verificador = partes.get(v.verificador_id);
  const pregunta = (datoId: string) => preguntas.find((p) => p.id === datoId)?.pregunta ?? 'Pregunta reservada';
  const acertadas = respuestas.filter((r) => r.correcta);

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

  const pasos = [
    { t: 'Respuestas', hecho: v.superada || v.estado !== 'PENDIENTE', activo: pendiente && !v.superada },
    { t: 'Revisión', hecho: v.estado === 'APROBADA' || v.estado === 'RECHAZADA', activo: pendiente && v.superada },
    { t: 'Entrega', hecho: v.estado === 'APROBADA', activo: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-acento">Protocolo de verificación · Custodia segura</span>
        <InsigniaVerificacion estado={v.estado} />
      </div>

      <Tarjeta className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-tinta px-2 py-1 font-mono text-[11px] text-white">Caso {idCorto(v.caso_id)}</span>
          {caso?.especie && <span className="text-xs text-suave">{ETIQUETA_ESPECIE[caso.especie]}</span>}
        </div>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">
          Verificación de propiedad — {caso?.mascota_nombre ?? 'Mascota'}
        </h1>
        <p className="mt-1 text-sm text-suave">
          Reclamante: <strong className="text-tinta">{reclamante?.nombre ?? '—'}</strong> · Quien encontró al animal:{' '}
          <strong className="text-tinta">{verificador?.nombre ?? '—'}</strong>
        </p>
      </Tarjeta>

      <Aviso tipo="aviso" titulo="Importante" className="no-imprimir">
        La plataforma no certifica la propiedad legal del animal. Recomendamos hacer la entrega en un lugar público o en una veterinaria.
      </Aviso>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Tarjeta className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-acento-claro text-acento">
                  <IconoEscudo tamano={18} />
                </span>
                <div>
                  <EtiquetaSeccion className="text-acento">Requisito obligatorio</EtiquetaSeccion>
                  <p className="text-sm font-semibold">Objetivo: acertar al menos 2 de 3 preguntas</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-suave">
                Intentos
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < v.intentos ? (v.estado === 'BLOQUEADA' ? 'bg-alerta' : 'bg-tinta') : 'bg-borde'}`} />
                ))}
                <span className="font-mono">({v.intentos}/3)</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {pasos.map((p, i) => (
                <div key={p.t}>
                  <div className={`h-1.5 rounded-full ${p.hecho ? 'bg-acento' : p.activo ? 'bg-tinta' : 'bg-borde'}`} />
                  <p className="mt-1 text-[11px] text-suave">
                    {i + 1}. {p.t} {p.hecho ? '· completado' : p.activo ? '· en curso' : '· pendiente'}
                  </p>
                </div>
              ))}
            </div>
          </Tarjeta>

          {v.estado === 'BLOQUEADA' && (
            <Aviso tipo="alerta" titulo="Verificación bloqueada">
              Se alcanzaron 3 intentos fallidos. No se permiten nuevos intentos y se notificó al propietario. No entregues al animal a esta persona.
            </Aviso>
          )}
          {v.estado === 'RECHAZADA' && <Aviso tipo="alerta" titulo="Entrega rechazada">Quien encontró al animal rechazó la entrega tras revisar las respuestas.</Aviso>}
          {error && <Aviso tipo="alerta">{error}</Aviso>}
          {ultimo && !ultimo.superada && ultimo.estado === 'PENDIENTE' && (
            <Aviso tipo="aviso" titulo={`Intento ${ultimo.intentos} de 3 no superado`}>
              Acertaste {ultimo.aciertos} de {ultimo.total}. Te quedan {3 - ultimo.intentos} {3 - ultimo.intentos === 1 ? 'intento' : 'intentos'}.
            </Aviso>
          )}

          {esReclamante && (
            <Tarjeta className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Cuestionario cifrado</h2>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-suave">Las respuestas se comparan en el servidor</span>
              </div>
              {v.superada && pendiente ? (
                <Aviso tipo="exito" titulo="Respuestas enviadas">
                  Superaste las preguntas. Quien encontró al animal revisará tus respuestas y decidirá la entrega.
                </Aviso>
              ) : (
                <form onSubmit={responder} className="space-y-3">
                  {preguntas.map((p, i) => (
                    <div key={p.id} className="rounded-lg border border-borde p-3 focus-within:border-acento focus-within:ring-2 focus-within:ring-acento/20">
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
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Boton variante="secundario" onClick={() => setBorrador({})}>
                        Limpiar campos
                      </Boton>
                      <Boton type="submit" icono={<IconoCheck tamano={16} />} cargando={enviando === 'responder'}>
                        Validar respuestas
                      </Boton>
                    </div>
                  )}
                </form>
              )}
            </Tarjeta>
          )}

          {esVerificador && (
            <Tarjeta className="p-4">
              <h2 className="mb-1 text-base font-bold">Revisión de respuestas</h2>
              <p className="mb-3 text-xs text-suave">
                Compara con lo que ves en el animal. La columna “registro” indica si coincide con el dato reservado del dueño (sin revelarlo).
              </p>
              {respuestas.length === 0 ? (
                <Vacio icono={<IconoReloj />} titulo="Esperando envío de respuestas">
                  Cuando el reclamante responda, aparecerán aquí.
                </Vacio>
              ) : (
                <ul className="space-y-2">
                  {respuestas.map((r) => (
                    <li key={r.id} className="rounded-lg border border-borde p-3">
                      <p className="text-xs text-suave">{pregunta(r.dato_reservado_id)}</p>
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
              {pendiente && !v.superada && v.intentos > 0 && (
                <p className="mt-2 text-xs text-suave">El reclamante aún no supera el mínimo de 2 aciertos; puede volver a intentar.</p>
              )}
            </Tarjeta>
          )}
        </div>

        <div className="space-y-4">
          <Tarjeta className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <EtiquetaSeccion>Estado en tiempo real</EtiquetaSeccion>
              {pendiente && <span className="h-2 w-2 animate-pulse rounded-full bg-acento" />}
            </div>
            <div className="rounded-lg bg-fondo p-4 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-tarjeta">
                {v.estado === 'APROBADA' ? <IconoCheck className="text-acento" /> : v.estado === 'PENDIENTE' ? <IconoReloj /> : <IconoX className="text-alerta" />}
              </div>
              <p className="text-sm font-semibold">
                {v.estado === 'APROBADA'
                  ? 'Entrega aprobada'
                  : v.estado === 'BLOQUEADA'
                    ? 'Bloqueada'
                    : v.estado === 'RECHAZADA'
                      ? 'Rechazada'
                      : v.superada
                        ? 'Esperando la decisión de quien encontró al animal'
                        : 'Esperando envío de respuestas'}
              </p>
              <p className="mt-1 text-xs text-suave">Iniciada el {formatearFecha(v.creado_en)}</p>
            </div>
          </Tarjeta>

          {caso && (
            <Link to={`/caso/${caso.id}`} className="no-imprimir flex gap-3 rounded-xl border border-borde bg-white p-3 shadow-tarjeta hover:border-acento/40">
              {caso.foto_url && <img src={caso.foto_url} alt="" className="h-16 w-16 rounded-lg object-cover" />}
              <div className="min-w-0 text-xs">
                <p className="text-sm font-bold">{caso.mascota_nombre}</p>
                <p className="text-suave">{[caso.raza, caso.color_principal].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 font-semibold text-acento">Ver ficha del caso</p>
              </div>
            </Link>
          )}

          {contactos.length > 0 && (
            <Tarjeta className="p-4">
              <EtiquetaSeccion className="mb-2">Contacto para coordinar la entrega</EtiquetaSeccion>
              <ul className="space-y-1 text-sm">
                {contactos.map((c) => (
                  <li key={c.papel} className="flex justify-between gap-2">
                    <span className="text-suave">{c.papel}</span>
                    <span className="font-semibold">
                      {c.nombre} · <a href={`tel:${c.telefono}`} className="text-acento">{c.telefono}</a>
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <div className="flex gap-2 rounded-lg border border-borde bg-white p-3 text-xs text-suave">
            <IconoInfo tamano={16} className="shrink-0" />
            Las respuestas correctas nunca se envían a tu navegador: la comparación ocurre en la base de datos.
          </div>
        </div>
      </div>

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
              <dd className="font-semibold text-acento">Aprobada · {acertadas.length} de {respuestas.length} preguntas acertadas</dd>
            </div>
            <div>
              <dt className="text-xs text-suave">Partes</dt>
              <dd className="font-semibold">
                {reclamante?.nombre} (reclamante) · {verificador?.nombre} (entrega)
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <p className="text-xs text-suave">Preguntas acertadas</p>
            <ul className="mt-1 space-y-1 text-sm">
              {acertadas.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <IconoCheck tamano={14} className="text-acento" /> {pregunta(r.dato_reservado_id)}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 border-t border-borde pt-3 text-xs text-suave">
            La plataforma no certifica la propiedad legal del animal. Se recomienda realizar la entrega en un lugar público o en una veterinaria.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}
