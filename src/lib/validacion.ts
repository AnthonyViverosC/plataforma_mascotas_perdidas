import { z } from 'zod';

export const MAX_FOTO_BYTES = 5 * 1024 * 1024;
export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

const especie = z.enum(['PERRO', 'GATO', 'OTRO'], { errorMap: () => ({ message: 'Selecciona la especie.' }) });
const tamano = z.enum(['PEQUENO', 'MEDIANO', 'GRANDE'], { errorMap: () => ({ message: 'Selecciona el tamaño.' }) });
const sexo = z.enum(['MACHO', 'HEMBRA', 'DESCONOCIDO'], { errorMap: () => ({ message: 'Selecciona el sexo.' }) });

export const microchipSchema = z
  .string()
  .trim()
  .regex(/^\d{15}$/, 'El microchip debe tener 15 dígitos numéricos.');

/** Datos para entrar sin cuenta (sesión anónima): nombre, teléfono y rol. */
export const perfilSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre (mínimo 2 caracteres).').max(80, 'El nombre admite máximo 80 caracteres.'),
  telefono: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,15}$/, 'El teléfono debe tener entre 7 y 15 dígitos (puede iniciar con +).'),
  rol: z.enum(['PROPIETARIO', 'CIUDADANO', 'VETERINARIO'], { errorMap: () => ({ message: 'Selecciona tu perfil.' }) }),
  // El consentimiento ya no es una casilla: se informa junto al botón y se
  // envía siempre en true. La base lo sigue exigiendo (perfiles.acepto_datos).
  aceptoDatos: z.literal(true),
});

export const datoReservadoSchema = z.object({
  id: z.string().optional(),
  pregunta: z.string().trim().min(5, 'Cada pregunta debe tener mínimo 5 caracteres.').max(200, 'La pregunta admite máximo 200 caracteres.'),
  respuesta: z.string().trim().min(1, 'Escribe la respuesta de cada dato reservado.').max(200, 'La respuesta admite máximo 200 caracteres.'),
});

export const mascotaSchema = z
  .object({
    nombre: z.string().trim().min(1, 'Escribe el nombre de la mascota.').max(60, 'El nombre admite máximo 60 caracteres.'),
    especie,
    raza: z.string().trim().max(60, 'La raza admite máximo 60 caracteres.'),
    color_principal: z.string().min(2, 'Selecciona el color principal.'),
    tamano,
    sexo,
    microchip: z.union([z.literal(''), microchipSchema]),
    temperamento: z.enum(['TRANQUILA', 'SOCIABLE', 'NERVIOSA', 'HURANA', 'PUEDE_MORDER']),
    nota_manejo: z.string().max(300, 'La nota de manejo admite máximo 300 caracteres.'),
    fotos: z.array(z.string().url()).min(1, 'Sube al menos 1 foto de la mascota.').max(6, 'Puedes subir máximo 6 fotos.'),
    reservados: z.array(datoReservadoSchema).min(3, 'Debes registrar los 3 datos reservados.'),
  })
  .superRefine((m, ctx) => {
    const preguntas = m.reservados.map((r) => r.pregunta.trim().toLowerCase());
    if (new Set(preguntas).size !== preguntas.length) {
      ctx.addIssue({ code: 'custom', path: ['reservados'], message: 'Las preguntas de los datos reservados no pueden repetirse.' });
    }
    const obvios = [m.color_principal, m.raza, m.nombre].map((v) => v.trim().toLowerCase()).filter(Boolean);
    m.reservados.forEach((r, i) => {
      if (obvios.includes(r.respuesta.trim().toLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          path: ['reservados', i, 'respuesta'],
          message: 'Esa respuesta es visible en la ficha (nombre, raza o color). Usa un dato que solo tú conozcas.',
        });
      }
    });
    if ((m.temperamento === 'HURANA' || m.temperamento === 'PUEDE_MORDER') && m.nota_manejo.trim().length < 5) {
      ctx.addIssue({
        code: 'custom',
        path: ['nota_manejo'],
        message: 'Si la mascota es huraña o puede morder, escribe una nota de manejo para quien la encuentre.',
      });
    }
  });
export type DatosMascota = z.infer<typeof mascotaSchema>;

/** La fecha no puede ser futura ni de hace más de un año. */
export const fechaOcurrenciaSchema = z
  .string()
  .min(1, 'Indica la fecha y hora.')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'La fecha no es válida.')
  .refine((v) => new Date(v).getTime() <= Date.now() + 60_000, 'La fecha y hora no puede estar en el futuro.')
  .refine((v) => new Date(v).getTime() >= Date.now() - 365 * 24 * 3_600_000, 'La fecha no puede ser de hace más de un año.');

const puntoSchema = z.object(
  { lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) },
  { errorMap: () => ({ message: 'Marca la ubicación en el mapa.' }) },
);

export const casoPerdidaSchema = z.object({
  mascota_id: z.string().uuid('Elige la mascota que se perdió.'),
  punto: puntoSchema,
  ocurrido_en: fechaOcurrenciaSchema,
  direccion_texto: z.string().trim().max(150, 'La zona de referencia admite máximo 150 caracteres.'),
  descripcion: z.string().trim().min(10, 'Describe las circunstancias (mínimo 10 caracteres).').max(1000, 'La descripción admite máximo 1000 caracteres.'),
  radio_km: z.number().min(1, 'El radio mínimo es 1 km.').max(50, 'El radio máximo es 50 km.'),
});

export const reporteSchema = z.object({
  foto_url: z.string().url('Sube una foto del animal.'),
  especie,
  punto: puntoSchema,
  ocurrido_en: fechaOcurrenciaSchema,
  estado_animal: z.enum(['SIGUE_EN_LUGAR', 'SE_FUE', 'LO_RECOGI', 'REQUIERE_ATENCION'], {
    errorMap: () => ({ message: 'Indica el estado del animal.' }),
  }),
  raza: z.string().trim().max(60, 'La raza admite máximo 60 caracteres.'),
  color: z.string(),
  tamano: z.union([z.literal(''), tamano]),
  sexo: z.union([z.literal(''), sexo]),
  nota: z.string().trim().max(500, 'La nota admite máximo 500 caracteres.'),
});

/**
 * Lectura de microchip (H1). La ubicación no se pide aquí: solo hace falta
 * cuando la consulta previa avisa que se abrirá un caso de hallazgo.
 */
export const lecturaSchema = z.object({
  codigo: microchipSchema,
  establecimiento: z.string().trim().min(2, 'Indica el nombre de la veterinaria.').max(120, 'La veterinaria admite máximo 120 caracteres.'),
  leido_por: z.string().trim().min(2, 'Indica quién hizo la lectura.').max(80, 'El nombre admite máximo 80 caracteres.'),
});

/** Ubicación exigida solo en la rama que abre un caso de hallazgo. */
export const ubicacionLecturaSchema = puntoSchema;

/**
 * Preguntas que crea quien encontró al animal (HU-03), cuando la mascota no
 * tiene datos reservados de su dueño. Mismas reglas que datoReservadoSchema.
 */
export const preguntasVerificacionSchema = z
  .array(datoReservadoSchema)
  .min(3, 'Debes crear al menos 3 preguntas con su respuesta.')
  .superRefine((lista, ctx) => {
    const preguntas = lista.map((p) => p.pregunta.trim().toLowerCase());
    if (new Set(preguntas).size !== preguntas.length) {
      ctx.addIssue({ code: 'custom', message: 'Las preguntas no pueden repetirse.' });
    }
  });

export const anulacionSchema = z
  .string()
  .trim()
  .min(10, 'La justificación de la anulación debe tener al menos 10 caracteres.')
  .max(300, 'La justificación admite máximo 300 caracteres.');

/** Valida un archivo de foto antes de subirlo. Devuelve el mensaje de error o null. */
export function validarFoto(archivo: File): string | null {
  if (!TIPOS_FOTO.includes(archivo.type)) {
    return `"${archivo.name}" no es una imagen permitida. Usa JPG, PNG o WEBP.`;
  }
  if (archivo.size > MAX_FOTO_BYTES) {
    const mb = (archivo.size / 1024 / 1024).toLocaleString('es-CO', { maximumFractionDigits: 1 });
    return `"${archivo.name}" pesa ${mb} MB. El máximo permitido es 5 MB.`;
  }
  return null;
}

/** Primer mensaje de error por campo (ruta "a.b.0"). */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const res: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join('.') || '_';
    if (!res[clave]) res[clave] = issue.message;
  }
  return res;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function aInputFechaLocal(fecha: Date): string {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
