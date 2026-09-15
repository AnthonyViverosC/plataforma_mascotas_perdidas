import { useState, type FormEvent } from 'react';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, perfilSchema } from '../lib/validacion';
import type { Rol } from '../tipos/tipos';
import { Boton } from './Boton';
import { Campo, Casilla } from './Campo';
import { Aviso } from './ui';

/**
 * Entrada sin cuenta: nombre + teléfono + rol abren una sesión anónima de Supabase.
 * El trigger crear_perfil_nuevo_usuario() crea el perfil con esos datos, así RLS
 * y las funciones de la base siguen aplicando igual que con una cuenta.
 */
export function FormularioPerfil({ rol, textoBoton = 'Entrar' }: { rol: Exclude<Rol, 'ADMIN'>; textoBoton?: string }) {
  const [datos, setDatos] = useState({ nombre: '', telefono: '', aceptoDatos: false });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = perfilSchema.safeParse({ ...datos, rol });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setEntrando(true);
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { nombre: r.data.nombre, telefono: r.data.telefono, rol: r.data.rol, acepto_datos: true } },
    });
    setEntrando(false);
    if (error) setErrorGeneral(mensajeError(error));
  };

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Campo
        etiqueta={rol === 'VETERINARIO' ? 'Tu nombre y clínica' : 'Tu nombre'}
        value={datos.nombre}
        onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
        error={errores.nombre}
        autoComplete="name"
        placeholder={rol === 'VETERINARIO' ? 'Juan Pérez · Clínica San Roque' : undefined}
      />
      <Campo
        etiqueta="Teléfono de contacto"
        type="tel"
        inputMode="tel"
        value={datos.telefono}
        onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
        error={errores.telefono}
        placeholder="3001234567"
        ayuda="No se muestra públicamente: solo lo ve la otra parte cuando se supera la verificación."
        autoComplete="tel"
      />
      <Casilla
        etiqueta="Acepto el tratamiento de mis datos personales (nombre, teléfono y ubicación) para la búsqueda y recuperación de mascotas."
        checked={datos.aceptoDatos}
        onChange={(e) => setDatos((d) => ({ ...d, aceptoDatos: e.target.checked }))}
        error={errores.aceptoDatos}
      />
      {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
      <Boton type="submit" ancho tamano="lg" cargando={entrando}>
        {textoBoton}
      </Boton>
    </form>
  );
}
