import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { Campo, Casilla, Selector } from '../componentes/Campo';
import { Aviso, EncabezadoPagina, Tarjeta } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, registroSchema } from '../lib/validacion';

export function Registro() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const [datos, setDatos] = useState({ nombre: '', email: '', telefono: '', password: '', rol: '', aceptoDatos: false });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/panel" replace />;

  const cambiar = (campo: keyof typeof datos, valor: string | boolean) => setDatos((d) => ({ ...d, [campo]: valor }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = registroSchema.safeParse(datos);
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: r.data.email,
      password: r.data.password,
      options: {
        data: { nombre: r.data.nombre, telefono: r.data.telefono, rol: r.data.rol, acepto_datos: true },
      },
    });
    if (error) {
      setEnviando(false);
      setErrorGeneral(mensajeError(error));
      return;
    }
    // Sin confirmación de correo: si signUp no devolvió sesión, se entra directamente.
    if (!data.session) {
      const { error: errorEntrar } = await supabase.auth.signInWithPassword({ email: r.data.email, password: r.data.password });
      if (errorEntrar) {
        setEnviando(false);
        setErrorGeneral(mensajeError(errorEntrar));
        return;
      }
    }
    setEnviando(false);
    navegar('/panel');
  };

  return (
    <div className="mx-auto max-w-lg">
      <EncabezadoPagina etiqueta="Cuenta" titulo="Crear cuenta" descripcion="Regístrate para reportar pérdidas, hallazgos o lecturas de microchip." />
      <Tarjeta className="p-5">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <Campo etiqueta="Nombre completo" value={datos.nombre} onChange={(e) => cambiar('nombre', e.target.value)} error={errores.nombre} autoComplete="name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Correo electrónico" type="email" value={datos.email} onChange={(e) => cambiar('email', e.target.value)} error={errores.email} autoComplete="email" />
            <Campo
              etiqueta="Teléfono"
              type="tel"
              inputMode="tel"
              value={datos.telefono}
              onChange={(e) => cambiar('telefono', e.target.value)}
              error={errores.telefono}
              placeholder="3001234567"
              autoComplete="tel"
            />
          </div>
          <Campo
            etiqueta="Contraseña"
            type="password"
            value={datos.password}
            onChange={(e) => cambiar('password', e.target.value)}
            error={errores.password}
            ayuda="Mínimo 8 caracteres, con mayúscula, minúscula y número."
            autoComplete="new-password"
          />
          <Selector etiqueta="Rol" value={datos.rol} onChange={(e) => cambiar('rol', e.target.value)} error={errores.rol}>
            <option value="">Selecciona tu rol…</option>
            <option value="PROPIETARIO">Propietario de mascota</option>
            <option value="CIUDADANO">Ciudadano (reporto hallazgos)</option>
            <option value="VETERINARIO">Veterinario (leo microchips)</option>
          </Selector>
          <Casilla
            etiqueta={
              <>
                Acepto el tratamiento de mis datos personales (nombre, teléfono y ubicación) para la búsqueda y recuperación de mascotas. Mi teléfono no
                se muestra públicamente.
              </>
            }
            checked={datos.aceptoDatos}
            onChange={(e) => cambiar('aceptoDatos', e.target.checked)}
            error={errores.aceptoDatos}
          />
          {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
          <Boton type="submit" ancho tamano="lg" cargando={enviando}>
            Crear cuenta
          </Boton>
          <p className="text-center text-sm text-suave">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-semibold text-acento hover:underline">
              Inicia sesión
            </Link>
          </p>
        </form>
      </Tarjeta>
    </div>
  );
}
