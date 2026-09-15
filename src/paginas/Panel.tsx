import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BotonEnlace } from '../componentes/Boton';
import { IconoChip, IconoEditar, IconoEscudo, IconoMas, IconoOjo, IconoPata } from '../componentes/Iconos';
import { TarjetaCaso } from '../componentes/TarjetaCaso';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Insignia, InsigniaVerificacion, Tarjeta, Vacio } from '../componentes/ui';
import { useMisCasos } from '../hooks/useMisCasos';
import { useSesion } from '../hooks/useSesion';
import { formatearFecha, idCorto } from '../lib/formato';
import { mensajeError, supabase } from '../lib/supabase';
import {
  ETIQUETA_ESPECIE,
  ETIQUETA_ESTADO_ANIMAL,
  ETIQUETA_ROL,
  type FotoMascota,
  type Mascota,
  type Reporte,
  type Verificacion,
} from '../tipos/tipos';

type MascotaConFotos = Mascota & { fotos: Pick<FotoMascota, 'url' | 'es_principal' | 'orden'>[] };

export function Panel() {
  const { usuario, perfil } = useSesion();
  const uid = usuario?.id ?? null;
  const { casos, cargando: cargandoCasos, error: errorCasos } = useMisCasos(uid);
  const [mascotas, setMascotas] = useState<MascotaConFotos[]>([]);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [verifs, setVerifs] = useState<Verificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let activo = true;
    Promise.all([
      supabase.from('mascotas').select('*, fotos:fotos_mascota(url, es_principal, orden)').eq('propietario_id', uid).order('creado_en'),
      supabase.from('reportes').select('*').eq('autor_id', uid).order('creado_en', { ascending: false }).limit(20),
      supabase.from('verificaciones').select('*').or(`reclamante_id.eq.${uid},verificador_id.eq.${uid}`).order('creado_en', { ascending: false }),
    ]).then(([m, r, v]) => {
      if (!activo) return;
      setMascotas((m.data as MascotaConFotos[] | null) ?? []);
      setReportes((r.data as Reporte[] | null) ?? []);
      setVerifs((v.data as Verificacion[] | null) ?? []);
      const err = m.error ?? r.error ?? v.error;
      setError(err ? mensajeError(err) : null);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [uid]);

  if (!perfil) return <Cargando />;
  const esPropietario = perfil.rol === 'PROPIETARIO' || perfil.rol === 'ADMIN';
  const casosAbiertos = new Set(casos.filter((c) => c.tipo === 'PERDIDA' && c.estado !== 'CERRADO' && c.estado !== 'RESUELTO').map((c) => c.mascota_id));

  const foto = (m: MascotaConFotos) => [...m.fotos].sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden)[0]?.url;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        etiqueta={`Panel · ${ETIQUETA_ROL[perfil.rol]}`}
        titulo={`Hola, ${perfil.nombre.split(' ')[0]}`}
        descripcion="Tus mascotas, tus casos y tus reportes en un solo lugar."
        acciones={
          <>
            {esPropietario && (
              <BotonEnlace to="/mascotas/nueva" variante="secundario" icono={<IconoMas tamano={16} />}>
                Registrar mascota
              </BotonEnlace>
            )}
            {perfil.rol === 'VETERINARIO' && (
              <BotonEnlace to="/veterinario" icono={<IconoChip tamano={16} />}>
                Registrar lectura
              </BotonEnlace>
            )}
            <BotonEnlace to="/reportar" variante={perfil.rol === 'VETERINARIO' ? 'secundario' : 'primario'} icono={<IconoOjo tamano={16} />}>
              Reportar hallazgo
            </BotonEnlace>
          </>
        }
      />
      {(error || errorCasos) && <Aviso tipo="alerta">{error ?? errorCasos}</Aviso>}

      {esPropietario && (
        <section className="space-y-3">
          <EtiquetaSeccion>Mis mascotas</EtiquetaSeccion>
          {cargando ? (
            <Cargando />
          ) : mascotas.length === 0 ? (
            <Vacio icono={<IconoPata />} titulo="Aún no registras mascotas">
              Regístrala con fotos y 3 datos reservados: así podremos verificar que eres su dueño si alguien la encuentra.
            </Vacio>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mascotas.map((m) => (
                <Tarjeta key={m.id} className="flex gap-3 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-fondo">
                    {foto(m) && <img src={foto(m)} alt={m.nombre} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-bold">{m.nombre}</p>
                    <p className="truncate text-xs text-suave">
                      {ETIQUETA_ESPECIE[m.especie]} · {m.raza || 'Mestizo'} · {m.color_principal}
                    </p>
                    {m.microchip ? <Insignia tono="info">Con microchip</Insignia> : <Insignia>Sin microchip</Insignia>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link to={`/mascotas/${m.id}`} className="flex items-center gap-1 text-xs font-semibold text-tinta hover:underline">
                        <IconoEditar tamano={13} /> Editar
                      </Link>
                      {casosAbiertos.has(m.id) ? (
                        <span className="text-xs font-semibold text-alerta">Caso abierto</span>
                      ) : (
                        <Link to={`/casos/nuevo?mascota=${m.id}`} className="text-xs font-semibold text-alerta hover:underline">
                          Reportar pérdida
                        </Link>
                      )}
                    </div>
                  </div>
                </Tarjeta>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <EtiquetaSeccion>Mis casos</EtiquetaSeccion>
        {cargandoCasos ? (
          <Cargando />
        ) : casos.length === 0 ? (
          <Vacio titulo="No tienes casos creados" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {casos.map((c) => (
              <TarjetaCaso key={c.id} caso={c} />
            ))}
          </div>
        )}
      </section>

      {verifs.length > 0 && (
        <section className="space-y-3">
          <EtiquetaSeccion>Verificaciones de propiedad</EtiquetaSeccion>
          <Tarjeta className="divide-y divide-borde">
            {verifs.map((v) => (
              <Link key={v.id} to={`/verificacion/${v.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-fondo">
                <span className="flex items-center gap-2 text-sm">
                  <IconoEscudo tamano={16} className="text-acento" />
                  <span className="font-mono text-xs">{idCorto(v.caso_id)}</span>
                  <span className="text-suave">{v.reclamante_id === uid ? 'Eres el reclamante' : 'Encontraste al animal'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-suave">{formatearFecha(v.creado_en)}</span>
                  <InsigniaVerificacion estado={v.estado} />
                </span>
              </Link>
            ))}
          </Tarjeta>
        </section>
      )}

      <section className="space-y-3">
        <EtiquetaSeccion>Mis reportes de hallazgo o avistamiento</EtiquetaSeccion>
        {cargando ? (
          <Cargando />
        ) : reportes.length === 0 ? (
          <Vacio icono={<IconoOjo />} titulo="No has reportado animales">
            Si ves un animal perdido, repórtalo: el sistema lo cruzará con los casos de pérdida.
          </Vacio>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {reportes.map((r) => (
              <Tarjeta key={r.id} className="overflow-hidden">
                <img src={r.foto_url} alt="Animal reportado" className="h-32 w-full object-cover" loading="lazy" />
                <div className="space-y-1 p-3">
                  <p className="text-sm font-semibold">
                    {ETIQUETA_ESPECIE[r.especie]}
                    {r.raza ? ` · ${r.raza}` : ''}
                  </p>
                  <p className="text-xs text-suave">{formatearFecha(r.ocurrido_en)}</p>
                  <Insignia>{ETIQUETA_ESTADO_ANIMAL[r.estado_animal]}</Insignia>
                </div>
              </Tarjeta>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
