import { useState, type FormEvent } from 'react';
import { useSesion } from '../hooks/useSesion';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, perfilSchema } from '../lib/validacion';
import type { Rol } from '../tipos/tipos';
import { Boton } from './Boton';
import { Campo } from './Campo';
import { Aviso } from './ui';

/**
 * Datos de quien usa la app: nombre y teléfono abren una sesión anónima de
 * Supabase por detrás. El trigger crear_perfil_nuevo_usuario() crea el perfil,
 * así RLS y las funciones aplican igual que con una cuenta.
 *
 * No hay correo, ni contraseña, ni casilla de consentimiento: aceptar el
 * tratamiento de datos se informa como letra pequeña al pie del botón, que es
 * lo que se envía como acepto_datos. La persona nunca ve algo que parezca
 * darse de alta.
 *
 * Se pregunta SIEMPRE, aunque ya haya una sesión abierta: en un navegador
 * compartido, el reporte de la segunda persona saldría con el nombre y el
 * celular de la primera. Si los datos que se escriben coinciden con los del
 * perfil actual se reutiliza la sesión —así el dueño no pierde su caso ni sus
 * coincidencias—; si son distintos, se abre una identidad nueva.
 */
export function FormularioPerfil({
  rol,
  textoBoton = 'Continuar',
  pedirBarrio = false,
  onListo,
}: {
  rol: Exclude<Rol, 'ADMIN'>;
  textoBoton?: string;
  /** Añade el barrio, que se reutiliza como zona de referencia del caso. */
  pedirBarrio?: boolean;
  onListo?: (datos: { nombre: string; telefono: string; barrio: string }) => void;
}) {
  const { perfil } = useSesion();
  const [datos, setDatos] = useState({ nombre: '', telefono: '', barrio: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = perfilSchema.safeParse({ ...datos, rol, aceptoDatos: true });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});

    // ¿Es la misma persona de antes? Entonces no se toca la sesión.
    const mismaPersona = perfil && perfil.nombre === r.data.nombre && perfil.telefono === r.data.telefono;
    if (!mismaPersona) {
      setEntrando(true);
      const { error } = await supabase.auth.signInAnonymously({
        options: { data: { nombre: r.data.nombre, telefono: r.data.telefono, rol: r.data.rol, acepto_datos: true } },
      });
      setEntrando(false);
      if (error) {
        setErrorGeneral(mensajeError(error));
        return;
      }
    }
    onListo?.({ nombre: r.data.nombre, telefono: r.data.telefono, barrio: datos.barrio.trim() });
  };

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Campo
        etiqueta={rol === 'VETERINARIO' ? 'Tu nombre y clínica' : 'Tu nombre'}
        value={datos.nombre}
        onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
        error={errores.nombre}
        autoComplete="name"
        placeholder={rol === 'VETERINARIO' ? 'Juan Pérez · Clínica San Roque' : 'Ana Martínez'}
      />
      <Campo
        etiqueta="Celular de contacto"
        type="tel"
        inputMode="tel"
        value={datos.telefono}
        onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
        error={errores.telefono}
        placeholder="3001234567"
        ayuda="Para que puedan avisarte. No se muestra en la ficha pública."
        autoComplete="tel"
      />
      {pedirBarrio && (
        <Campo
          etiqueta="Barrio donde vives"
          opcional
          value={datos.barrio}
          onChange={(e) => setDatos((d) => ({ ...d, barrio: e.target.value }))}
          placeholder="Ej. Las Cuadras"
          ayuda="Nos sirve como zona de referencia. No escribas tu dirección exacta."
        />
      )}
      {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
      <Boton type="submit" ancho tamano="lg" cargando={entrando}>
        {textoBoton}
      </Boton>
      <p className="text-center text-[11px] text-suave">
        Al continuar aceptas que tratemos tu nombre, tu celular y la ubicación que indiques para buscar y devolver mascotas. No creamos ninguna cuenta.
      </p>
    </form>
  );
}
