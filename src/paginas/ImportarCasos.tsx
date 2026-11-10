import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Boton, BotonEnlace } from '../componentes/Boton';
import { AreaTexto, Campo, Casilla, Selector } from '../componentes/Campo';
import { IconoDocumento, IconoSubir } from '../componentes/Iconos';
import { SelectorUbicacion } from '../componentes/Mapa';
import { SubirFotos } from '../componentes/SubirFotos';
import { Aviso, EncabezadoPagina, EtiquetaSeccion, Insignia, Tarjeta } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { ejecutarCrucesDeReporte } from '../lib/cruces';
import type { Punto } from '../lib/geo';
import { mensajeError, supabase } from '../lib/supabase';
import { aInputFechaLocal, erroresPorCampo, origenImportacionSchema, reporteSchema } from '../lib/validacion';
import { huellaMensaje, leerMensajes, type CasoImportado } from '../lib/whatsapp';
import { COLORES, ETIQUETA_ESPECIE, ETIQUETA_ESTADO_ANIMAL, ETIQUETA_SEXO, ETIQUETA_TAMANO, type Reporte } from '../tipos/tipos';

/** Un mensaje leído, con lo que el coordinador va corrigiendo. */
interface Borrador {
  origen: CasoImportado;
  incluir: boolean;
  fotos: string[];
  especie: string;
  color: string;
  tamano: string;
  sexo: string;
  estadoAnimal: string;
  fecha: string;
  nota: string;
}

interface Resumen {
  publicados: number;
  repetidos: number;
  avisados: number;
  sinCruce: number;
  errorParcial: string | null;
}

const MAX_TEXTO = 400_000;
const LOTE = 25;

const aBorrador = (c: CasoImportado): Borrador => ({
  origen: c,
  incluir: true,
  fotos: [],
  especie: c.especie,
  color: c.color,
  tamano: c.tamano,
  sexo: c.sexo,
  estadoAnimal: c.estadoAnimal,
  fecha: aInputFechaLocal(c.fecha ?? new Date()),
  nota: c.texto,
});

/**
 * Importación de casos de grupos de WhatsApp (HU-07), para coordinadores de
 * fundaciones.
 *
 * El coordinador pega la conversación (o sube el .txt que exporta WhatsApp), la
 * página la separa en un borrador por mensaje y él revisa, pone la foto y marca
 * la zona. Los casos entran como reportes públicos marcados con el nombre de la
 * fundación, así que el motor los cruza con los de la ciudad como cualquier otro.
 * Los celulares del texto se tapan antes de mostrar nada.
 */
export function ImportarCasos() {
  const { usuario } = useSesion();
  const archivo = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<'texto' | 'revision' | 'resultado'>('texto');
  const [fundacion, setFundacion] = useState('');
  const [texto, setTexto] = useState('');
  const [errorTexto, setErrorTexto] = useState<string | null>(null);
  const [errorFundacion, setErrorFundacion] = useState<string | undefined>();
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [descartados, setDescartados] = useState(0);
  const [zona, setZona] = useState<Punto | null>(null);
  const [errorZona, setErrorZona] = useState<string | undefined>();
  const [errores, setErrores] = useState<Record<number, Record<string, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const ahoraMax = useMemo(() => aInputFechaLocal(new Date()), []);

  const cambiar = (i: number, parcial: Partial<Borrador>) => setBorradores((l) => l.map((b, k) => (k === i ? { ...b, ...parcial } : b)));

  const elegirArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setErrorTexto('El archivo pesa más de 2 MB. Exporta la conversación sin multimedia o pega solo la parte que necesitas.');
      return;
    }
    setErrorTexto(null);
    setTexto(await f.text());
  };

  const analizar = () => {
    setErrorTexto(null);
    const origen = origenImportacionSchema.safeParse(fundacion);
    setErrorFundacion(origen.success ? undefined : origen.error.issues[0].message);
    if (!origen.success) return;
    if (texto.trim().length < 20) {
      setErrorTexto('Pega los mensajes del grupo o sube el archivo .txt exportado.');
      return;
    }
    if (texto.length > MAX_TEXTO) {
      setErrorTexto('El texto es demasiado largo. Divídelo en partes más pequeñas.');
      return;
    }
    const lectura = leerMensajes(texto);
    if (lectura.casos.length === 0) {
      setErrorTexto('No encontramos mensajes que describan un animal. Revisa que el texto incluya la descripción de cada caso.');
      return;
    }
    setBorradores(lectura.casos.map(aBorrador));
    setDescartados(lectura.descartados);
    setErrores({});
    setFase('revision');
  };

  const incluidos = borradores.filter((b) => b.incluir);

  const publicar = async () => {
    setErrorGeneral(null);
    setErrorZona(undefined);
    if (!usuario) return;
    const origen = origenImportacionSchema.safeParse(fundacion);
    if (!origen.success) {
      setErrorGeneral(origen.error.issues[0].message);
      return;
    }
    if (incluidos.length === 0) {
      setErrorGeneral('Marca al menos un caso para publicar.');
      return;
    }
    if (!zona) {
      setErrorZona('Marca en el mapa la zona de estos casos.');
      return;
    }

    // Se valida todo antes de publicar nada: una tanda a medias es difícil de revisar.
    const mal: Record<number, Record<string, string>> = {};
    const validos: { b: Borrador; datos: ReturnType<typeof reporteSchema.parse> }[] = [];
    borradores.forEach((b, i) => {
      if (!b.incluir) return;
      const r = reporteSchema.safeParse({
        foto_url: b.fotos[0] ?? '',
        especie: b.especie,
        punto: zona,
        ocurrido_en: b.fecha,
        estado_animal: b.estadoAnimal,
        raza: '',
        color: b.color,
        tamano: b.tamano,
        sexo: b.sexo,
        nota: b.nota,
      });
      if (r.success) validos.push({ b, datos: r.data });
      else mal[i] = erroresPorCampo(r.error);
    });
    setErrores(mal);
    if (Object.keys(mal).length > 0) {
      const n = Object.keys(mal).length;
      setErrorGeneral(`${n} ${n === 1 ? 'caso necesita' : 'casos necesitan'} correcciones: están marcados abajo. No se publicó nada.`);
      return;
    }

    setPublicando(true);
    const publicados: Reporte[] = [];
    let errorParcial: string | null = null;
    try {
      const filas = await Promise.all(
        validos.map(async ({ b, datos }) => ({
          autor_id: usuario.id,
          especie: datos.especie,
          raza: null,
          color: datos.color || null,
          tamano: datos.tamano || null,
          sexo: datos.sexo || null,
          estado_animal: datos.estado_animal,
          lat: datos.punto.lat,
          lng: datos.punto.lng,
          ocurrido_en: new Date(datos.ocurrido_en).toISOString(),
          nota: datos.nota || null,
          foto_url: datos.foto_url,
          origen: 'WHATSAPP',
          origen_nombre: origen.data,
          origen_ref: await huellaMensaje(b.origen),
        })),
      );
      for (let i = 0; i < filas.length; i += LOTE) {
        // ignoreDuplicates: un mensaje ya importado se salta sin error. Por eso
        // repetir "Publicar" tras un fallo nunca duplica lo que ya entró.
        const { data, error } = await supabase
          .from('reportes')
          .upsert(filas.slice(i, i + LOTE), { onConflict: 'autor_id,origen_ref', ignoreDuplicates: true })
          .select('*');
        if (error) {
          errorParcial = mensajeError(error);
          break;
        }
        publicados.push(...((data as Reporte[] | null) ?? []));
      }

      let avisados = 0;
      let sinCruce = 0;
      for (const r of publicados) {
        try {
          avisados += (await ejecutarCrucesDeReporte(r)).nuevas;
        } catch {
          sinCruce += 1;
        }
      }
      setResumen({
        publicados: publicados.length,
        repetidos: errorParcial ? 0 : validos.length - publicados.length,
        avisados,
        sinCruce,
        errorParcial,
      });
      setFase('resultado');
    } catch (e) {
      setErrorGeneral(mensajeError(e));
    } finally {
      setPublicando(false);
    }
  };

  const reiniciar = () => {
    setFase('texto');
    setTexto('');
    setBorradores([]);
    setErrores({});
    setErrorGeneral(null);
    setResumen(null);
    setZona(null);
  };

  // ------------------------------------------------------------------
  if (fase === 'resultado' && resumen) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Aviso
          tipo={resumen.errorParcial ? 'aviso' : 'exito'}
          titulo={`${resumen.publicados} ${resumen.publicados === 1 ? 'caso publicado' : 'casos publicados'}`}
        >
          {resumen.errorParcial
            ? `Se interrumpió la publicación: ${resumen.errorParcial} Vuelve a pulsar Publicar: lo que ya entró no se repite.`
            : 'Ya aparecen en Buscar junto con el resto de reportes de la ciudad.'}
        </Aviso>
        <Tarjeta className="space-y-1 p-5">
          <EtiquetaSeccion>Resumen</EtiquetaSeccion>
          <ul className="space-y-1 text-sm">
            <li>Publicados: <strong>{resumen.publicados}</strong></li>
            <li>Ya estaban importados y se omitieron: <strong>{resumen.repetidos}</strong></li>
            <li>Dueños avisados por coincidencias nuevas: <strong>{resumen.avisados}</strong></li>
            {resumen.sinCruce > 0 && <li>Casos cuyo cruce no pudo calcularse ahora: <strong>{resumen.sinCruce}</strong> (se cruzarán cuando un dueño publique)</li>}
            {descartados > 0 && <li>Mensajes sin animal descartados al leer el texto: <strong>{descartados}</strong></li>}
          </ul>
        </Tarjeta>
        <div className="flex flex-wrap justify-end gap-2">
          {resumen.errorParcial ? (
            <Boton variante="secundario" onClick={() => setFase('revision')}>
              Volver a la revisión
            </Boton>
          ) : (
            <Boton variante="secundario" onClick={reiniciar}>
              Importar otra tanda
            </Boton>
          )}
          <BotonEnlace to="/buscar">Ver en Buscar</BotonEnlace>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  if (fase === 'revision') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <EncabezadoPagina
          etiqueta="Paso 2 de 2 · Revisar y publicar"
          titulo={`${borradores.length} ${borradores.length === 1 ? 'caso detectado' : 'casos detectados'} en ${fundacion.trim()}`}
          descripcion="Corrige lo que no haya salido bien, agrega la foto de cada animal y marca la zona. No se publica nada hasta que pulses Publicar."
        />
        {descartados > 0 && (
          <Aviso tipo="info">
            Dejamos fuera {descartados} {descartados === 1 ? 'mensaje' : 'mensajes'} que no describían un animal (avisos del grupo, fotos sin texto, respuestas cortas).
          </Aviso>
        )}
        <Aviso tipo="aviso" titulo="Celulares tapados">
          Los celulares y correos del texto se reemplazaron por «[contacto omitido]» porque estos reportes son públicos. Quien quiera ayudar entra por la
          verificación de la plataforma, no por el chat del grupo.
        </Aviso>

        <Tarjeta className="space-y-3 p-5">
          <EtiquetaSeccion>Zona de estos casos</EtiquetaSeccion>
          <SelectorUbicacion valor={zona} onCambio={setZona} error={errorZona} alto={240} />
          <p className="text-xs text-suave">Se aplica a todos los casos de esta tanda. Si alguno está en otro sitio, desmárcalo y publícalo en otra tanda.</p>
        </Tarjeta>

        <div className="space-y-3">
          {borradores.map((b, i) => {
            const e = errores[i] ?? {};
            return (
              <Tarjeta key={b.origen.indice} className={`space-y-4 p-4 ${b.incluir ? '' : 'opacity-60'} ${Object.keys(e).length ? 'border-alerta' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Casilla
                    etiqueta={<span className="font-semibold">Caso {i + 1}{b.origen.autor ? ` · ${b.origen.autor}` : ''}</span>}
                    checked={b.incluir}
                    onChange={(ev) => cambiar(i, { incluir: ev.target.checked })}
                  />
                  {b.origen.contactosTapados > 0 && <Insignia tono="aviso">{b.origen.contactosTapados} contacto(s) tapado(s)</Insignia>}
                </div>

                {b.incluir && (
                  <>
                    <AreaTexto
                      etiqueta="Texto que se publicará"
                      maxLength={500}
                      value={b.nota}
                      onChange={(ev) => cambiar(i, { nota: ev.target.value })}
                      error={e.nota}
                      className="min-h-[72px]"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Selector etiqueta="Especie" value={b.especie} onChange={(ev) => cambiar(i, { especie: ev.target.value })} error={e.especie}>
                        <option value="">Selecciona…</option>
                        {Object.entries(ETIQUETA_ESPECIE).map(([v, t]) => (
                          <option key={v} value={v}>{t}</option>
                        ))}
                      </Selector>
                      <Selector etiqueta="Estado del animal" value={b.estadoAnimal} onChange={(ev) => cambiar(i, { estadoAnimal: ev.target.value })} error={e.estado_animal}>
                        {Object.entries(ETIQUETA_ESTADO_ANIMAL).map(([v, t]) => (
                          <option key={v} value={v}>{t}</option>
                        ))}
                      </Selector>
                      <Selector etiqueta="Color" opcional value={b.color} onChange={(ev) => cambiar(i, { color: ev.target.value })}>
                        <option value="">No sé</option>
                        {COLORES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </Selector>
                      <Selector etiqueta="Tamaño" opcional value={b.tamano} onChange={(ev) => cambiar(i, { tamano: ev.target.value })}>
                        <option value="">No sé</option>
                        {Object.entries(ETIQUETA_TAMANO).map(([v, t]) => (
                          <option key={v} value={v}>{t}</option>
                        ))}
                      </Selector>
                      <Selector etiqueta="Sexo" opcional value={b.sexo} onChange={(ev) => cambiar(i, { sexo: ev.target.value })}>
                        <option value="">No sé</option>
                        {Object.entries(ETIQUETA_SEXO).map(([v, t]) => (
                          <option key={v} value={v}>{t}</option>
                        ))}
                      </Selector>
                      <Campo
                        etiqueta="Fecha y hora"
                        type="datetime-local"
                        value={b.fecha}
                        max={ahoraMax}
                        onChange={(ev) => cambiar(i, { fecha: ev.target.value })}
                        error={e.ocurrido_en}
                        ayuda={b.origen.fecha ? 'Tomada del mensaje.' : 'El mensaje no traía fecha: se usó la de ahora.'}
                      />
                    </div>
                    {b.origen.zona && <p className="text-xs text-suave">Zona que mencionó el mensaje: «{b.origen.zona}». Verifica que el mapa de arriba coincida.</p>}
                    {usuario && <SubirFotos urls={b.fotos} onCambio={(u) => cambiar(i, { fotos: u })} usuarioId={usuario.id} carpeta="reportes" maximo={1} error={e.foto_url} />}
                  </>
                )}
              </Tarjeta>
            );
          })}
        </div>

        {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
        <div className="grid grid-cols-2 gap-2">
          <Boton variante="secundario" onClick={() => setFase('texto')} disabled={publicando}>
            Atrás
          </Boton>
          <Boton onClick={() => void publicar()} cargando={publicando} disabled={incluidos.length === 0}>
            Publicar {incluidos.length} {incluidos.length === 1 ? 'caso' : 'casos'}
          </Boton>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <EncabezadoPagina
        etiqueta="Paso 1 de 2 · Pegar los mensajes"
        titulo="Importar casos de tus grupos de WhatsApp"
        descripcion="Pasa a la plataforma los casos que hoy administras en WhatsApp para que se crucen con los reportes de toda la ciudad."
      />
      <Tarjeta className="space-y-4 p-5">
        <Campo
          etiqueta="Fundación o grupo"
          value={fundacion}
          onChange={(e) => setFundacion(e.target.value)}
          error={errorFundacion}
          placeholder="Fundación Patas · Grupo Rescate Pasto"
          ayuda="Aparece en cada caso como origen: «Vía Fundación Patas»."
        />
        <AreaTexto
          etiqueta="Mensajes del grupo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          error={errorTexto ?? undefined}
          placeholder={'12/9/26, 3:50 p. m. - Marta: Rescatamos un perrito macho, café, pequeño, por el barrio Las Cuadras…'}
          className="min-h-[200px] font-mono text-xs"
          ayuda="Pega la conversación tal como la copias, o escribe un caso por párrafo separándolos con una línea en blanco."
        />
        <div className="flex flex-wrap items-center gap-2">
          <input ref={archivo} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => void elegirArchivo(e)} />
          <Boton variante="secundario" icono={<IconoSubir tamano={16} />} onClick={() => archivo.current?.click()}>
            Subir chat exportado (.txt)
          </Boton>
          <span className="text-xs text-suave">En WhatsApp: ⋮ → Más → Exportar chat → Sin archivos multimedia.</span>
        </div>
        <Boton ancho tamano="lg" icono={<IconoDocumento tamano={16} />} onClick={analizar}>
          Analizar mensajes
        </Boton>
      </Tarjeta>
    </div>
  );
}
