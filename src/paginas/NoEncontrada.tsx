import { BotonEnlace } from '../componentes/Boton';
import { IconoPata } from '../componentes/Iconos';
import { Vacio } from '../componentes/ui';

export function NoEncontrada() {
  return (
    <div className="mx-auto max-w-md py-10">
      <Vacio icono={<IconoPata />} titulo="Página no encontrada">
        <p className="mb-3">El enlace no existe o cambió. Las fichas de caso usan siempre la dirección /caso/…</p>
        <BotonEnlace to="/" tamano="sm">
          Ir al inicio
        </BotonEnlace>
      </Vacio>
    </div>
  );
}
