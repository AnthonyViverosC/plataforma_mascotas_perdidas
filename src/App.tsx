import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Buscar } from './paginas/Buscar';
import { Caso } from './paginas/Caso';
import { Entrar } from './paginas/Entrar';
import { Inicio } from './paginas/Inicio';
import { MascotaFormulario } from './paginas/MascotaFormulario';
import { NoEncontrada } from './paginas/NoEncontrada';
import { Notificaciones } from './paginas/Notificaciones';
import { NuevoCaso } from './paginas/NuevoCaso';
import { Panel } from './paginas/Panel';
import { Reportar } from './paginas/Reportar';
import { Verificacion } from './paginas/Verificacion';
import { Veterinario } from './paginas/Veterinario';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="entrar" element={<Entrar />} />
        {/* Rutas antiguas de login y registro */}
        <Route path="login" element={<Navigate to="/entrar" replace />} />
        <Route path="registro" element={<Navigate to="/entrar" replace />} />
        <Route path="buscar" element={<Buscar />} />
        <Route path="reportar" element={<Reportar />} />
        <Route path="caso/:id" element={<Caso />} />
        <Route
          path="panel"
          element={
            <RutaProtegida>
              <Panel />
            </RutaProtegida>
          }
        />
        <Route
          path="mascotas/nueva"
          element={
            <RutaProtegida roles={['PROPIETARIO', 'ADMIN']}>
              <MascotaFormulario />
            </RutaProtegida>
          }
        />
        <Route
          path="mascotas/:id"
          element={
            <RutaProtegida roles={['PROPIETARIO', 'ADMIN']}>
              <MascotaFormulario />
            </RutaProtegida>
          }
        />
        <Route
          path="casos/nuevo"
          element={
            <RutaProtegida roles={['PROPIETARIO', 'ADMIN']}>
              <NuevoCaso />
            </RutaProtegida>
          }
        />
        <Route
          path="verificacion/:id"
          element={
            <RutaProtegida>
              <Verificacion />
            </RutaProtegida>
          }
        />
        <Route
          path="veterinario"
          element={
            <RutaProtegida roles={['VETERINARIO']}>
              <Veterinario />
            </RutaProtegida>
          }
        />
        <Route
          path="notificaciones"
          element={
            <RutaProtegida>
              <Notificaciones />
            </RutaProtegida>
          }
        />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
