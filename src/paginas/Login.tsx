import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { Campo } from '../componentes/Campo';
import { Aviso, EncabezadoPagina, Tarjeta } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { mensajeError, supabase } from '../lib/supabase';
import { erroresPorCampo, loginSchema } from '../lib/validacion';

export function Login() {
  const { usuario } = useSesion();
  const [params] = useSearchParams();
  const volver = params.get('volver');
  const destino = volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/panel';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={destino} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorGeneral(null);
    const r = loginSchema.safeParse({ email, password });
    if (!r.success) {
      setErrores(erroresPorCampo(r.error));
      return;
    }
    setErrores({});
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword(r.data);
    setEnviando(false);
    if (error) setErrorGeneral(mensajeError(error));
  };

  return (
    <div className="mx-auto max-w-md">
      <EncabezadoPagina etiqueta="Cuenta" titulo="Iniciar sesión" />
      <Tarjeta className="p-5">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          {volver && <Aviso tipo="info">Inicia sesión para continuar.</Aviso>}
          <Campo etiqueta="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errores.email} autoComplete="email" />
          <Campo
            etiqueta="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errores.password}
            autoComplete="current-password"
          />
          {errorGeneral && <Aviso tipo="alerta">{errorGeneral}</Aviso>}
          <Boton type="submit" ancho tamano="lg" cargando={enviando}>
            Entrar
          </Boton>
          <p className="text-center text-sm text-suave">
            ¿No tienes cuenta?{' '}
            <Link to="/registro" className="font-semibold text-acento hover:underline">
              Regístrate
            </Link>
          </p>
        </form>
      </Tarjeta>
    </div>
  );
}
