import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { Selector } from '../componentes/Campo';
import {
  IconoCalendario,
  IconoChip,
  IconoEscudo,
  IconoFlechaIzq,
  IconoMapa,
  IconoOjo,
  IconoRadar,
  IconoReloj,
  IconoUsuario,
} from '../componentes/Iconos';
import { LineaTiempo } from '../componentes/LineaTiempo';
import { MapaPuntos } from '../componentes/Mapa';
import { TarjetaCoincidencia } from '../componentes/TarjetaCoincidencia';
import {
  Aviso,
  AvisoManejo,
  Cargando,
  EtiquetaSeccion,
  FilaDato,
  Insignia,
  InsigniaEstadoCaso,
  InsigniaVerificacion,
  Tarjeta,
  Vacio,
} from '../componentes/ui';
import { useCoincidencias } from '../hooks/useCoincidencias';
import { useSesion } from '../hooks/useSesion';
import { ejecutarCrucesDeCaso } from '../lib/cruces';
import { perfilesPublicos } from '../lib/eventos';
import { enmascararChip, formatearChip, formatearFecha, idCorto, tiempoRelativo } from '../lib/formato';
import type { Punto } from '../lib/geo';
import { mensajeError, supabase } from '../lib/supabase';
import {
  ETIQUETA_DESENLACE,
  ETIQUETA_ESPECIE,
  ETIQUETA_ROL,
  ETIQUETA_SEXO,
  ETIQUETA_TAMANO,
  type CasoPublico,
  type Desenlace,
  type EstadoCoincidencia,
  type FotoMascota,
  type LecturaMicrochip,
  type Mascota,
  type PerfilPublico,
  type Verificacion,
} from '../tipos/tipos';

/** Ficha única del caso (HU-04): pública, con historial, coincidencias y mapa. */
export function Caso() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { usuario } = useSesion();

  const [caso, setCaso] = useState<CasoPublico | null>(null);
  const [mascota, setMascota] = useState<Mascota | null>(null);
  const [fotos, setFotos] = useState<FotoMascota[]>([]);
  const [fotoActiva, setFotoActiva] = useState(0);
  const [creador, setCreador] = useState<PerfilPublico | null>(null);
  const [lecturas, setLecturas] = useState<LecturaMicrochip[]>([]);
  const [verifs, setVerifs] = useState<Verificacion[]>([]);
  const [exacta, setExacta] = useState<Punto | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');
  const [version, setVersion] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'alerta' | 'info'; texto: string; enlace?: string } | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const [accion, setAccion] = useState<'radio' | 'cerrar' | null>(null);
  const [nuevoRadio, setNuevoRadio] = useState(10);
  const [desenlace, setDesenlace] = useState<Desenlace | ''>('');
  const [trabajando, setTrabajando] = useState(false);

  const esDueno = Boolean(usuario && caso && usuario.id === caso.creador_id);
  const esPropietarioMascota = Boolean(usuario && mascota && usuario.id === mascota.propietario_id);
  const { activas, historico, cargando: cargandoCoinc, error: errorCoinc, recargar: recargarCoinc, decidir } = useCoincidencias(
    id,
    esDueno && caso?.tipo === 'PERDIDA',
  );

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('casos_publicos').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setEstado('noexiste');
      return;
    }
    const c = data as CasoPublico;
    setCaso(c);

    const [m, f, l, v] = await Promise.all([
      c.mascota_id ? supabase.from('mascotas').select('*').eq('id', c.mascota_id).maybeSingle() : Promise.resolve({ data: null }),
      c.mascota_id ? supabase.from('fotos_mascota').select('*').eq('mascota_id', c.mascota_id).order('orden') : Promise.resolve({ data: [] }),
      supabase.from('lecturas_microchip').select('*').eq('caso_id', c.id).order('leido_en', { ascending: false }),
      usuario ? supabase.from('verificaciones').select('*').eq('caso_id', c.id).order('creado_en', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    setMascota((m.data as Mascota | null) ?? null);
    setFotos((((f.data as FotoMascota[] | null) ?? []) as FotoMascota[]).sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden));
    setLecturas((l.data as LecturaMicrochip[] | null) ?? []);
    setVerifs((v.data as Verificacion[] | null) ?? []);

    const perfiles = await perfilesPublicos([c.creador_id]);
    setCreador(perfiles.get(c.creador_id) ?? null);

    if (usuario && usuario.id === c.creador_id) {
      const { data: ub } = await supabase.rpc('ubicacion_exacta_caso', { p_caso: c.id });
      setExacta(((ub as Punto[] | null) ?? [])[0] ?? null);
    } else {
      setExacta(null);
    }
    setEstado('ok');
  }, [id, usuario]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const refrescarTodo = async () => {
    await Promise.all([cargar(), recargarCoinc()]);
    setVersion((x) => x + 1);
  };

  const onDecidir = async (coincId: string, nuevo: Exclude<EstadoCoincidencia, 'SUGERIDA'>) => {
    setMensaje(null);
    try {
      await decidir(coincId, nuevo);
      if (nuevo === 'CONFIRMADA') {
        const { data } = await supabase
          .from('verificaciones')
          .select('id')
          .eq('coincidencia_id', coincId)
          .maybeSingle();
        const vid = (data as { id: string } | null)?.id;
        setMensaje({
          tipo: 'exito',
          texto: vid
            ? 'Coincidencia confirmada. Se inició la verificación de propiedad: responde las 3 preguntas para continuar.'
            : 'Coincidencia confirmada. El caso sigue abierto hasta que se verifique la entrega.',
          enlace: vid ? `/verificacion/${vid}` : undefined,
        });
      } else {
        setMensaje({
          tipo: 'info',
          texto: nuevo === 'DESCARTADA' ? 'Coincidencia descartada. Queda en el histórico y no volverá a sugerirse.' : 'Marcada como "no estoy seguro".',
        });
      }
      await cargar();
      setVersion((x) => x + 1);
    } catch (e) {
      setMensaje({ tipo: 'alerta', texto: mensajeError(e) });
    }
  };

  const recalcular = async () => {
    if (!caso) return;
    setTrabajando(true);
    setMensaje(null);
    try {
      const r = await ejecutarCrucesDeCaso(caso.id);
      setMensaje({ tipo: 'info', texto: `Motor ejecutado: ${r.resultados.length} coincidencias sobre el umbral, ${r.nuevas} nuevas.` });
      await refrescarTodo();
    } catch (e) {
      setMensaje({ tipo: 'alerta', texto: mensajeError(e) });
    } finally {
      setTrabajando(false);
    }
  };

  const ampliarRadio = async () => {
    if (!caso) return;
    setTrabajando(true);
    setMensaje(null);
    const { error } = await supabase.from('casos').update({ radio_km: nuevoRadio }).eq('id', caso.id);
    if (error) {
      setTrabajando(false);
      setMensaje({ tipo: 'alerta', texto: mensajeError(error) });
      return;
    }
    try {
      const r = await ejecutarCrucesDeCaso(caso.id);
      setMensaje({ tipo: 'exito', texto: `Radio actualizado a ${nuevoRadio} km. ${r.nuevas} coincidencias nuevas.` });
    } catch (e) {
      setMensaje({ tipo: 'alerta', texto: mensajeError(e) });
    }
    setAccion(null);
    setTrabajando(false);
    await refrescarTodo();
  };

  const cerrarCaso = async () => {
    if (!caso) return;
    if (!desenlace) {
      setMensaje({ tipo: 'alerta', texto: 'Selecciona el desenlace para cerrar el caso.' });
      return;
    }
    setTrabajando(true);
    const { error } = await supabase.from('casos').update({ estado: 'CERRADO', desenlace }).eq('id', caso.id);
    setTrabajando(false);
    if (error) {
      setMensaje({ tipo: 'alerta', texto: mensajeError(error) });
      return;
    }
    setAccion(null);
    setMensaje({ tipo: 'exito', texto: 'Caso cerrado. Seguirá siendo consultable con el mismo enlace.' });
    await refrescarTodo();
  };

  const iniciarVerificacion = async () => {
    if (!caso) return;
    setTrabajando(true);
    setMensaje(null);
    const { data, error } = await supabase.rpc('iniciar_verificacion', { p_caso: caso.id });
    setTrabajando(false);
    if (error) {
      setMensaje({ tipo: 'alerta', texto: mensajeError(error) });
      return;
    }
    navegar(`/verificacion/${data as string}`);
  };

  if (estado === 'cargando') return <Cargando texto="Cargando ficha del caso…" />;
  if (estado === 'noexiste' || !caso) {
    return (
      <Vacio titulo="No encontramos este caso">
        Revisa el enlace. <Link to="/buscar" className="font-semibold text-acento">Buscar casos</Link>
      </Vacio>
    );
  }

  const activo = caso.estado === 'ABIERTO' || caso.estado === 'EN_VERIFICACION';
  const centroMapa = exacta ?? { lat: caso.lat_publica, lng: caso.lng_publica };
  const foto = fotos[fotoActiva]?.url ?? caso.foto_url;
  const puedeIniciarVerif = Boolean(usuario && !esPropietarioMascota && caso.mascota_id && activo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => navegar(-1)} className="flex items-center gap-1 text-suave hover:text-tinta">
            <IconoFlechaIzq tamano={16} /> Volver
          </button>
          <span className="text-borde">/</span>
          <span className="font-mono text-xs text-suave">{idCorto(caso.id)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] uppercase tracking-wide text-suave sm:inline">Historial de custodia</span>
          <InsigniaEstadoCaso estado={caso.estado} />
        </div>
      </div>

      <AvisoManejo temperamento={caso.temperamento} nota={caso.nota_manejo} />

      {caso.estado === 'CERRADO' && caso.desenlace && (
        <Aviso tipo="info" titulo={`Caso cerrado · ${ETIQUETA_DESENLACE[caso.desenlace]}`}>
          Este caso ya no recibe reportes, pero su historial sigue disponible en este mismo enlace.
        </Aviso>
      )}
      {mensaje && (
        <Aviso tipo={mensaje.tipo} className="no-imprimir">
          {mensaje.texto}{' '}
          {mensaje.enlace && (
            <Link to={mensaje.enlace} className="font-semibold underline">
              Abrir verificación
            </Link>
          )}
        </Aviso>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Columna izquierda: identidad */}
        <div className="space-y-4">
          <Tarjeta className="overflow-hidden">
            <div className="relative aspect-[4/3] bg-fondo">
              {foto ? (
                <img src={foto} alt={caso.mascota_nombre ?? 'Mascota'} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-suave">Sin foto</div>
              )}
              <span className="absolute left-3 top-3 rounded-md bg-tinta/85 px-2 py-1 font-mono text-[11px] text-white">{idCorto(caso.id)}</span>
              {mascota?.microchip && (
                <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold text-acento shadow">
                  <IconoEscudo tamano={13} /> Identidad con microchip
                </span>
              )}
            </div>
            {fotos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto p-2">
                {fotos.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFotoActiva(i)}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 ${i === fotoActiva ? 'border-acento' : 'border-transparent'}`}
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    <img src={f.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{caso.mascota_nombre ?? 'Animal sin identificar'}</h1>
                  <p className="text-xs text-suave">
                    {[caso.especie && ETIQUETA_ESPECIE[caso.especie], caso.raza || 'Mestizo', caso.sexo && ETIQUETA_SEXO[caso.sexo], caso.tamano && ETIQUETA_TAMANO[caso.tamano]]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Insignia tono={caso.tipo === 'PERDIDA' ? 'alerta' : 'info'}>{caso.tipo === 'PERDIDA' ? 'Perdida' : 'Hallazgo'}</Insignia>
              </div>

              {mascota?.microchip && (
                <div className="rounded-lg border border-borde bg-fondo p-3">
                  <div className="flex items-center justify-between">
                    <EtiquetaSeccion>Transpondedor ISO 11784</EtiquetaSeccion>
                    <span className="text-[10px] font-semibold text-acento">15 dígitos</span>
                  </div>
                  <p className="mt-1 flex items-center gap-2 font-mono text-lg font-semibold tracking-wider">
                    <IconoChip tamano={16} className="text-suave" />
                    {esPropietarioMascota ? formatearChip(mascota.microchip) : enmascararChip(mascota.microchip)}
                  </p>
                </div>
              )}

              <div>
                <FilaDato icono={<IconoCalendario tamano={14} />} etiqueta={caso.tipo === 'PERDIDA' ? 'Se perdió' : 'Fecha del hallazgo'} valor={formatearFecha(caso.ocurrido_en)} />
                <FilaDato icono={<IconoReloj tamano={14} />} etiqueta="Última actividad" valor={tiempoRelativo(caso.ultima_actividad_en)} />
                <FilaDato icono={<IconoMapa tamano={14} />} etiqueta="Zona" valor={caso.direccion_texto || 'Aproximada en el mapa'} />
                <FilaDato icono={<IconoRadar tamano={14} />} etiqueta="Radio de búsqueda" valor={`${caso.radio_km} km`} />
              </div>

              {creador && (
                <div className="flex items-center gap-3 rounded-lg border border-borde p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-acento-claro text-acento">
                    <IconoUsuario tamano={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{creador.nombre}</p>
                    <p className="text-[11px] text-suave">{caso.tipo === 'PERDIDA' ? 'Propietario' : ETIQUETA_ROL[creador.rol]} · el teléfono no es público</p>
                  </div>
                </div>
              )}

              {caso.descripcion && <p className="text-sm text-tinta">{caso.descripcion}</p>}
            </div>

            <div className="no-imprimir space-y-2 border-t border-borde p-4">
              {esDueno && activo && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Boton variante="secundario" tamano="sm" onClick={() => setAccion(accion === 'radio' ? null : 'radio')}>
                      Ampliar radio
                    </Boton>
                    <Boton variante="peligro" tamano="sm" onClick={() => setAccion(accion === 'cerrar' ? null : 'cerrar')}>
                      Cerrar caso
                    </Boton>
                  </div>
                  {caso.tipo === 'PERDIDA' && (
                    <Boton ancho tamano="sm" icono={<IconoRadar tamano={14} />} onClick={recalcular} cargando={trabajando && accion === null}>
                      Recalcular coincidencias
                    </Boton>
                  )}
                  {accion === 'radio' && (
                    <div className="space-y-2 rounded-lg border border-borde bg-fondo p-3">
                      <Selector etiqueta="Nuevo radio" value={nuevoRadio} onChange={(e) => setNuevoRadio(Number(e.target.value))}>
                        {[2, 3, 5, 10, 15, 20, 30, 50]
                          .filter((k) => k !== caso.radio_km)
                          .map((k) => (
                            <option key={k} value={k}>
                              {k} km
                            </option>
                          ))}
                      </Selector>
                      <Boton ancho tamano="sm" onClick={ampliarRadio} cargando={trabajando}>
                        Guardar y volver a cruzar
                      </Boton>
                    </div>
                  )}
                  {accion === 'cerrar' && (
                    <div className="space-y-2 rounded-lg border border-alerta/30 bg-alerta-claro p-3">
                      <Selector etiqueta="Desenlace" value={desenlace} onChange={(e) => setDesenlace(e.target.value as Desenlace | '')}>
                        <option value="">Selecciona…</option>
                        {Object.entries(ETIQUETA_DESENLACE).map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </Selector>
                      <Boton ancho tamano="sm" variante="peligro" onClick={cerrarCaso} cargando={trabajando}>
                        Confirmar cierre
                      </Boton>
                    </div>
                  )}
                </>
              )}
              {puedeIniciarVerif && (
                <Boton ancho icono={<IconoEscudo tamano={16} />} onClick={iniciarVerificacion} cargando={trabajando}>
                  Encontré a este animal: iniciar verificación
                </Boton>
              )}
              {activo && caso.tipo === 'PERDIDA' && !esDueno && (
                <BotonEnlace to={`/reportar?caso=${caso.id}`} variante="secundario" ancho icono={<IconoOjo tamano={16} />}>
                  Aportar un avistamiento
                </BotonEnlace>
              )}
              {!usuario && (
                <p className="text-center text-xs text-suave">
                  <Link to={`/entrar?volver=/caso/${caso.id}`} className="font-semibold text-acento">
                    Elige tu perfil
                  </Link>{' '}
                  para reportar un avistamiento o iniciar una verificación.
                </p>
              )}
            </div>
          </Tarjeta>

          {verifs.length > 0 && (
            <Tarjeta className="p-4">
              <EtiquetaSeccion className="mb-2">Verificaciones de propiedad</EtiquetaSeccion>
              <ul className="space-y-2">
                {verifs.map((v) => (
                  <li key={v.id}>
                    <Link to={`/verificacion/${v.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-borde p-2 text-xs hover:bg-fondo">
                      <span>
                        {formatearFecha(v.creado_en)} · intentos {v.intentos}/3
                      </span>
                      <InsigniaVerificacion estado={v.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>

        {/* Columna derecha: mapa, coincidencias, historial */}
        <div className="space-y-4">
          <Tarjeta className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <EtiquetaSeccion>{exacta ? 'Ubicación exacta (solo tú la ves)' : 'Ubicación aproximada (±300 m)'}</EtiquetaSeccion>
              <span className="font-mono text-[11px] text-suave">
                {centroMapa.lat.toFixed(4)}, {centroMapa.lng.toFixed(4)}
              </span>
            </div>
            <MapaPuntos
              alto={240}
              zoom={14}
              centro={centroMapa}
              circulo={{ ...centroMapa, radioKm: caso.radio_km }}
              puntos={[
                { id: 'caso', ...centroMapa, titulo: caso.mascota_nombre ?? 'Caso', detalle: exacta ? 'Punto exacto' : 'Zona aproximada', tono: 'alerta' },
                ...lecturas
                  .filter((l) => !l.anulada)
                  .map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, titulo: 'Lectura de microchip', detalle: l.establecimiento, tono: 'acento' as const })),
              ]}
            />
          </Tarjeta>

          {esDueno && caso.tipo === 'PERDIDA' && (
            <Tarjeta className="p-4">
              <div id="coincidencias" className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <EtiquetaSeccion>Coincidencias sugeridas</EtiquetaSeccion>
                  <p className="text-xs text-suave">Solo tú puedes verlas y decidir.</p>
                </div>
                <div className="flex rounded-lg border border-borde p-0.5 text-xs">
                  <button type="button" onClick={() => setVerHistorico(false)} className={`rounded-md px-2.5 py-1 ${!verHistorico ? 'bg-tinta text-white' : 'text-suave'}`}>
                    Activas ({activas.length})
                  </button>
                  <button type="button" onClick={() => setVerHistorico(true)} className={`rounded-md px-2.5 py-1 ${verHistorico ? 'bg-tinta text-white' : 'text-suave'}`}>
                    Histórico ({historico.length})
                  </button>
                </div>
              </div>
              {errorCoinc && <Aviso tipo="alerta">{errorCoinc}</Aviso>}
              {cargandoCoinc ? (
                <Cargando />
              ) : (verHistorico ? historico : activas).length === 0 ? (
                <Vacio icono={<IconoRadar />} titulo={verHistorico ? 'Sin decisiones registradas' : 'No hay coincidencias activas'}>
                  {verHistorico ? 'Aquí verás las coincidencias confirmadas y descartadas.' : 'Te avisaremos cuando un reporte coincida con tu mascota.'}
                </Vacio>
              ) : (
                <div className="space-y-3">
                  {(verHistorico ? historico : activas).map((c) => (
                    <TarjetaCoincidencia key={c.id} coincidencia={c} onDecidir={activo ? (e) => onDecidir(c.id, e) : undefined} />
                  ))}
                </div>
              )}
            </Tarjeta>
          )}

          {lecturas.length > 0 && (
            <Tarjeta className="p-4">
              <EtiquetaSeccion className="mb-2">Lecturas de microchip</EtiquetaSeccion>
              <ul className="space-y-2">
                {lecturas.map((l) => (
                  <li key={l.id} className={`rounded-lg border border-borde p-3 text-xs ${l.anulada ? 'bg-fondo text-suave' : ''}`}>
                    <p className={l.anulada ? 'line-through' : 'font-semibold'}>
                      {l.establecimiento} · {formatearFecha(l.leido_en)}
                    </p>
                    {l.anulada && <p className="mt-1">Anulada: {l.motivo_anulacion}</p>}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}

          <Tarjeta className="p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">Historial del caso</h2>
                <p className="text-xs text-suave">Registro inmutable en orden cronológico descendente.</p>
              </div>
              <Insignia>Solo lectura</Insignia>
            </div>
            <LineaTiempo casoId={caso.id} version={version} />
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
