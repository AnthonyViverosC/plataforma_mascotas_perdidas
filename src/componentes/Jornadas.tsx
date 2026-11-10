import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { formatearFecha, tiempoHasta } from '../lib/formato';
import { mensajeError, supabase } from '../lib/supabase';
import { aInputFechaLocal, erroresPorCampo, jornadaSchema } from '../lib/validacion';
import type { Jornada } from '../tipos/tipos';
import { Boton } from './Boton';
import { AreaTexto, Campo } from './Campo';
import { FormularioPerfil } from './FormularioPerfil';
import { IconoCalendario, IconoMapa, IconoUsuario } from './Iconos';
import { Aviso, EtiquetaSeccion, Insignia, Tarjeta } from './ui';

/**
 * Jornadas de búsqueda de un caso (mejora sobre el backlog). El dueño convoca
 * día, hora y punto de encuentro; cualquiera dice «voy» dejando su nombre y su
 * celular. Todo pasa por RPC (jornadas_caso, convocar_jornada…): las tablas no
 * se leen ni se escriben directamente.
 */
export function Jornadas({
  casoId,
  esDueno,
  activo,
  onCambio,
}: {
  casoId: string;
  esDueno: boolean;
  activo: boolean;
  /** Se llama cuando cambia algo que va al historial del caso. */
  onCambio?: () => void;
}) {
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(false);
  const [datos, setDatos] = useState({ iniciaEn: '', punto: '', nota: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState<string | null>(null);
  // Jornada a la que alguien quiere apuntarse: primero confirma sus datos.
  const [pidiendoDatos, setPidiendoDatos] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('jornadas_caso', { p_caso: casoId });
    if (err) setError(mensajeError(err));
    setJornadas(((data as Jornada[] | null) ?? []).filter((j) => !j.cancelada || j.es_mia));
  }, [casoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const convocar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = jornadaSchema().safeParse(datos);
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setTrabajando('convocar');
    const { error: err } = await supabase.rpc('convocar_jornada', {
      p_caso: casoId,
      p_inicia: new Date(r.data.iniciaEn).toISOString(),
      p_punto: r.data.punto,
      p_nota: r.data.nota || null,
    });
    setTrabajando(null);
    if (err) {
      setError(mensajeError(err));
      return;
    }
    setFormulario(false);
    setDatos({ iniciaEn: '', punto: '', nota: '' });
    setExito('Jornada convocada. Avisamos a quienes ya reportaron haberla visto. Compártela también por WhatsApp.');
    await cargar();
    onCambio?.();
  };

  const ejecutar = async (fn: 'apuntarse_jornada' | 'salir_jornada' | 'cancelar_jornada', id: string, texto: string) => {
    setError(null);
    setExito(null);
    setTrabajando(id);
    const { error: err } = await supabase.rpc(fn, { p_jornada: id });
    setTrabajando(null);
    if (err) {
      setError(mensajeError(err));
      return;
    }
    setExito(texto);
    await cargar();
    if (fn === 'cancelar_jornada') onCambio?.();
  };

  // Siempre se piden los datos, como al reportar (README, decisión 22.4): en un
  // navegador compartido, «voy» saldría a nombre de la persona anterior.
  // FormularioPerfil reutiliza la sesión si los datos coinciden.
  const apuntarse = (id: string) => setPidiendoDatos(id);

  const cancelar = async (j: Jornada) => {
    const ok = window.confirm(`¿Cancelar la jornada del ${formatearFecha(j.inicia_en)}? Avisaremos a las ${j.asistentes} personas apuntadas.`);
    if (ok) await ejecutar('cancelar_jornada', j.id, 'Jornada cancelada. Avisamos a quienes se habían apuntado.');
  };

  const proximas = jornadas.filter((j) => !j.cancelada);
  if (!esDueno && proximas.length === 0) return null;

  return (
    <Tarjeta className="no-imprimir space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <EtiquetaSeccion>Jornadas de búsqueda</EtiquetaSeccion>
          <p className="text-xs text-suave">
            {esDueno ? 'Convoca a vecinos y voluntarios a buscar juntos en un punto de encuentro.' : 'Su familia busca ayuda. Si puedes ir, apúntate.'}
          </p>
        </div>
        {esDueno && activo && !formulario && (
          <Boton variante="secundario" tamano="sm" onClick={() => setFormulario(true)}>
            Convocar
          </Boton>
        )}
      </div>

      {error && <Aviso tipo="alerta">{error}</Aviso>}
      {exito && <Aviso tipo="exito">{exito}</Aviso>}

      {formulario && (
        <form onSubmit={convocar} className="space-y-3 rounded-lg border border-borde bg-fondo p-3" noValidate>
          <Campo
            etiqueta="Día y hora"
            type="datetime-local"
            min={aInputFechaLocal(new Date(Date.now() + 30 * 60_000))}
            value={datos.iniciaEn}
            onChange={(e) => setDatos((d) => ({ ...d, iniciaEn: e.target.value }))}
            error={errores.iniciaEn}
          />
          <Campo
            etiqueta="Punto de encuentro"
            value={datos.punto}
            maxLength={120}
            onChange={(e) => setDatos((d) => ({ ...d, punto: e.target.value }))}
            error={errores.punto}
            placeholder="Ej. Entrada del Parque Bolívar"
            ayuda="Es público. Elige un lugar conocido, no la puerta de tu casa."
          />
          <AreaTexto
            etiqueta="Nota para quienes vayan"
            opcional
            maxLength={300}
            value={datos.nota}
            onChange={(e) => setDatos((d) => ({ ...d, nota: e.target.value }))}
            error={errores.nota}
            placeholder="Traigan linterna, su comida favorita es el atún…"
          />
          <div className="flex gap-2">
            <Boton type="submit" tamano="sm" cargando={trabajando === 'convocar'}>
              Publicar jornada
            </Boton>
            <Boton type="button" variante="fantasma" tamano="sm" onClick={() => setFormulario(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      )}

      {jornadas.length === 0 && !formulario && esDueno && <p className="text-xs text-suave">Aún no has convocado ninguna jornada.</p>}

      <ul className="space-y-2">
        {jornadas.map((j) => (
          <li key={j.id} className={`space-y-2 rounded-lg border border-borde p-3 ${j.cancelada ? 'bg-fondo text-suave' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`flex items-center gap-1.5 text-sm font-semibold ${j.cancelada ? 'line-through' : ''}`}>
                <IconoCalendario tamano={14} /> {formatearFecha(j.inicia_en)}
              </p>
              {j.cancelada ? (
                <Insignia>Cancelada</Insignia>
              ) : (
                <span className="flex items-center gap-1 text-xs text-suave">
                  <IconoUsuario tamano={13} /> {j.asistentes} {j.asistentes === 1 ? 'persona va' : 'personas van'}
                </span>
              )}
            </div>
            <p className="flex items-start gap-1.5 text-xs">
              <IconoMapa tamano={13} className="mt-px shrink-0" /> {j.punto_texto}
            </p>
            {j.nota && <p className="text-xs italic text-suave">“{j.nota}”</p>}
            {!j.cancelada && (
              <p className="text-[11px] text-suave">
                Convoca {j.organizador} · {new Date(j.inicia_en) > new Date() ? `empieza ${tiempoHasta(j.inicia_en)}` : 'en curso'}
              </p>
            )}
            {!j.cancelada &&
              (j.es_mia ? (
                <Boton variante="fantasma" tamano="sm" onClick={() => cancelar(j)} cargando={trabajando === j.id}>
                  Cancelar jornada
                </Boton>
              ) : j.yo_asisto ? (
                <div className="flex items-center gap-2">
                  <Insignia tono="acento">Vas a ir</Insignia>
                  <Boton variante="fantasma" tamano="sm" onClick={() => ejecutar('salir_jornada', j.id, 'Listo, ya no estás apuntado.')} cargando={trabajando === j.id}>
                    Ya no puedo
                  </Boton>
                </div>
              ) : (
                <Boton tamano="sm" onClick={() => apuntarse(j.id)} cargando={trabajando === j.id} disabled={pidiendoDatos === j.id}>
                  Voy a ayudar
                </Boton>
              ))}
            {pidiendoDatos === j.id && (
              <div className="rounded-lg border border-borde bg-fondo p-3">
                <p className="mb-2 text-xs text-suave">Déjanos tu nombre y tu celular para que la familia sepa quién va.</p>
                <FormularioPerfil
                  rol="CIUDADANO"
                  textoBoton="Apuntarme"
                  onListo={() => {
                    setPidiendoDatos(null);
                    void ejecutar('apuntarse_jornada', j.id, '¡Gracias! Te esperamos. La familia ya sabe que vas.');
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
