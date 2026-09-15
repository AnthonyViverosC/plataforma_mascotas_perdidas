import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../componentes/Campo';
import { IconoCandado } from '../componentes/Iconos';
import { SubirFotos } from '../componentes/SubirFotos';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Tarjeta } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, mascotaSchema } from '../lib/validacion';
import {
  COLORES,
  ETIQUETA_ESPECIE,
  ETIQUETA_SEXO,
  ETIQUETA_TAMANO,
  ETIQUETA_TEMPERAMENTO,
  type DatoReservado,
  type FotoMascota,
  type Mascota,
} from '../tipos/tipos';

interface Reservado {
  id?: string;
  pregunta: string;
  respuesta: string;
}

const VACIO = {
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
  '¿Qué nombre tiene su juguete favorito?',
  '¿En qué parte del cuerpo tiene una cicatriz o marca?',
  '¿Qué palabra o sonido la hace venir corriendo?',
];

export function MascotaFormulario() {
  const { id } = useParams();
  const edicion = Boolean(id);
  const { usuario } = useSesion();
  const navegar = useNavigate();

  const [datos, setDatos] = useState(VACIO);
  const [fotos, setFotos] = useState<string[]>([]);
  const [reservados, setReservados] = useState<Reservado[]>([
    { pregunta: '', respuesta: '' },
    { pregunta: '', respuesta: '' },
    { pregunta: '', respuesta: '' },
  ]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(edicion);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!id) return;
    let activo = true;
    Promise.all([
      supabase.from('mascotas').select('*').eq('id', id).single(),
      supabase.from('fotos_mascota').select('*').eq('mascota_id', id).order('orden'),
      supabase.from('datos_reservados').select('*').eq('mascota_id', id).order('id'),
    ]).then(([m, f, d]) => {
      if (!activo) return;
      const mascota = m.data as Mascota | null;
      if (m.error || !mascota || mascota.propietario_id !== usuario?.id) {
        setErrorGeneral('No encontramos esta mascota o no eres su propietario.');
        setCargando(false);
        return;
      }
      setDatos({
        nombre: mascota.nombre,
        especie: mascota.especie,
        raza: mascota.raza ?? '',
        color_principal: mascota.color_principal,
        tamano: mascota.tamano,
        sexo: mascota.sexo,
        microchip: mascota.microchip ?? '',
        temperamento: mascota.temperamento,
        nota_manejo: mascota.nota_manejo ?? '',
      });
      const listaFotos = ((f.data as FotoMascota[] | null) ?? []).sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden);
      setFotos(listaFotos.map((x) => x.url));
      const lista: Reservado[] = ((d.data as DatoReservado[] | null) ?? []).map((x) => ({ id: x.id, pregunta: x.pregunta, respuesta: x.respuesta }));
      while (lista.length < 3) lista.push({ pregunta: '', respuesta: '' });
      setReservados(lista);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [id, usuario?.id]);

  const cambiar = (campo: keyof typeof VACIO, valor: string) => setDatos((d) => ({ ...d, [campo]: valor }));
  const cambiarReservado = (i: number, campo: 'pregunta' | 'respuesta', valor: string) =>
    setReservados((lista) => lista.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = mascotaSchema.safeParse({ ...datos, fotos, reservados });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      setErrorGeneral('Revisa los campos marcados en rojo.');
      return;
    }
    setErrores({});
    setGuardando(true);
    const { fotos: urls, reservados: res, ...mascota } = r.data;
    const { error } = await supabase.rpc('guardar_mascota', {
      p_id: id ?? null,
      p_mascota: { ...mascota, microchip: mascota.microchip || null },
      p_fotos: urls.map((url, i) => ({ url, es_principal: i === 0 })),
      p_reservados: res,
    });
    setGuardando(false);
    if (error) {
      setErrorGeneral(mensajeError(error));
      return;
    }
    navegar('/panel');
  };

  if (cargando) return <Cargando />;
  if (!usuario) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        etiqueta="Mascotas"
        titulo={edicion ? `Editar a ${datos.nombre}` : 'Registrar mascota'}
        descripcion="Fotos, datos de identificación y 3 datos reservados para verificar que eres el dueño."
      />
      <form onSubmit={enviar} className="space-y-5" noValidate>
        <Tarjeta className="space-y-4 p-5">
          <EtiquetaSeccion>Datos de la mascota</EtiquetaSeccion>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" value={datos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} error={errores.nombre} />
            <Selector etiqueta="Especie" value={datos.especie} onChange={(e) => cambiar('especie', e.target.value)} error={errores.especie}>
              <option value="">Selecciona…</option>
              {Object.entries(ETIQUETA_ESPECIE).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </Selector>
            <Campo
              etiqueta="Raza"
              opcional
              value={datos.raza}
              onChange={(e) => cambiar('raza', e.target.value)}
              error={errores.raza}
              placeholder="Ej. Pastor alemán, Mestizo"
            />
            <Selector etiqueta="Color principal" value={datos.color_principal} onChange={(e) => cambiar('color_principal', e.target.value)} error={errores.color_principal}>
              <option value="">Selecciona…</option>
              {COLORES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Tamaño" value={datos.tamano} onChange={(e) => cambiar('tamano', e.target.value)} error={errores.tamano}>
              <option value="">Selecciona…</option>
              {Object.entries(ETIQUETA_TAMANO).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </Selector>
            <Selector etiqueta="Sexo" value={datos.sexo} onChange={(e) => cambiar('sexo', e.target.value)} error={errores.sexo}>
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
              value={datos.microchip}
              onChange={(e) => cambiar('microchip', e.target.value.replace(/\D/g, ''))}
              error={errores.microchip}
              ayuda={`15 dígitos numéricos · ${datos.microchip.length}/15`}
              className="font-mono"
            />
            <Selector etiqueta="Temperamento" value={datos.temperamento} onChange={(e) => cambiar('temperamento', e.target.value)} error={errores.temperamento}>
              {Object.entries(ETIQUETA_TEMPERAMENTO).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </Selector>
          </div>
          <AreaTexto
            etiqueta="Nota de manejo"
            opcional={datos.temperamento !== 'HURANA' && datos.temperamento !== 'PUEDE_MORDER'}
            maxLength={300}
            value={datos.nota_manejo}
            onChange={(e) => cambiar('nota_manejo', e.target.value)}
            error={errores.nota_manejo}
            ayuda="Cómo acercarse a la mascota. Si es huraña o puede morder, la ficha pública mostrará un aviso destacado."
          />
        </Tarjeta>

        <Tarjeta className="space-y-3 p-5">
          <EtiquetaSeccion>Fotos (1 a 6)</EtiquetaSeccion>
          <SubirFotos urls={fotos} onCambio={setFotos} usuarioId={usuario.id} carpeta="mascotas" maximo={6} error={errores.fotos} />
        </Tarjeta>

        <Tarjeta className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <IconoCandado tamano={16} className="text-acento" />
            <EtiquetaSeccion>Datos reservados (obligatorios: 3)</EtiquetaSeccion>
          </div>
          <Aviso tipo="aviso" titulo="Usa datos que solo tú conozcas">
            No uses datos obvios como el color, la raza o el nombre: aparecen en la ficha pública. Estas respuestas nunca se muestran a nadie y sirven
            para verificar que eres el dueño antes de la entrega. Se guardan en minúsculas y sin tildes.
          </Aviso>
          {errores.reservados && <Aviso tipo="alerta">{errores.reservados}</Aviso>}
          {reservados.map((r, i) => (
            <div key={r.id ?? i} className="grid gap-3 rounded-lg border border-borde bg-fondo/50 p-3 sm:grid-cols-2">
              <Campo
                etiqueta={`Pregunta ${i + 1}`}
                value={r.pregunta}
                onChange={(e) => cambiarReservado(i, 'pregunta', e.target.value)}
                error={errores[`reservados.${i}.pregunta`]}
                placeholder={EJEMPLOS[i] ?? '¿…?'}
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

        {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={() => navegar(-1)}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardando}>
            {edicion ? 'Guardar cambios' : 'Registrar mascota'}
          </Boton>
        </div>
      </form>
    </div>
  );
}
