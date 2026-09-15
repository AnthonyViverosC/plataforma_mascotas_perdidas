import { useState, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { FormularioPerfil } from '../componentes/FormularioPerfil';
import { IconoChip, IconoFlechaIzq, IconoOjo, IconoPata } from '../componentes/Iconos';
import { Aviso, Cargando, EncabezadoPagina, EtiquetaSeccion, Tarjeta } from '../componentes/ui';
import { useSesion } from '../hooks/useSesion';
import { mensajeError, supabase } from '../lib/supabase';
import { ETIQUETA_ROL, type Rol } from '../tipos/tipos';

type RolElegible = Exclude<Rol, 'ADMIN'>;

const PERFILES: { rol: RolElegible; titulo: string; icono: ReactNode; puede: string[] }[] = [
  {
    rol: 'PROPIETARIO',
    titulo: 'Soy dueño de una mascota',
    icono: <IconoPata />,
    puede: ['Registrar mi mascota y reportar su pérdida', 'Confirmar o descartar coincidencias', 'Seguir la ficha única del caso'],
  },
  {
    rol: 'CIUDADANO',
    titulo: 'Encontré una mascota',
    icono: <IconoOjo />,
    puede: ['Reportar un hallazgo o avistamiento', 'Verificar con preguntas reservadas a quien la reclama'],
  },
  {
    rol: 'VETERINARIO',
    titulo: 'Soy auxiliar veterinario',
    icono: <IconoChip />,
    puede: ['Registrar la lectura de un microchip en consulta', 'Dejar constancia de dónde y cuándo apareció'],
  },
];

// Cuentas creadas por supabase/seed.sql: permiten recorrer la demo con los casos ya sembrados.
const DEMO: { email: string; nombre: string; rol: RolElegible }[] = [
  { email: 'propietario@chippet.test', nombre: 'Laura Gómez', rol: 'PROPIETARIO' },
  { email: 'ciudadano@chippet.test', nombre: 'Andrés Ruiz', rol: 'CIUDADANO' },
  { email: 'veterinario@chippet.test', nombre: 'Dra. Paula Ortiz', rol: 'VETERINARIO' },
];
const CLAVE_DEMO = 'Prueba2026!';

/** Elegir perfil: reemplaza al login y al registro. */
export function Entrar() {
  const { usuario, perfil } = useSesion();
  const [params] = useSearchParams();
  const volver = params.get('volver');
  const [elegido, setElegido] = useState<RolElegible | null>(null);
  const [entrandoDemo, setEntrandoDemo] = useState<string | null>(null);
  const [errorDemo, setErrorDemo] = useState<string | null>(null);

  if (usuario) {
    if (!perfil) return <Cargando texto="Preparando tu perfil…" />;
    const inicio = perfil.rol === 'VETERINARIO' ? '/veterinario' : '/panel';
    const destino = volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : inicio;
    return <Navigate to={destino} replace />;
  }

  const entrarDemo = async (email: string) => {
    setErrorDemo(null);
    setEntrandoDemo(email);
    const { error } = await supabase.auth.signInWithPassword({ email, password: CLAVE_DEMO });
    setEntrandoDemo(null);
    if (error) setErrorDemo(mensajeError(error));
  };

  const perfilElegido = PERFILES.find((p) => p.rol === elegido);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EncabezadoPagina
        etiqueta="Sin contraseñas"
        titulo="¿Quién eres?"
        descripcion="Elige tu perfil y deja tu nombre y un teléfono. No necesitas correo ni contraseña."
      />
      {volver && !perfilElegido && <Aviso tipo="info">Elige tu perfil para continuar.</Aviso>}

      {perfilElegido ? (
        <Tarjeta className="mx-auto max-w-lg space-y-4 p-5">
          <button
            type="button"
            onClick={() => setElegido(null)}
            className="flex items-center gap-1 text-xs font-semibold text-suave hover:text-tinta"
          >
            <IconoFlechaIzq tamano={14} /> Cambiar perfil
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-acento-claro text-acento">{perfilElegido.icono}</span>
            <div>
              <p className="text-sm font-bold">{perfilElegido.titulo}</p>
              <p className="text-xs text-suave">Entrarás como {ETIQUETA_ROL[perfilElegido.rol]}</p>
            </div>
          </div>
          <FormularioPerfil rol={perfilElegido.rol} />
          <p className="text-[11px] text-suave">Tu perfil queda guardado en este navegador. Si sales, entrarás con un perfil nuevo.</p>
        </Tarjeta>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {PERFILES.map((p) => (
            <button
              key={p.rol}
              type="button"
              onClick={() => setElegido(p.rol)}
              className="flex flex-col gap-3 rounded-xl border border-borde bg-white p-4 text-left shadow-tarjeta transition hover:-translate-y-0.5 hover:border-acento/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-acento-claro text-acento">{p.icono}</span>
              <span className="text-sm font-bold">{p.titulo}</span>
              <ul className="space-y-1 text-xs text-suave">
                {p.puede.map((x) => (
                  <li key={x}>· {x}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      )}

      <Tarjeta className="space-y-3 p-4">
        <EtiquetaSeccion>Perfiles de demostración</EtiquetaSeccion>
        <p className="text-xs text-suave">Entra con un clic a los perfiles del seed, que ya tienen casos, coincidencias y verificaciones.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {DEMO.map((d) => (
            <Boton key={d.email} variante="secundario" onClick={() => entrarDemo(d.email)} cargando={entrandoDemo === d.email} disabled={Boolean(entrandoDemo)}>
              {d.nombre} · {ETIQUETA_ROL[d.rol]}
            </Boton>
          ))}
        </div>
        {errorDemo && <Aviso tipo="alerta">{errorDemo}</Aviso>}
      </Tarjeta>
    </div>
  );
}
