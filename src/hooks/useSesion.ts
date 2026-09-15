import { useContext } from 'react';
import { SesionContexto, type ValorSesion } from './sesionContexto';

export function useSesion(): ValorSesion {
  const valor = useContext(SesionContexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>.');
  return valor;
}
