import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BotonEnlace } from '../componentes/Boton';
import {
  IconoCalendario,
  IconoFlechaIzq,
  IconoMapa,
  IconoOjo,
  IconoPata,
  IconoReloj,
  IconoUsuario,
} from '../componentes/Iconos';
import { MapaPuntos } from '../componentes/Mapa';
import { Aviso, Cargando, EtiquetaSeccion, FilaDato, Insignia, Tarjeta, Vacio } from '../componentes/ui';
import { perfilesPublicos } from '../lib/eventos';
import { formatearFecha, idCorto, tiempoRelativo } from '../lib/formato';
import { supabase } from '../lib/supabase';
import {
  ETIQUETA_ESPECIE,
  ETIQUETA_ESTADO_ANIMAL,
  ETIQUETA_ROL,
  ETIQUETA_SEXO,
  ETIQUETA_TAMANO,
  type PerfilPublico,
  type Reporte as TReporte,
} from '../tipos/tipos';

/**
 * Ficha de un hallazgo o avistamiento. Es pública y consultable por enlace,
 * igual que la del caso: quien busca a su mascota necesita ver la foto en
 * grande, todos los rasgos y el punto en el mapa para reconocerla.
 *
 * El teléfono de quien reportó no aparece aquí. Solo llega al dueño de un
 * caso que tenga este reporte como coincidencia, por contacto_reporte().
 */
export function Reporte() {
  const { id } = useParams();
  const navegar = useNavigate();

  const [reporte, setReporte] = useState<TReporte | null>(null);
  const [autor, setAutor] = useState<PerfilPublico | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'noexiste'>('cargando');

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('reportes').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setEstado('noexiste');
      return;
    }
    const r = data as TReporte;
    setReporte(r);
    const perfiles = await perfilesPublicos([r.autor_id]);
    setAutor(perfiles.get(r.autor_id) ?? null);
    setEstado('ok');
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (estado === 'cargando') return <Cargando texto="Cargando el reporte…" />;
  if (estado === 'noexiste' || !reporte) {
    return (
      <Vacio titulo="No encontramos este reporte">
        Revisa el enlace.{' '}
        <Link to="/buscar" className="font-semibold text-acento">
          Ver hallazgos y avistamientos
        </Link>
      </Vacio>
    );
  }

  const punto = { lat: reporte.lat, lng: reporte.lng };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => navegar(-1)} className="flex items-center gap-1 text-suave hover:text-tinta">
            <IconoFlechaIzq tamano={16} /> Volver
          </button>
          <span className="text-borde">/</span>
          <span className="font-mono text-xs text-suave">{idCorto(reporte.id, 'REP')}</span>
        </div>
        <Insignia tono="acento">{ETIQUETA_ESTADO_ANIMAL[reporte.estado_animal]}</Insignia>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Columna izquierda: el animal */}
        <div className="space-y-4">
          <Tarjeta className="overflow-hidden">
            <div className="relative aspect-[4/3] bg-fondo">
              {reporte.foto_url ? (
                <img src={reporte.foto_url} alt="Animal reportado" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-suave">
                  <IconoPata tamano={32} />
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-md bg-tinta/85 px-2 py-1 font-mono text-[11px] text-white">
                {idCorto(reporte.id, 'REP')}
              </span>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{ETIQUETA_ESPECIE[reporte.especie]} sin identificar</h1>
                  <p className="text-xs text-suave">Reportado por alguien que lo vio, no por su dueño</p>
                </div>
                <Insignia tono="info">Avistamiento</Insignia>
              </div>

              <div>
                <FilaDato icono={<IconoPata tamano={14} />} etiqueta="Especie" valor={ETIQUETA_ESPECIE[reporte.especie]} />
                <FilaDato icono={<IconoPata tamano={14} />} etiqueta="Raza" valor={reporte.raza || 'Sin dato'} />
                <FilaDato icono={<IconoPata tamano={14} />} etiqueta="Color" valor={reporte.color || 'Sin dato'} />
                <FilaDato
                  icono={<IconoPata tamano={14} />}
                  etiqueta="Tamaño"
                  valor={reporte.tamano ? ETIQUETA_TAMANO[reporte.tamano] : 'Sin dato'}
                />
                <FilaDato
                  icono={<IconoPata tamano={14} />}
                  etiqueta="Sexo"
                  valor={reporte.sexo ? ETIQUETA_SEXO[reporte.sexo] : 'Sin dato'}
                />
                <FilaDato icono={<IconoOjo tamano={14} />} etiqueta="Cómo estaba" valor={ETIQUETA_ESTADO_ANIMAL[reporte.estado_animal]} />
                <FilaDato icono={<IconoCalendario tamano={14} />} etiqueta="Se vio el" valor={formatearFecha(reporte.ocurrido_en)} />
                <FilaDato icono={<IconoReloj tamano={14} />} etiqueta="Hace" valor={tiempoRelativo(reporte.ocurrido_en)} />
                <FilaDato icono={<IconoCalendario tamano={14} />} etiqueta="Publicado" valor={formatearFecha(reporte.creado_en)} />
              </div>

              {autor && (
                <div className="flex items-center gap-3 rounded-lg border border-borde p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-acento-claro text-acento">
                    <IconoUsuario tamano={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{autor.nombre}</p>
                    <p className="text-[11px] text-suave">{ETIQUETA_ROL[autor.rol]} · el teléfono no es público</p>
                  </div>
                </div>
              )}
            </div>
          </Tarjeta>
        </div>

        {/* Columna derecha: nota, mapa y qué hacer */}
        <div className="space-y-4">
          {reporte.nota && (
            <Tarjeta className="space-y-2 p-4">
              <EtiquetaSeccion>Lo que contó quien lo vio</EtiquetaSeccion>
              <p className="text-sm italic text-tinta">“{reporte.nota}”</p>
            </Tarjeta>
          )}

          <Tarjeta className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <EtiquetaSeccion>Dónde se vio</EtiquetaSeccion>
              <span className="font-mono text-[11px] text-suave">
                {punto.lat.toFixed(4)}, {punto.lng.toFixed(4)}
              </span>
            </div>
            <MapaPuntos
              alto={280}
              zoom={15}
              centro={punto}
              puntos={[
                {
                  id: reporte.id,
                  ...punto,
                  titulo: ETIQUETA_ESPECIE[reporte.especie],
                  detalle: ETIQUETA_ESTADO_ANIMAL[reporte.estado_animal],
                  tono: 'acento',
                },
              ]}
            />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-suave">
              <IconoMapa tamano={13} /> Punto que marcó quien hizo el reporte.
            </p>
          </Tarjeta>

          <Tarjeta className="space-y-3 p-4">
            <EtiquetaSeccion>¿Se parece a tu mascota?</EtiquetaSeccion>
            <Aviso tipo="aviso">
              No escribas aquí. Publica tu caso de pérdida: el motor cruza automáticamente tu mascota con los reportes de los últimos
              90 días y, si este coincide, te mostramos el nombre y el celular de quien la vio para que lo llames.
            </Aviso>
            <div className="grid gap-2 sm:grid-cols-2">
              <BotonEnlace to="/casos/nuevo" ancho>
                Reportar mi mascota perdida
              </BotonEnlace>
              <BotonEnlace to="/buscar" variante="secundario" ancho>
                Seguir viendo reportes
              </BotonEnlace>
            </div>
            <p className="text-xs text-suave">
              Si ya tienes un caso abierto, revísalo en tu{' '}
              <Link to="/panel" className="font-semibold text-acento">
                panel
              </Link>
              : las coincidencias nuevas aparecen ahí.
            </p>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
