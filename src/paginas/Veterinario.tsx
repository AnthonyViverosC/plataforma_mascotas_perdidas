import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { AreaTexto, Campo } from '../componentes/Campo';
import { IconoChip, IconoReloj } from '../componentes/Iconos';
import { SelectorUbicacion } from '../componentes/Mapa';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { formatearChip, formatearFecha } from '../lib/formato';
import type { Punto } from '../lib/geo';
import { mensajeError, supabase } from '../lib/supabase';
import { anulacionSchema, erroresPorCampo, lecturaSchema } from '../lib/validacion';
import type { LecturaMicrochip, ResultadoLectura } from '../tipos/tipos';

/** Registro de lecturas de microchip (HU-01, solo rol Veterinario). */
export function Veterinario() {
  const { usuario } = useSesion();
  const [codigo, setCodigo] = useState('');
  const [establecimiento, setEstablecimiento] = useState('');
  const [punto, setPunto] = useState<Punto | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);
  const [lecturas, setLecturas] = useState<LecturaMicrochip[]>([]);
  const [cargando, setCargando] = useState(true);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const cargarHistorial = useCallback(async () => {
    if (!usuario) return;
    const { data } = await supabase
      .from('lecturas_microchip')
      .select('*')
      .eq('veterinario_id', usuario.id)
      .order('leido_en', { ascending: false })
      .limit(50);
    setLecturas((data as LecturaMicrochip[] | null) ?? []);
    setCargando(false);
  }, [usuario]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    setResultado(null);
    const r = lecturaSchema.safeParse({ codigo, establecimiento, punto });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setEnviando(true);
    const { data, error } = await supabase.rpc('registrar_lectura', {
      p_codigo: r.data.codigo,
      p_lat: r.data.punto.lat,
      p_lng: r.data.punto.lng,
      p_establecimiento: r.data.establecimiento,
    });
    setEnviando(false);
    if (error) {
      setErrorGeneral(mensajeError(error));
      return;
    }
    setResultado(data as ResultadoLectura);
    setCodigo('');
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
        etiqueta="Veterinario"
        titulo="Registrar lectura de microchip"
        descripcion="La lectura queda en el historial con tu autoría y no se puede editar ni borrar; solo anular con justificación."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Tarjeta className="p-5">
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <Campo
              etiqueta="Código del microchip"
              inputMode="numeric"
              maxLength={15}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              error={errores.codigo}
              ayuda={`15 dígitos numéricos · ${codigo.length}/15`}
              className="font-mono text-base tracking-widest"
              placeholder="981098102458912"
            />
            <Campo etiqueta="Fecha y hora de la lectura" value={formatearFecha(ahora)} readOnly disabled ayuda="Automática: la asigna el servidor al guardar." />
            <Campo
              etiqueta="Establecimiento"
              value={establecimiento}
              onChange={(e) => setEstablecimiento(e.target.value)}
              error={errores.establecimiento}
              placeholder="Clínica Veterinaria San Roque"
            />
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Ubicación</p>
              <SelectorUbicacion valor={punto} onCambio={setPunto} error={errores.punto} alto={220} />
            </div>
            {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
            <Boton type="submit" ancho icono={<IconoChip tamano={16} />} cargando={enviando}>
              Registrar lectura
            </Boton>
          </form>
        </Tarjeta>

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
              <Aviso tipo="info" titulo="Microchip no registrado">
                Guardamos la lectura como hallazgo huérfano. Si el dueño registra su mascota o reporta la pérdida con este código, se cruzará
                automáticamente.
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
