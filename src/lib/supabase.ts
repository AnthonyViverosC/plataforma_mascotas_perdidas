import { createClient, type PostgrestError } from '@supabase/supabase-js';

// Acepta los nombres locales (VITE_*) y los que crea la integración de Supabase en Vercel (NEXT_PUBLIC_*).
const url = (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined;

export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'falta-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Traducciones de restricciones y errores conocidos a mensajes accionables. */
const MENSAJES_RESTRICCION: Record<string, string> = {
  mascotas_microchip_idx: 'Ese microchip ya está registrado en otra mascota. Revisa los 15 dígitos.',
  casos_una_perdida_abierta_idx: 'Esta mascota ya tiene un caso de pérdida abierto. Consulta ese caso en tu panel.',
  verificaciones_una_pendiente_idx: 'Ya existe una verificación pendiente para este caso.',
  coincidencias_unica: 'Esta coincidencia ya estaba registrada.',
  perfiles_telefono_check: 'El teléfono debe tener entre 7 y 15 dígitos.',
  mascotas_microchip_check: 'El microchip debe tener 15 dígitos numéricos.',
  lecturas_microchip_codigo_check: 'El microchip debe tener 15 dígitos numéricos.',
  mascotas_nota_manejo_check: 'La nota de manejo admite máximo 300 caracteres.',
};

interface ErrorConCodigo {
  message?: string;
  code?: string;
  details?: string | null;
  status?: number;
  statusCode?: string;
}

/** Convierte cualquier error de Supabase/Storage/JS en un mensaje en español. */
export function mensajeError(error: unknown): string {
  if (!error) return 'Ocurrió un error inesperado. Intenta de nuevo.';
  if (typeof error === 'string') return error;
  const e = error as ErrorConCodigo & PostgrestError;
  const texto = `${e.message ?? ''} ${e.details ?? ''}`;

  for (const [restriccion, mensaje] of Object.entries(MENSAJES_RESTRICCION)) {
    if (texto.includes(restriccion)) return mensaje;
  }

  if (e.code === '42501' || /row-level security|permission denied/i.test(texto)) {
    // Si la función ya envió un mensaje en español, se respeta.
    if (e.message && !/row-level security|permission denied/i.test(e.message)) return e.message;
    return 'No tienes permisos para realizar esta acción con tu rol actual.';
  }
  if (/Invalid login credentials/i.test(texto)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(texto))
    return 'Tu cuenta aún no está activada. Contacta al administrador de la plataforma.';
  if (/User already registered/i.test(texto)) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (/Password should be/i.test(texto)) return 'La contraseña no cumple los requisitos de seguridad.';
  if (/Database error saving new user/i.test(texto))
    return 'No pudimos crear tu perfil. Verifica el teléfono y que aceptaste el tratamiento de datos.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(texto) || e.statusCode === '413')
    return 'La foto supera el tamaño máximo de 5 MB.';
  if (/mime type|invalid_mime_type/i.test(texto)) return 'Formato de foto no permitido. Usa JPG, PNG o WEBP.';
  if (/Failed to fetch|NetworkError/i.test(texto))
    return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  if (e.code === '23505') return 'Ya existe un registro con esos datos.';
  if (e.code === '23514') return e.message?.includes('check constraint') ? 'Algún dato no cumple las reglas. Revisa el formulario.' : e.message!;
  return e.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

/** Lanza un Error con mensaje en español si la respuesta trae error. */
export function exigir<T>(resp: { data: T; error: unknown }): T {
  if (resp.error) throw new Error(mensajeError(resp.error));
  return resp.data;
}
