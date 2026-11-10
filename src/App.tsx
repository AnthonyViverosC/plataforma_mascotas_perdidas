import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Ayuda } from './paginas/Ayuda';
import { Buscar } from './paginas/Buscar';
import { BuscarPorFoto } from './paginas/BuscarPorFoto';
import { Cartel } from './paginas/Cartel';
import { Caso } from './paginas/Caso';
import { Entrar } from './paginas/Entrar';
import { Estadisticas } from './paginas/Estadisticas';
import { ImportarCasos } from './paginas/ImportarCasos';
import { Inicio } from './paginas/Inicio';
import { MascotaFormulario } from './paginas/MascotaFormulario';
import { NoEncontrada } from './paginas/NoEncontrada';
import { Notificaciones } from './paginas/Notificaciones';
import { NuevoCaso } from './paginas/NuevoCaso';
import { Panel } from './paginas/Panel';
import { PlacaMascota } from './paginas/PlacaMascota';
import { PlacaPublica } from './paginas/PlacaPublica';
import { Reportar } from './paginas/Reportar';
import { Reporte } from './paginas/Reporte';
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
        <Route path="buscar-foto" element={<BuscarPorFoto />} />
        <Route path="estadisticas" element={<Estadisticas />} />
        <Route path="ayuda" element={<Ayuda />} />
        <Route path="reportar" element={<Reportar />} />
        {/* Página pública que abre quien escanea el QR de una placa (HU-11). */}
        <Route path="placa/:codigo" element={<PlacaPublica />} />
        <Route path="caso/:id" element={<Caso />} />
        <Route path="caso/:id/cartel" element={<Cartel />} />
        <Route path="reporte/:id" element={<Reporte />} />
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
          path="mascotas/:id/placa"
          element={
            <RutaProtegida roles={['PROPIETARIO', 'ADMIN']}>
              <PlacaMascota />
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
        {/* Sin RutaProtegida: los datos de la persona son el paso 1 del asistente. */}
        <Route path="casos/nuevo" element={<NuevoCaso />} />
        <Route
          path="verificacion/:id"
          element={
            <RutaProtegida>
              <Verificacion />
            </RutaProtegida>
          }
        />
        <Route
          path="importar"
          element={
            <RutaProtegida roles={['COORDINADOR']}>
              <ImportarCasos />
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
