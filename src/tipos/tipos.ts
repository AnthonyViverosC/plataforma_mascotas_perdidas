export type Rol = 'PROPIETARIO' | 'CIUDADANO' | 'VETERINARIO' | 'ADMIN';
export type Especie = 'PERRO' | 'GATO' | 'OTRO';
export type Tamano = 'PEQUENO' | 'MEDIANO' | 'GRANDE';
export type Sexo = 'MACHO' | 'HEMBRA' | 'DESCONOCIDO';
export type Temperamento = 'TRANQUILA' | 'SOCIABLE' | 'NERVIOSA' | 'HURANA' | 'PUEDE_MORDER';
export type TipoCaso = 'PERDIDA' | 'HALLAZGO';
export type EstadoCaso = 'ABIERTO' | 'EN_VERIFICACION' | 'RESUELTO' | 'CERRADO';
export type Desenlace = 'REENCONTRADA' | 'NO_REENCONTRADA' | 'FALLECIDA';
export type EstadoAnimal = 'SIGUE_EN_LUGAR' | 'SE_FUE' | 'LO_RECOGI' | 'REQUIERE_ATENCION';
export type EstadoCoincidencia = 'SUGERIDA' | 'CONFIRMADA' | 'DESCARTADA' | 'NO_SEGURO';
export type EstadoVerificacion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'BLOQUEADA';
export type TipoEvento =
  | 'CREACION'
  | 'AVISTAMIENTO'
  | 'LECTURA_MICROCHIP'
  | 'LECTURA_ANULADA'
  | 'COINCIDENCIA_SUGERIDA'
  | 'COINCIDENCIA_CONFIRMADA'
  | 'COINCIDENCIA_DESCARTADA'
  | 'COINCIDENCIA_NO_SEGURO'
  | 'VERIFICACION_INICIADA'
  | 'VERIFICACION_INTENTO'
  | 'VERIFICACION_APROBADA'
  | 'VERIFICACION_RECHAZADA'
  | 'VERIFICACION_BLOQUEADA'
  | 'CAMBIO_DATOS'
  | 'CAMBIO_ESTADO'
  | 'RADIO_AMPLIADO'
  | 'CIERRE';

export interface Perfil {
  id: string;
  nombre: string;
  telefono: string;
  rol: Rol;
  zona_lat: number | null;
  zona_lng: number | null;
  radio_km: number;
  acepto_datos: boolean;
  creado_en: string;
}

export interface PerfilPublico {
  id: string;
  nombre: string;
  rol: Rol;
}

export interface Mascota {
  id: string;
  propietario_id: string;
  nombre: string;
  especie: Especie;
  raza: string | null;
  color_principal: string;
  tamano: Tamano;
  sexo: Sexo;
  microchip: string | null;
  temperamento: Temperamento;
  nota_manejo: string | null;
  creado_en: string;
}

export interface FotoMascota {
  id: string;
  mascota_id: string;
  url: string;
  es_principal: boolean;
  orden: number;
}

export interface DatoReservado {
  id: string;
  mascota_id: string;
  pregunta: string;
  respuesta: string;
}

/** Fila de la vista casos_publicos (sin ubicación exacta). */
export interface CasoPublico {
  id: string;
  mascota_id: string | null;
  creador_id: string;
  tipo: TipoCaso;
  estado: EstadoCaso;
  desenlace: Desenlace | null;
  lat_publica: number;
  lng_publica: number;
  direccion_texto: string | null;
  ocurrido_en: string;
  descripcion: string | null;
  radio_km: number;
  ultima_actividad_en: string;
  creado_en: string;
  mascota_nombre: string | null;
  especie: Especie | null;
  raza: string | null;
  color_principal: string | null;
  tamano: Tamano | null;
  sexo: Sexo | null;
  temperamento: Temperamento | null;
  nota_manejo: string | null;
  foto_url: string | null;
}

export interface Reporte {
  id: string;
  autor_id: string;
  especie: Especie;
  raza: string | null;
  color: string | null;
  tamano: Tamano | null;
  sexo: Sexo | null;
  estado_animal: EstadoAnimal;
  lat: number;
  lng: number;
  ocurrido_en: string;
  nota: string | null;
  foto_url: string;
  creado_en: string;
}

export interface LecturaMicrochip {
  id: string;
  veterinario_id: string;
  codigo: string;
  mascota_id: string | null;
  caso_id: string | null;
  lat: number;
  lng: number;
  establecimiento: string;
  leido_en: string;
  anulada: boolean;
  motivo_anulacion: string | null;
  anulada_en: string | null;
  creado_en: string;
}

export type Criterio = 'MICROCHIP' | 'DISTANCIA' | 'TIEMPO' | 'RAZA' | 'COLOR' | 'TAMANO' | 'SEXO';

export interface Motivo {
  criterio: Criterio;
  aporte: number;
  detalle: string;
}

export interface Coincidencia {
  id: string;
  caso_id: string;
  reporte_id: string;
  puntaje: number;
  motivos: Motivo[];
  estado: EstadoCoincidencia;
  retroactiva: boolean;
  creado_en: string;
  decidida_en: string | null;
}

export interface CoincidenciaConReporte extends Coincidencia {
  reporte: Reporte | null;
}

export interface Verificacion {
  id: string;
  caso_id: string;
  reclamante_id: string;
  verificador_id: string;
  coincidencia_id: string | null;
  estado: EstadoVerificacion;
  intentos: number;
  superada: boolean;
  creado_en: string;
  resuelta_en: string | null;
}

export interface RespuestaVerif {
  id: string;
  verificacion_id: string;
  dato_reservado_id: string;
  intento: number;
  respuesta_dada: string;
  coincide_auto: boolean;
  correcta: boolean | null;
  creado_en: string;
}

export interface PreguntaVerificacion {
  id: string;
  pregunta: string;
}

export interface ResultadoIntento {
  aciertos: number;
  total: number;
  intentos: number;
  superada: boolean;
  estado: EstadoVerificacion;
}

export interface Evento {
  id: string;
  caso_id: string;
  tipo: TipoEvento;
  autor_id: string | null;
  descripcion: string;
  creado_en: string;
}

export interface EventoConAutor extends Evento {
  autor: PerfilPublico | null;
}

export interface Notificacion {
  id: string;
  usuario_id: string;
  titulo: string;
  cuerpo: string;
  enlace: string | null;
  leida_en: string | null;
  creado_en: string;
}

export interface ResultadoLectura {
  lectura_id: string;
  registrada: boolean;
  mascota_nombre: string | null;
  caso_id: string | null;
  caso_creado: boolean;
}

// ---------------------------------------------------------------------
// Etiquetas en español para la interfaz
// ---------------------------------------------------------------------
export const ETIQUETA_ROL: Record<Rol, string> = {
  PROPIETARIO: 'Propietario',
  CIUDADANO: 'Ciudadano',
  VETERINARIO: 'Auxiliar veterinario',
  ADMIN: 'Administrador',
};

export const ETIQUETA_ESPECIE: Record<Especie, string> = {
  PERRO: 'Perro',
  GATO: 'Gato',
  OTRO: 'Otro',
};

export const ETIQUETA_TAMANO: Record<Tamano, string> = {
  PEQUENO: 'Pequeño',
  MEDIANO: 'Mediano',
  GRANDE: 'Grande',
};

export const ETIQUETA_SEXO: Record<Sexo, string> = {
  MACHO: 'Macho',
  HEMBRA: 'Hembra',
  DESCONOCIDO: 'Desconocido',
};

export const ETIQUETA_TEMPERAMENTO: Record<Temperamento, string> = {
  TRANQUILA: 'Tranquila',
  SOCIABLE: 'Sociable',
  NERVIOSA: 'Nerviosa',
  HURANA: 'Huraña',
  PUEDE_MORDER: 'Puede morder',
};

export const ETIQUETA_ESTADO_CASO: Record<EstadoCaso, string> = {
  ABIERTO: 'Abierto',
  EN_VERIFICACION: 'En verificación',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
};

export const ETIQUETA_DESENLACE: Record<Desenlace, string> = {
  REENCONTRADA: 'Reencontrada',
  NO_REENCONTRADA: 'No reencontrada',
  FALLECIDA: 'Fallecida',
};

export const ETIQUETA_ESTADO_ANIMAL: Record<EstadoAnimal, string> = {
  SIGUE_EN_LUGAR: 'Sigue en el lugar',
  SE_FUE: 'Se fue',
  LO_RECOGI: 'Lo recogí',
  REQUIERE_ATENCION: 'Requiere atención',
};

export const ETIQUETA_ESTADO_COINCIDENCIA: Record<EstadoCoincidencia, string> = {
  SUGERIDA: 'Sugerida',
  CONFIRMADA: 'Confirmada',
  DESCARTADA: 'Descartada',
  NO_SEGURO: 'No seguro',
};

export const ETIQUETA_ESTADO_VERIFICACION: Record<EstadoVerificacion, string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  BLOQUEADA: 'Bloqueada',
};

export const COLORES = [
  'Negro',
  'Blanco',
  'Marrón',
  'Café claro',
  'Gris',
  'Dorado',
  'Crema',
  'Atigrado',
  'Manchado',
  'Tricolor',
  'Naranja',
] as const;
