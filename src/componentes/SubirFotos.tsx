import { useRef, useState, type ChangeEvent } from 'react';
import { subirFoto } from '../lib/fotos';
import { mensajeError } from '../lib/supabase';
import { validarFoto } from '../lib/validacion';
import { Boton } from './Boton';
import { IconoEstrella, IconoFoto, IconoX } from './Iconos';

/**
 * Subida de fotos a Supabase Storage. La primera foto del listado es la principal.
 * Rechaza archivos de más de 5 MB o de formato distinto a JPG/PNG/WEBP con un mensaje claro.
 */
export function SubirFotos({
  urls,
  onCambio,
  usuarioId,
  carpeta,
  maximo = 6,
  error,
}: {
  urls: string[];
  onCambio: (urls: string[]) => void;
  usuarioId: string;
  carpeta: 'mascotas' | 'reportes';
  maximo?: number;
  error?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  const alElegir = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (archivos.length === 0) return;

    const nuevosErrores: string[] = [];
    const disponibles = maximo - urls.length;
    if (archivos.length > disponibles) {
      nuevosErrores.push(`Puedes subir máximo ${maximo} ${maximo === 1 ? 'foto' : 'fotos'}. Se ignoraron ${archivos.length - disponibles}.`);
    }
    const validos = archivos.slice(0, Math.max(0, disponibles)).filter((a) => {
      const err = validarFoto(a);
      if (err) nuevosErrores.push(err);
      return !err;
    });

    setSubiendo(true);
    const subidas: string[] = [];
    for (const archivo of validos) {
      try {
        subidas.push(await subirFoto(archivo, usuarioId, carpeta));
      } catch (err) {
        nuevosErrores.push(`No se pudo subir "${archivo.name}": ${mensajeError(err)}`);
      }
    }
    setSubiendo(false);
    setErrores(nuevosErrores);
    if (subidas.length) onCambio([...urls, ...subidas]);
  };

  const quitar = (url: string) => onCambio(urls.filter((u) => u !== url));
  const hacerPrincipal = (url: string) => onCambio([url, ...urls.filter((u) => u !== url)]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {urls.map((url, i) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-borde bg-fondo">
            <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && maximo > 1 && (
              <span className="absolute left-1 top-1 rounded bg-tinta/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">Principal</span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => hacerPrincipal(url)}
                  className="rounded bg-white/90 p-1 text-tinta shadow"
                  aria-label="Usar como foto principal"
                  title="Usar como principal"
                >
                  <IconoEstrella tamano={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => quitar(url)}
                className="rounded bg-white/90 p-1 text-alerta shadow"
                aria-label="Quitar foto"
                title="Quitar"
              >
                <IconoX tamano={14} />
              </button>
            </div>
          </div>
        ))}
        {urls.length < maximo && (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={subiendo}
            className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-suave transition hover:border-acento hover:text-acento ${
              error ? 'border-alerta' : 'border-borde'
            }`}
          >
            {subiendo ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-acento border-t-transparent" />
            ) : (
              <IconoFoto tamano={22} />
            )}
            <span>{subiendo ? 'Subiendo…' : 'Agregar'}</span>
          </button>
        )}
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={maximo > 1}
        className="hidden"
        onChange={alElegir}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-suave">
          JPG, PNG o WEBP · máximo 5 MB por foto · {urls.length}/{maximo}
        </p>
        {urls.length > 0 && urls.length < maximo && (
          <Boton variante="fantasma" tamano="sm" onClick={() => entrada.current?.click()} disabled={subiendo}>
            Agregar otra
          </Boton>
        )}
      </div>
      {[...(error ? [error] : []), ...errores].map((m) => (
        <p key={m} role="alert" className="text-xs font-medium text-alerta">
          {m}
        </p>
      ))}
    </div>
  );
}
