import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { AreaTexto, Campo } from '../componentes/Campo';
import { IconoBuscar, IconoChip, IconoPata, IconoReloj, IconoUsuario } from '../componentes/Iconos';
import { SelectorUbicacion } from '../componentes/Mapa';
import { Aviso, AvisoManejo, Cargando, EncabezadoPagina, EtiquetaSeccion, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { formatearChip, formatearFecha } from '../lib/formato';
import type { Punto } from '../lib/geo';
import { mensajeError, supabase } from '../lib/supabase';
import { anulacionSchema, erroresPorCampo, lecturaSchema, ubicacionLecturaSchema } from '../lib/validacion';
import {
  ETIQUETA_ESPECIE,
  ETIQUETA_ESTADO_CASO,
  ETIQUETA_TAMANO,
  type ConsultaMicrochip,
  type LecturaMicrochip,
  type ResultadoLectura,
} from '../tipos/tipos';

/**
 * H1 · Registro de lecturas de microchip (solo rol Veterinario).
 *
 * El formulario resuelve la consulta ANTES de guardar: al pulsar «Consultar»
 * se muestra la ficha del animal y lo que va a pasar, y solo entonces se confirma.
 * La ubicación se pide únicamente cuando hay que abrir un caso de hallazgo.
 */
export function Veterinario() {
  const { perfil } = useSesion();

  // Paso 1 · consulta
  const [codigo, setCodigo] = useState('');
  const [consulta, setConsulta] = useState<ConsultaMicrochip | null>(null);
  const [consultando, setConsultando] = useState(false);

  // Paso 2 · confirmación
  const [establecimiento, setEstablecimiento] = useState('');
  const [leidoPor, setLeidoPor] = useState('');
  const [punto, setPunto] = useState<Punto | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);

  // Historial
  const [lecturas, setLecturas] = useState<LecturaMicrochip[]>([]);
  const [cargando, setCargando] = useState(true);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // El nombre del perfil es solo el valor inicial: se puede cambiar a mano.
  useEffect(() => {
    if (perfil?.nombre) setLeidoPor((actual) => actual || perfil.nombre);
  }, [perfil?.nombre]);

  const cargarHistorial = useCallback(async () => {
    if (!perfil) return;
    const { data } = await supabase
      .from('lecturas_microchip')
      .select('*')
      .eq('veterinario_id', perfil.id)
      .order('leido_en', { ascending: false })
      .limit(50);
    setLecturas((data as LecturaMicrochip[] | null) ?? []);
    setCargando(false);
  }, [perfil]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  const limpiar = () => {
    setConsulta(null);
    setPunto(null);
    setErrores({});
    setErrorGeneral(null);
  };

  const consultarChip = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    setResultado(null);
    setErrores({});
    if (!/^\d{15}$/.test(codigo)) {
      setErrores({ codigo: 'El microchip debe tener 15 dígitos numéricos.' });
      return;
    }
    setConsultando(true);
    const { data, error } = await supabase.rpc('consultar_microchip', { p_codigo: codigo });
    setConsultando(false);
    if (error) {
      setErrorGeneral(mensajeError(error));
      return;
    }
    setConsulta(data as ConsultaMicrochip);
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!consulta) return;
    setErrorGeneral(null);

    const r = lecturaSchema.safeParse({ codigo, establecimiento, leido_por: leidoPor });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    // Solo esta rama necesita coordenadas: abrir el caso de hallazgo.
    if (consulta.creara_caso) {
      const u = ubicacionLecturaSchema.safeParse(punto);
      if (!u.success) {
        setErrores({ punto: 'Marca en el mapa dónde apareció el animal.' });
        return;
      }
    }
    setErrores({});
    setEnviando(true);
    const { data, error } = await supabase.rpc('registrar_lectura', {
      p_codigo: r.data.codigo,
      p_establecimiento: r.data.establecimiento,
      p_leido_por: r.data.leido_por,
      p_lat: consulta.creara_caso ? punto!.lat : null,
      p_lng: consulta.creara_caso ? punto!.lng : null,
    });
    setEnviando(false);
    if (error) {
      setErrorGeneral(mensajeError(error));
      return;
    }
    setResultado(data as ResultadoLectura);
    setCodigo('');
    limpiar();
    await cargarHistorial();
  };

  const anular = async (id: string) => {
    setErrorAnulacion(null);
    const r = anulacionSchema.safeParse(motivo);
    if (!r.success) {
      setErrorAnulacion(r.error.issues[0].message);
      return;
    }
    const { error } = await supabase.rpc('anular_lectura', { p_lectura: id, p_motivo: r.data });
    if (error) {
      setErrorAnulacion(mensajeError(error));
      return;
    }
    setAnulando(null);
    setMotivo('');
    await cargarHistorial();
  };

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        etiqueta="Auxiliar veterinario"
        titulo="Registrar lectura de microchip"
        descripcion="Consulta el código antes de guardar: si la mascota está registrada verás su ficha y lo que va a ocurrir. La lectura queda con tu autoría y no se puede editar ni borrar; solo anular con justificación."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Tarjeta className="p-5">
          {/* ---------- Paso 1 · consultar ---------- */}
          <form onSubmit={consultarChip} className="space-y-4" noValidate>
            <Campo
              etiqueta="Código del microchip"
              inputMode="numeric"
              maxLength={15}
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.replace(/\D/g, ''));
                if (consulta) limpiar();
              }}
              error={errores.codigo}
              ayuda={`15 dígitos numéricos · ${codigo.length}/15`}
              className="font-mono text-base tracking-widest"
              placeholder="981098102458912"
              readOnly={Boolean(consulta)}
              disabled={Boolean(consulta)}
            />
            {!consulta && (
              <Boton type="submit" ancho icono={<IconoBuscar tamano={16} />} cargando={consultando} disabled={codigo.length !== 15}>
                Consultar microchip
              </Boton>
            )}
          </form>

          {/* ---------- Resultado de la consulta ---------- */}
          {consulta && (
            <div className="mt-4 space-y-4 border-t border-borde pt-4">
              {consulta.registrada ? (
                <div className="space-y-3">
                  <EtiquetaSeccion>Mascota encontrada</EtiquetaSeccion>
                  <div className="flex gap-3">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-borde bg-fondo">
                      {consulta.foto_url ? (
                        <img src={consulta.foto_url} alt={consulta.mascota_nombre ?? 'Mascota'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-suave">
                          <IconoPata tamano={22} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-base font-bold text-tinta">{consulta.mascota_nombre}</p>
                      <p className="text-xs text-suave">
                        {consulta.especie ? ETIQUETA_ESPECIE[consulta.especie] : ''}
                        {consulta.raza ? ` · ${consulta.raza}` : ''}
                        {consulta.color_principal ? ` · ${consulta.color_principal}` : ''}
                        {consulta.tamano ? ` · ${ETIQUETA_TAMANO[consulta.tamano]}` : ''}
                      </p>
                      {consulta.caso_id && consulta.caso_estado && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <Insignia tono="alerta" punto>
                            {ETIQUETA_ESTADO_CASO[consulta.caso_estado]}
                          </Insignia>
                          <Link to={`/caso/${consulta.caso_id}`} className="text-xs font-semibold text-acento hover:underline">
                            Ver caso
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  <AvisoManejo temperamento={consulta.temperamento ?? null} nota={consulta.nota_manejo ?? null} />

                  {consulta.creara_caso ? (
                    <Aviso tipo="aviso" titulo="No tiene un caso abierto">
                      Al registrar la lectura se abrirá un caso de <strong>hallazgo</strong> a tu nombre y se notificará al propietario. Por eso
                      necesitamos saber dónde apareció.
                    </Aviso>
                  ) : (
                    <Aviso tipo="info" titulo="Tiene un caso abierto">
                      La lectura se asociará a ese caso y se notificará al propietario.
                    </Aviso>
                  )}
                </div>
              ) : (
                <Aviso tipo="info" titulo="Microchip no registrado">
                  Se guardará como <strong>hallazgo huérfano</strong>. Si el dueño registra su mascota con este código más adelante, la lectura se
                  vinculará automáticamente.
                </Aviso>
              )}

              {/* ---------- Paso 2 · confirmar ---------- */}
              <form onSubmit={registrar} className="space-y-4" noValidate>
                <Campo
                  etiqueta="Fecha y hora de la lectura"
                  value={formatearFecha(ahora)}
                  readOnly
                  disabled
                  ayuda="Automática: la asigna el servidor al guardar."
                />
                <Campo
                  etiqueta="Veterinaria"
                  value={establecimiento}
                  onChange={(e) => setEstablecimiento(e.target.value)}
                  error={errores.establecimiento}
                  maxLength={120}
                  placeholder="Clínica Veterinaria San Roque"
                />
                <Campo
                  etiqueta="Quién hizo la lectura"
                  value={leidoPor}
                  onChange={(e) => setLeidoPor(e.target.value)}
                  error={errores.leido_por}
                  maxLength={80}
                  placeholder="Dra. Paula Ortiz"
                  ayuda="Queda impreso en el historial del caso."
                />

                {consulta.creara_caso && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold">¿Dónde apareció el animal?</p>
                    <SelectorUbicacion valor={punto} onCambio={setPunto} error={errores.punto} alto={200} />
                  </div>
                )}

                {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}

                <div className="flex gap-2">
                  <Boton type="submit" ancho icono={<IconoChip tamano={16} />} cargando={enviando}>
                    Registrar lectura
                  </Boton>
                  <Boton
                    variante="secundario"
                    onClick={() => {
                      setCodigo('');
                      limpiar();
                    }}
                  >
                    Cambiar código
                  </Boton>
                </div>
              </form>
            </div>
          )}

          {!consulta && errorGeneral && <Aviso tipo="alerta" className="mt-4">{errorGeneral}</Aviso>}
        </Tarjeta>

        {/* ---------- Columna derecha ---------- */}
        <div className="space-y-4">
          {resultado &&
            (resultado.registrada ? (
              <Aviso tipo="exito" titulo={`Microchip registrado: ${resultado.mascota_nombre}`}>
                {resultado.caso_creado ? 'Se abrió un caso de hallazgo' : 'La lectura se asoció a su caso abierto'} y se notificó al propietario.{' '}
                {resultado.caso_id && (
                  <Link to={`/caso/${resultado.caso_id}`} className="font-semibold underline">
                    Ver caso
                  </Link>
                )}
              </Aviso>
            ) : (
              <Aviso tipo="info" titulo="Lectura guardada como hallazgo huérfano">
                El microchip no está registrado. Si el dueño registra su mascota con este código, se cruzará automáticamente.
              </Aviso>
            ))}

          <Tarjeta className="p-4">
            <EtiquetaSeccion className="mb-3">Mis lecturas</EtiquetaSeccion>
            {cargando ? (
              <Cargando />
            ) : lecturas.length === 0 ? (
              <Vacio icono={<IconoChip />} titulo="Aún no registras lecturas" />
            ) : (
              <ul className="space-y-2">
                {lecturas.map((l) => (
                  <li key={l.id} className={`rounded-lg border border-borde p-3 ${l.anulada ? 'bg-fondo' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`font-mono text-sm font-semibold ${l.anulada ? 'text-suave line-through' : ''}`}>{formatearChip(l.codigo)}</span>
                      {l.anulada ? (
                        <Insignia tono="alerta">Anulada</Insignia>
                      ) : l.mascota_id ? (
                        <Insignia tono="acento">Registrada</Insignia>
                      ) : (
                        <Insignia tono="aviso">Huérfana</Insignia>
                      )}
                    </div>
                    <p className={`mt-1 flex items-center gap-1 text-xs text-suave ${l.anulada ? 'line-through' : ''}`}>
                      <IconoReloj tamano={12} /> {formatearFecha(l.leido_en)} · {l.establecimiento}
                    </p>
                    <p className={`mt-0.5 flex items-center gap-1 text-xs text-suave ${l.anulada ? 'line-through' : ''}`}>
                      <IconoUsuario tamano={12} /> {l.leido_por}
                    </p>
                    {l.anulada && <p className="mt-1 text-xs text-alerta">Motivo: {l.motivo_anulacion}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {l.caso_id && (
                        <Link to={`/caso/${l.caso_id}`} className="font-semibold text-acento hover:underline">
                          Ver caso
                        </Link>
                      )}
                      {!l.anulada && anulando !== l.id && (
                        <button type="button" className="font-semibold text-alerta hover:underline" onClick={() => setAnulando(l.id)}>
                          Anular lectura
                        </button>
                      )}
                    </div>
                    {anulando === l.id && (
                      <div className="mt-2 space-y-2">
                        <AreaTexto
                          etiqueta="Justificación de la anulación"
                          maxLength={300}
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          error={errorAnulacion ?? undefined}
                          ayuda="Mínimo 10 caracteres. La lectura se mostrará tachada; nunca se borra."
                        />
                        <div className="flex gap-2">
                          <Boton tamano="sm" variante="peligro" onClick={() => anular(l.id)}>
                            Confirmar anulación
                          </Boton>
                          <Boton
                            tamano="sm"
                            variante="fantasma"
                            onClick={() => {
                              setAnulando(null);
                              setMotivo('');
                              setErrorAnulacion(null);
                            }}
                          >
                            Cancelar
                          </Boton>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
