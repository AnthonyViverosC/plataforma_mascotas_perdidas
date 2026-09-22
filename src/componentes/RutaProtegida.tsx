import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion';
import { mensajeError, supabase } from '../lib/supabase';
import { ETIQUETA_ROL, type Rol } from '../tipos/tipos';
import { BotonEnlace } from './Boton';
import { FormularioPerfil } from './FormularioPerfil';
import { IconoCandado } from './Iconos';
import { Aviso, Cargando, EtiquetaSeccion, Tarjeta } from './ui';

/** Qué se le explica a quien llega sin sesión, según lo que venía a hacer. */
const INTRO: Record<Exclude<Rol, 'ADMIN'>, { titulo: string; texto: string }> = {
  PROPIETARIO: {
    titulo: 'Primero, tus datos',
    texto: 'Para avisarte en cuanto alguien reporte un animal parecido al tuyo. No creamos ninguna cuenta.',
  },
  VETERINARIO: {
    titulo: 'Identifícate para registrar lecturas',
    texto: 'La lectura queda firmada con tu nombre en el historial del caso. No creamos ninguna cuenta.',
  },
  CIUDADANO: {
    titulo: 'Primero, tus datos',
    texto: 'Solo tu nombre y un teléfono de contacto. No creamos ninguna cuenta ni pedimos contraseña.',
  },
};

/**
 * Exige sesión y, opcionalmente, uno de los roles indicados. Nadie ve nada que
 * se parezca a iniciar sesión:
 *
 *   · Sin sesión → se piden nombre y teléfono aquí mismo, como el paso 1 de
 *     Reportar. No hay pantalla de login ni de "elige tu perfil".
 *   · Con otro rol → se cambia solo, sin preguntar ni interrumpir. El rol es
 *     una etiqueta de lo que la persona viene a hacer, no un privilegio.
 *
 * La única excepción es VETERINARIO: ahí el rol sí es una barrera real
 * (HU-01, criterio 1), así que se avisa en vez de autoasignarlo.
 *
 * La protección de verdad está en RLS; esto solo evita pantallas inútiles.
 */
export function RutaProtegida({ roles, children }: { roles?: Rol[]; children: ReactNode }) {
  const { usuario, perfil, cargando, recargarPerfil } = useSesion();
  const { pathname } = useLocation();
  const [error, setError] = useState<string | null>(null);

  const necesario = (roles?.find((r) => r !== 'ADMIN') ?? 'CIUDADANO') as Exclude<Rol, 'ADMIN'>;
  const rolCorrecto = !roles || !perfil || roles.includes(perfil.rol);
  // Se cambia solo salvo que la ruta pida veterinario, que sí es una barrera.
  const cambioAutomatico = !rolCorrecto && necesario !== 'VETERINARIO' && perfil?.rol !== 'ADMIN';

  useEffect(() => {
    if (!cambioAutomatico) return;
    let activo = true;
    void (async () => {
      const { error: err } = await supabase.rpc('cambiar_rol', { p_rol: necesario });
      if (!activo) return;
      if (err) {
        setError(mensajeError(err));
        return;
      }
      await recargarPerfil();
    })();
    return () => {
      activo = false;
    };
  }, [cambioAutomatico, necesario, recargarPerfil]);

  if (cargando || (usuario && !perfil)) return <Cargando texto="Un momento…" />;

  if (!usuario) {
    const intro = INTRO[necesario];
    return (
      <Tarjeta className="mx-auto max-w-lg space-y-4 p-5">
        <div className="space-y-1">
          <EtiquetaSeccion>Tus datos</EtiquetaSeccion>
          <h1 className="text-lg font-bold">{intro.titulo}</h1>
          <p className="text-sm text-suave">{intro.texto}</p>
        </div>
        <FormularioPerfil rol={necesario} textoBoton="Continuar" />
        {pathname.startsWith('/verificacion') && (
          <p className="text-xs text-suave">
            Si ya habías empezado una verificación en este navegador y perdiste la sesión, no podremos recuperarla: pide a la otra parte que te
            reenvíe el enlace.
          </p>
        )}
      </Tarjeta>
    );
  }

  if (cambioAutomatico) {
    return error ? (
      <Aviso tipo="alerta" className="mx-auto max-w-md">
        {error}
      </Aviso>
    ) : (
      <Cargando texto="Un momento…" />
    );
  }

  if (!rolCorrecto && perfil) {
    return (
      <Tarjeta className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-alerta-claro text-alerta">
          <IconoCandado tamano={22} />
        </div>
        <h1 className="text-lg font-bold">Esta sección es solo para personal veterinario</h1>
        <p className="mt-1 text-sm text-suave">
          Ahora mismo estás como {ETIQUETA_ROL[perfil.rol].toLowerCase()}. Las lecturas de microchip quedan firmadas por quien las hace, por eso este
          perfil no se cambia solo.
        </p>
        <BotonEnlace to="/" variante="secundario" className="mt-4">
          Volver al inicio
        </BotonEnlace>
      </Tarjeta>
    );
  }

  return <>{children}</>;
}
