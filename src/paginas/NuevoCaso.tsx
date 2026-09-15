import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../componentes/Campo';
import { IconoRadar } from '../componentes/Iconos';
import { SelectorUbicacion } from '../componentes/Mapa';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { ejecutarCrucesDeCaso, type ResultadoCruceCaso } from '../lib/cruces';
import { formatearFecha } from '../lib/formato';
import type { Punto } from '../lib/geo';
import { describirMotivos } from '../lib/matching';
import { mensajeError, supabase } from '../lib/supabase';
import { aInputFechaLocal, casoPerdidaSchema, erroresPorCampo } from '../lib/validacion';
import { ETIQUETA_ESTADO_ANIMAL, type Mascota } from '../tipos/tipos';

export function NuevoCaso() {
  const { usuario } = useSesion();
  const [params] = useSearchParams();
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [conCaso, setConCaso] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);

  const [mascotaId, setMascotaId] = useState(params.get('mascota') ?? '');
  const [punto, setPunto] = useState<Punto | null>(null);
  const [fecha, setFecha] = useState(aInputFechaLocal(new Date()));
  const [zona, setZona] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [radio, setRadio] = useState(5);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ casoId: string; cruce: ResultadoCruceCaso | null; errorCruce?: string } | null>(null);

  const ahoraMax = useMemo(() => aInputFechaLocal(new Date()), []);
  const haceUnAno = useMemo(() => aInputFechaLocal(new Date(Date.now() - 365 * 86_400_000)), []);

  useEffect(() => {
    if (!usuario) return;
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

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = casoPerdidaSchema.safeParse({ mascota_id: mascotaId, punto, ocurrido_en: fecha, direccion_texto: zona, descripcion, radio_km: radio });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    if (conCaso.has(r.data.mascota_id)) {
      setErrores({ mascota_id: 'Esta mascota ya tiene un caso de pérdida abierto. Consulta ese caso en tu panel.' });
      return;
    }
    setErrores({});
    setEnviando(true);
    const { data, error } = await supabase
      .from('casos')
      .insert({
        mascota_id: r.data.mascota_id,
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
    if (error || !data) {
      setEnviando(false);
      setErrorGeneral(mensajeError(error));
      return;
    }
    const casoId = (data as { id: string }).id;
    try {
      const cruce = await ejecutarCrucesDeCaso(casoId);
      setResultado({ casoId, cruce });
    } catch (err) {
      setResultado({ casoId, cruce: null, errorCruce: mensajeError(err) });
    }
    setEnviando(false);
  };

  if (cargando) return <Cargando />;

  if (resultado) {
    const lista = resultado.cruce?.resultados ?? [];
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Aviso tipo="exito" titulo="Caso de pérdida creado">
          Ya está publicado con una ubicación aproximada (±300 m). El motor revisó los reportes de los últimos 90 días.
        </Aviso>
        {resultado.errorCruce && <Aviso tipo="alerta">No se pudieron calcular las coincidencias: {resultado.errorCruce}</Aviso>}
        <Tarjeta className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <IconoRadar className="text-acento" />
            <h2 className="text-base font-bold">Coincidencias encontradas: {lista.length}</h2>
          </div>
          {lista.length === 0 ? (
            <Vacio titulo="Aún no hay reportes parecidos">Te notificaremos cuando alguien reporte un animal que coincida.</Vacio>
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
      <EncabezadoPagina etiqueta="Casos" titulo="Reportar mascota perdida" descripcion="Crearemos una ficha pública y buscaremos coincidencias de inmediato." />
      {mascotas.length === 0 ? (
        <Vacio titulo="Primero registra tu mascota">
          <p className="mb-3">Necesitamos sus fotos y datos reservados para poder verificar al dueño.</p>
          <BotonEnlace to="/mascotas/nueva" tamano="sm">
            Registrar mascota
          </BotonEnlace>
        </Vacio>
      ) : (
        <form onSubmit={enviar} className="space-y-5" noValidate>
          <Tarjeta className="space-y-4 p-5">
            <Selector etiqueta="¿Qué mascota se perdió?" value={mascotaId} onChange={(e) => setMascotaId(e.target.value)} error={errores.mascota_id}>
              <option value="">Selecciona…</option>
              {mascotas.map((m) => (
                <option key={m.id} value={m.id} disabled={conCaso.has(m.id)}>
                  {m.nombre}
                  {conCaso.has(m.id) ? ' (ya tiene un caso abierto)' : ''}
                </option>
              ))}
            </Selector>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="Fecha y hora en que se perdió"
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
            <p className="text-xs text-suave">El punto exacto solo lo ves tú. En la ficha pública se muestra desplazado al azar hasta 300 m.</p>
            <Campo
              etiqueta="Barrio o zona de referencia"
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
              etiqueta="Circunstancias"
              maxLength={1000}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              error={errores.descripcion}
              placeholder="¿Cómo se perdió? ¿Llevaba collar? ¿Hacia dónde pudo ir?"
            />
          </Tarjeta>

          {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link to="/panel" className="text-center text-sm font-medium text-suave hover:underline sm:self-center sm:px-3">
              Cancelar
            </Link>
            <Boton type="submit" cargando={enviando}>
              Publicar caso y buscar coincidencias
            </Boton>
          </div>
        </form>
      )}
    </div>
  );
}
