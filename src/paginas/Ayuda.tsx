import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconoBuscar } from '../componentes/Iconos';
import { EncabezadoPagina, EtiquetaSeccion, Tarjeta, Vacio } from '../componentes/ui';

interface Pregunta {
  p: string;
  r: ReactNode;
  /** Texto plano para el buscador. */
  claves: string;
}

const enlace = (a: string, t: string) => (
  <Link to={a} className="font-semibold text-acento hover:underline">
    {t}
  </Link>
);

const GRUPOS: { titulo: string; preguntas: Pregunta[] }[] = [
  {
    titulo: 'Si encontraste o viste un animal',
    preguntas: [
      {
        p: '¿Qué hago si veo un perro o un gato que parece perdido?',
        r: (
          <>
            Abre {enlace('/reportar', 'Encontré una mascota')}. Primero te mostramos las mascotas perdidas: si la reconoces, tócala y avisamos a su
            dueño. Si no, sube una foto y marca dónde la viste; el sistema la cruza con todos los casos de pérdida.
          </>
        ),
        claves: 'vi perro gato perdido calle reportar foto',
      },
      {
        p: '¿Sirve reportar aunque el animal ya se haya ido?',
        r: 'Sí. Elige "Se fue" en el estado del animal. Cada avistamiento ayuda a trazar hacia dónde se mueve.',
        claves: 'se fue ya no esta avistamiento',
      },
      {
        p: 'La ficha dice "huraña" o "puede morder". ¿Qué hago?',
        r: 'No intentes atraparla: se asusta y puede huir más lejos o morder. Mantén distancia, repórtala desde el sitio y espera a su familia.',
        claves: 'hurana muerde atrapar miedo',
      },
      {
        p: 'Escaneé el código QR de una placa. ¿Y ahora?',
        r: 'Verás la foto y el nombre de la mascota. Deja tu nombre, tu celular y un mensaje: le llega al dueño como aviso. Nunca mostramos su teléfono en la placa.',
        claves: 'qr placa escanear collar',
      },
    ],
  },
  {
    titulo: 'Si perdiste a tu mascota',
    preguntas: [
      {
        p: '¿Cómo publico que perdí a mi mascota?',
        r: (
          <>
            En {enlace('/casos/nuevo', 'Perdí mi mascota')}: tus datos, los de tu mascota y dónde se perdió. Te pedimos 3 preguntas que solo tú sabes
            responder; sirven para comprobar que es tuya cuando alguien la encuentre.
          </>
        ),
        claves: 'perdi publicar caso nuevo',
      },
      {
        p: '¿Cómo me entero si alguien la vio?',
        r: 'El sistema compara cada reporte con tu caso y te avisa en Notificaciones. En la ficha verás los avistamientos numerados y unidos por una línea en orden de fecha.',
        claves: 'aviso notificacion coincidencia avistamiento mapa ruta',
      },
      {
        p: '¿Cómo la difundo en mi barrio?',
        r: 'En la ficha, "Ayuda a difundir": compártela por WhatsApp con un texto ya escrito (sin tu teléfono) o imprime el cartel en blanco y negro con un QR que abre la ficha.',
        claves: 'difundir compartir whatsapp cartel imprimir poster',
      },
      {
        p: 'Mi ficha lleva días sin avisos. ¿Qué puedo hacer?',
        r: 'Amplía el radio de búsqueda desde la ficha y vuelve a compartirla. Tu panel te recuerda cuando una ficha lleva 3 días o más sin movimiento.',
        claves: 'dias sin avisos inactiva radio ampliar',
      },
      {
        p: '¿Qué es la placa con código QR?',
        r: 'Una placa para el collar. Si alguien la escanea, ve los datos básicos de tu mascota y te deja un aviso. Se pide desde tu panel, en "Placa QR".',
        claves: 'placa qr collar pedir',
      },
    ],
  },
  {
    titulo: 'Privacidad y seguridad',
    preguntas: [
      {
        p: '¿Necesito crear una cuenta?',
        r: 'No. Solo te pedimos un nombre y un celular cuando hace falta, por ejemplo al reportar. No hay contraseñas.',
        claves: 'cuenta registro contrasena login',
      },
      {
        p: '¿Quién ve mi ubicación y mi teléfono?',
        r: 'La ubicación pública de un caso se desplaza entre 100 y 300 m para proteger tu casa; solo tú ves el punto exacto. El teléfono del dueño aparece mientras el caso está abierto y desaparece al cerrarlo.',
        claves: 'privacidad ubicacion telefono datos',
      },
      {
        p: '¿Cómo evitan que alguien reclame una mascota que no es suya?',
        r: 'Antes de la entrega, quien la reclama responde 3 preguntas reservadas. Las respuestas correctas nunca salen de la base de datos, y quien encontró al animal debe aprobar la entrega.',
        claves: 'robo reclamar verificar preguntas entrega',
      },
      {
        p: '¿La búsqueda por foto reconoce a mi mascota?',
        r: (
          <>
            No exactamente. {enlace('/buscar-foto', 'Buscar por foto')} compara colores y forma general, así que ordena los casos por parecido. Confírmalo
            siempre en la ficha. Tu foto no se sube: se analiza en tu celular.
          </>
        ),
        claves: 'foto reconocimiento parecido semejanza',
      },
    ],
  },
  {
    titulo: 'Veterinarias y fundaciones',
    preguntas: [
      {
        p: 'Soy auxiliar veterinario. ¿Cómo registro un microchip?',
        r: 'En "Leer microchip" escribe los 15 dígitos. Si la mascota tiene un caso abierto, se avisa a su dueño; si está registrada sin caso, se abre un hallazgo a tu nombre.',
        claves: 'veterinario microchip lectura chip',
      },
      {
        p: 'Coordino una fundación. ¿Puedo subir los casos de nuestro grupo de WhatsApp?',
        r: (
          <>
            Sí, en {enlace('/importar', 'Importar casos')}. Pega la conversación exportada: tapamos los celulares, tú revisas cada caso, le pones foto y zona, y
            se publican como reportes. Volver a pegar la misma conversación no duplica nada.
          </>
        ),
        claves: 'fundacion whatsapp importar grupo coordinador',
      },
    ],
  },
];

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Ayuda() {
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const n = normalizar(q.trim());
    if (!n) return GRUPOS;
    return GRUPOS.map((g) => ({
      ...g,
      preguntas: g.preguntas.filter((p) => normalizar(`${p.p} ${p.claves}`).includes(n)),
    })).filter((g) => g.preguntas.length > 0);
  }, [q]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EncabezadoPagina etiqueta="Centro de ayuda" titulo="¿En qué te ayudamos?" descripcion="Respuestas cortas a las dudas más comunes." />
      <label className="relative block">
        <span className="sr-only">Buscar en la ayuda</span>
        <IconoBuscar tamano={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-suave" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej.: placa, privacidad, microchip…"
          className="h-11 w-full rounded-lg border border-borde bg-white pl-9 pr-3 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/30"
        />
      </label>

      {filtrados.length === 0 ? (
        <Vacio icono={<IconoBuscar />} titulo="No encontramos esa duda">
          Prueba con otra palabra.
        </Vacio>
      ) : (
        filtrados.map((g) => (
          <section key={g.titulo} className="space-y-2">
            <EtiquetaSeccion>{g.titulo}</EtiquetaSeccion>
            <Tarjeta className="divide-y divide-borde">
              {g.preguntas.map((p) => (
                <details key={p.p} className="group p-4" open={Boolean(q.trim())}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-tinta">
                    {p.p}
                    <span className="text-lg leading-none text-suave transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <div className="mt-2 text-sm leading-relaxed text-suave">{p.r}</div>
                </details>
              ))}
            </Tarjeta>
          </section>
        ))
      )}
    </div>
  );
}
