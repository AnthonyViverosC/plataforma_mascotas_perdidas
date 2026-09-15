import { exigir, supabase } from './supabase';
import { validarFoto } from './validacion';

const BUCKET = 'fotos';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Sube una foto a Storage dentro de la carpeta del usuario (<uid>/<carpeta>/...) y
 * devuelve su URL pública. Valida tipo y tamaño antes de subir; el bucket también
 * limita a 5 MB y JPG/PNG/WEBP del lado del servidor.
 */
export async function subirFoto(archivo: File, usuarioId: string, carpeta: 'mascotas' | 'reportes'): Promise<string> {
  const error = validarFoto(archivo);
  if (error) throw new Error(error);

  const ruta = `${usuarioId}/${carpeta}/${crypto.randomUUID()}.${EXTENSION[archivo.type]}`;
  exigir(await supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: false }));
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}
