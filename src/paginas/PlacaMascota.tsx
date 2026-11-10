import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { AreaTexto, Campo } from '../componentes/Campo';
import { CodigoQR } from '../componentes/CodigoQR';
import { IconoFlechaIzq, IconoQR } from '../componentes/Iconos';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, FilaDato, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { formatearFecha } from '../lib/formato';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, placaSchema } from '../lib/validacion';
import { ETIQUETA_ESTADO_PLACA, type EstadoPlaca, type Mascota, type PlacaQR } from '../tipos/tipos';

const PASOS: EstadoPlaca[] = ['SOLICITADA', 'EN_PRODUCCION', 'ENVIADA', 'ENTREGADA'];

function Seguimiento({ estado }: { estado: EstadoPlaca }) {
  const actual = PASOS.indexOf(estado);
  return (
    <ol className="flex gap-1" aria-label="Estado del pedido">
      {PASOS.map((p, i) => (
        <li key={p} className="flex-1 space-y-1" aria-current={i === actual ? 'step' : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= actual ? 'bg-acento' : 'bg-borde'}`} />
          <span className={`block text-[11px] ${i === actual ? 'font-semibold text-tinta' : 'text-suave'}`}>{ETIQUETA_ESTADO_PLACA[p]}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Placa con código QR de una mascota (HU-11), solo para su dueño.
 *
 * El QR apunta a /placa/<código>, una página pública que no muestra teléfonos
 * ni datos reservados. El pedido cubre el envío de la placa física; el código
 * ya sirve desde que se solicita, así que se puede imprimir y probar de una vez.
 */
export function PlacaMascota() {
  const { id } = useParams();
  const { perfil, usuario } = useSesion();
  const [mascota, setMascota] = useState<Mascota | null>(null);
  const [placas, setPlacas] = useState<PlacaQR[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');
  const [datos, setDatos] = useState({ nombre_envio: '', direccion_envio: '', ciudad: '', telefono_envio: '', notas: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    const m = await supabase.from('mascotas').select('*').eq('id', id).maybeSingle();
    if (m.error || !m.data) {
      setEstado('noexiste');
      return;
    }
    const p = await supabase.from('placas_qr').select('*').eq('mascota_id', id).order('creado_en', { ascending: false });
    setMascota(m.data as Mascota);
    setPlacas((p.data as PlacaQR[] | null) ?? []);
    setEstado('ok');
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Los datos de envío arrancan con los del perfil: casi siempre son los mismos.
  useEffect(() => {
    if (!perfil) return;
    setDatos((d) => ({ ...d, nombre_envio: d.nombre_envio || perfil.nombre, telefono_envio: d.telefono_envio || perfil.telefono }));
  }, [perfil]);

  const solicitar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = placaSchema.safeParse(datos);
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    if (!id) return;
    setEnviando(true);
    const { error } = await supabase.rpc('solicitar_placa', {
      p_mascota: id,
      p_nombre: r.data.nombre_envio,
      p_direccion: r.data.direccion_envio,
      p_ciudad: r.data.ciudad,
      p_telefono: r.data.telefono_envio,
      p_notas: r.data.notas || null,
    });
    setEnviando(false);
    if (error) {
      setErrorGeneral(mensajeError(error));
      return;
    }
    await cargar();
  };

  const cancelar = async (placa: PlacaQR) => {
    setErrorGeneral(null);
    setCancelando(true);
    const { error } = await supabase.rpc('cancelar_placa', { p_placa: placa.id });
    setCancelando(false);
    if (error) {
      setErrorGeneral(mensajeError(error));
      return;
    }
    await cargar();
  };

  if (estado === 'cargando') return <Cargando texto="Cargando…" />;
  if (estado === 'noexiste' || !mascota) {
    return <Vacio titulo="No encontramos esa mascota">Vuelve a tu panel y elígela de nuevo.</Vacio>;
  }
  if (usuario && mascota.propietario_id !== usuario.id) {
    return (
      <Aviso tipo="alerta" titulo="Esta mascota no es tuya">
        Solo su propietario puede pedir la placa.
      </Aviso>
    );
  }

  const vigente = placas.find((p) => p.estado !== 'CANCELADA');
  const enTramite = vigente && vigente.estado !== 'ENTREGADA';
  const anteriores = placas.filter((p) => p.id !== vigente?.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/panel" className="no-imprimir inline-flex items-center gap-1 text-sm text-suave hover:text-tinta">
        <IconoFlechaIzq tamano={16} /> Volver al panel
      </Link>
      <EncabezadoPagina
        etiqueta="Placa con código QR"
        titulo={`Placa de ${mascota.nombre}`}
        descripcion="Quien encuentre a tu mascota escanea el QR y ve su foto y cómo avisarte, sin que tengas que poner tu teléfono en la placa."
      />

      {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}

      {vigente ? (
        <>
          <Tarjeta className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <EtiquetaSeccion>Tu pedido</EtiquetaSeccion>
              <Insignia tono={vigente.estado === 'ENTREGADA' ? 'acento' : 'aviso'} punto>
                {ETIQUETA_ESTADO_PLACA[vigente.estado]}
              </Insignia>
            </div>
            <Seguimiento estado={vigente.estado} />
            <div>
              <FilaDato etiqueta="Recibe" valor={vigente.nombre_envio} />
              <FilaDato etiqueta="Dirección" valor={`${vigente.direccion_envio}, ${vigente.ciudad}`} />
              <FilaDato etiqueta="Teléfono de envío" valor={vigente.telefono_envio} />
              <FilaDato etiqueta="Solicitada el" valor={formatearFecha(vigente.creado_en)} />
              {vigente.notas && <FilaDato etiqueta="Notas" valor={vigente.notas} />}
            </div>
            {vigente.estado === 'SOLICITADA' && (
              <Boton variante="peligro" tamano="sm" cargando={cancelando} onClick={() => void cancelar(vigente)}>
                Cancelar pedido
              </Boton>
            )}
          </Tarjeta>

          <Tarjeta className="space-y-3 p-5">
            <EtiquetaSeccion>Código QR</EtiquetaSeccion>
            <CodigoQR codigo={vigente.codigo} nombre={mascota.nombre} />
            <Aviso tipo="info">
              Ya funciona: si lo imprimes y alguien lo escanea, abre la página pública de {mascota.nombre}. Si pierdes la placa, cancela y pide otra: el código
              anterior sigue activo hasta que se entregue la nueva.
            </Aviso>
          </Tarjeta>
        </>
      ) : (
        <form onSubmit={solicitar} className="space-y-4" noValidate>
          <Tarjeta className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <IconoQR tamano={20} className="text-acento" />
              <EtiquetaSeccion>¿A dónde enviamos la placa?</EtiquetaSeccion>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                etiqueta="Quién la recibe"
                value={datos.nombre_envio}
                onChange={(e) => setDatos((d) => ({ ...d, nombre_envio: e.target.value }))}
                error={errores.nombre_envio}
                autoComplete="name"
              />
              <Campo
                etiqueta="Teléfono de envío"
                type="tel"
                inputMode="tel"
                value={datos.telefono_envio}
                onChange={(e) => setDatos((d) => ({ ...d, telefono_envio: e.target.value }))}
                error={errores.telefono_envio}
                autoComplete="tel"
                ayuda="Solo lo usa la empresa de envíos."
              />
            </div>
            <Campo
              etiqueta="Dirección de envío"
              value={datos.direccion_envio}
              onChange={(e) => setDatos((d) => ({ ...d, direccion_envio: e.target.value }))}
              error={errores.direccion_envio}
              placeholder="Calle 18 # 20-30, apto 301"
              autoComplete="street-address"
            />
            <Campo
              etiqueta="Ciudad"
              value={datos.ciudad}
              onChange={(e) => setDatos((d) => ({ ...d, ciudad: e.target.value }))}
              error={errores.ciudad}
              placeholder="Pasto"
              autoComplete="address-level2"
            />
            <AreaTexto
              etiqueta="Notas para la entrega"
              opcional
              maxLength={200}
              value={datos.notas}
              onChange={(e) => setDatos((d) => ({ ...d, notas: e.target.value }))}
              error={errores.notas}
              placeholder="Portería, horario…"
            />
          </Tarjeta>
          <Boton type="submit" ancho tamano="lg" cargando={enviando}>
            Solicitar placa de {mascota.nombre}
          </Boton>
        </form>
      )}

      {enTramite && vigente && (
        <p className="no-imprimir text-center text-xs text-suave">Te avisaremos en Notificaciones cuando cambie el estado del pedido.</p>
      )}

      {anteriores.length > 0 && (
        <Tarjeta className="no-imprimir space-y-2 p-5">
          <EtiquetaSeccion>Pedidos anteriores</EtiquetaSeccion>
          <ul className="divide-y divide-borde text-sm">
            {anteriores.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs text-suave">{p.codigo}</span>
                <span className="text-xs text-suave">{formatearFecha(p.creado_en)}</span>
                <Insignia tono={p.estado === 'CANCELADA' ? 'neutro' : 'acento'}>{ETIQUETA_ESTADO_PLACA[p.estado]}</Insignia>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
