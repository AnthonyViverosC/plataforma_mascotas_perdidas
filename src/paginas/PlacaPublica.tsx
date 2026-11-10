import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { BotonEnlace, Boton } from '../componentes/Boton';
import { AreaTexto } from '../componentes/Campo';
import { FormularioPerfil } from '../componentes/FormularioPerfil';
import { IconoPata } from '../componentes/Iconos';
import { Aviso, AvisoManejo, Cargando, EtiquetaSeccion, FilaDato, Tarjeta, Vacio } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';
import { avisoPlacaSchema } from '../lib/validacion';
import { ETIQUETA_ESPECIE, ETIQUETA_TAMANO, type PlacaPublica as TPlaca } from '../tipos/tipos';

/**
 * Página que abre quien escanea el QR de una placa (HU-11). Es pública.
 *
 * Nunca muestra teléfonos ni datos reservados. Hay dos caminos:
 *   · La mascota tiene un caso de pérdida abierto → se lleva a su ficha, que ya
 *     sabe qué mostrar (HU-04) y desde donde se reporta el avistamiento.
 *   · No lo tiene → quien escanea deja su nombre, su celular y un mensaje, y el
 *     dueño los recibe como notificación.
 */
export function PlacaPublica() {
  const { codigo } = useParams();
  const [placa, setPlaca] = useState<TPlaca | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');
  const [paso, setPaso] = useState<'datos' | 'mensaje' | 'enviado'>('datos');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!codigo) return;
    let activo = true;
    supabase.rpc('placa_publica', { p_codigo: codigo }).then(({ data, error: err }) => {
      if (!activo) return;
      const fila = (data as TPlaca[] | null)?.[0];
      if (err || !fila) {
        setEstado('noexiste');
        return;
      }
      setPlaca(fila);
      setEstado('ok');
    });
    return () => {
      activo = false;
    };
  }, [codigo]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = avisoPlacaSchema.safeParse(mensaje);
    if (!r.success) {
      setError(r.error.issues[0].message);
      return;
    }
    if (!codigo) return;
    setEnviando(true);
    const { error: err } = await supabase.rpc('avisar_dueno_placa', { p_codigo: codigo, p_mensaje: r.data });
    setEnviando(false);
    if (err) {
      setError(mensajeError(err));
      return;
    }
    setPaso('enviado');
  };

  if (estado === 'cargando') return <Cargando texto="Leyendo la placa…" />;
  if (estado === 'noexiste' || !placa) {
    return (
      <Vacio icono={<IconoPata />} titulo="Esta placa no existe o ya no está activa">
        Revisa que el código esté completo. Si encontraste un animal sin placa, puedes reportarlo.
        <div className="mt-3">
          <BotonEnlace to="/reportar" variante="secundario">
            Reportar un animal encontrado
          </BotonEnlace>
        </div>
      </Vacio>
    );
  }

  const rasgos = [ETIQUETA_ESPECIE[placa.especie], placa.raza, placa.color_principal, ETIQUETA_TAMANO[placa.tamano]].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Tarjeta className="overflow-hidden">
        <div className="aspect-[4/3] bg-fondo">
          {placa.foto_url ? (
            <img src={placa.foto_url} alt={placa.mascota_nombre} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-suave">
              <IconoPata tamano={36} />
            </div>
          )}
        </div>
        <div className="space-y-1 p-4">
          <EtiquetaSeccion>Placa ChipPet</EtiquetaSeccion>
          <h1 className="text-2xl font-bold">{placa.mascota_nombre}</h1>
          <FilaDato etiqueta="Es" valor={rasgos} />
        </div>
      </Tarjeta>

      <AvisoManejo temperamento={placa.temperamento} nota={placa.nota_manejo} />

      {placa.caso_id ? (
        <Tarjeta className="space-y-3 p-5">
          <Aviso tipo="alerta" titulo={`${placa.mascota_nombre} está reportada como perdida`}>
            Su dueño la está buscando. En la ficha del caso ves cómo contactarlo y la última zona donde se la vio.
          </Aviso>
          <div className="grid gap-2 sm:grid-cols-2">
            <BotonEnlace to={`/caso/${placa.caso_id}`} ancho>
              Ver ficha y contactar
            </BotonEnlace>
            <BotonEnlace to={`/reportar?caso=${placa.caso_id}`} variante="secundario" ancho>
              La tengo conmigo / la vi
            </BotonEnlace>
          </div>
        </Tarjeta>
      ) : (
        <Tarjeta className="space-y-4 p-5">
          {paso === 'enviado' ? (
            <Aviso tipo="exito" titulo="Listo, avisamos a su dueño">
              Recibió tu mensaje con tu nombre y celular para que te llame. Gracias por ayudar.
            </Aviso>
          ) : (
            <>
              <div className="space-y-1">
                <EtiquetaSeccion>¿La encontraste?</EtiquetaSeccion>
                <p className="text-sm text-suave">
                  {placa.mascota_nombre} no figura como perdida. Si está contigo o la viste sola, avisa a su dueño. Solo él recibirá tu nombre y tu celular.
                </p>
              </div>
              {paso === 'datos' && <FormularioPerfil rol="CIUDADANO" textoBoton="Continuar" onListo={() => setPaso('mensaje')} />}
              {paso === 'mensaje' && (
                <form onSubmit={enviar} className="space-y-3" noValidate>
                  <AreaTexto
                    etiqueta="Mensaje para el dueño"
                    maxLength={300}
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    error={error ?? undefined}
                    placeholder="Dónde está, cómo se encuentra, cuándo puedes entregarla…"
                  />
                  <Boton type="submit" ancho tamano="lg" cargando={enviando}>
                    Avisar al dueño
                  </Boton>
                </form>
              )}
            </>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
