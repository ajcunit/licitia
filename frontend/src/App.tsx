import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import SetupGuard from './components/SetupGuard';
import Dashboard from './pages/Dashboard';
import Contratos from './pages/Contratos';
import Contratacion from './pages/Contratacion';
import ContratoDetalle from './pages/ContratoDetalle';
import Duplicados from './pages/Duplicados';
import Sincronizacion from './pages/Sincronizacion';
import Departamentos from './pages/Departamentos';
import DepartamentoDetalle from './pages/DepartamentoDetalle';
import Empleados from './pages/Empleados';
import EmpleadoDetalle from './pages/EmpleadoDetalle';
import BusquedaCPV from './pages/BusquedaCPV';
import ConfiguracionPage from './pages/ConfiguracionPage';
import SuperBuscador from './pages/SuperBuscador';
import SuperContratoDetalle from './pages/SuperContratoDetalle';
import Credits from './pages/Credits';
import ContratosMenores from './pages/ContratosMenores';
import ContratoMenorDetalle from './pages/ContratoMenorDetalle';
import Favoritos from './pages/Favoritos';
import Adjudicatarios from './pages/Adjudicatarios';
import AdjudicatarioDetalle from './pages/AdjudicatarioDetalle';
import Auditoria from './pages/Auditoria';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import ProtectedRoute from './components/ProtectedRoute';
import PlaContractacio from './pages/PlaContractacio';

function App() {
    return (
        <BrowserRouter>
            <SetupGuard>
                <Routes>
                    <Route path="/setup" element={<SetupWizard />} />
                    <Route path="/login" element={<Login />} />
                    
                    <Route element={<ProtectedRoute />}>
                        <Route path="/" element={<Layout />}>
                            <Route index element={<Navigate to="/dashboard" replace />} />
                            <Route path="dashboard" element={<Dashboard />} />
                            <Route path="contratacion" element={<Contratacion />} />
                            <Route path="contratos" element={<Contratos />} />
                            <Route path="contratos/:id" element={<ContratoDetalle />} />
                            <Route path="duplicados" element={<Duplicados />} />
                            <Route path="sincronizacion" element={<Sincronizacion />} />
                            <Route path="departamentos" element={<Departamentos />} />
                            <Route path="departamentos/:id" element={<DepartamentoDetalle />} />
                            <Route path="empleados" element={<Empleados />} />
                            <Route path="empleados/:id" element={<EmpleadoDetalle />} />
                            <Route path="cpv" element={<BusquedaCPV />} />
                            <Route path="superbuscador" element={<SuperBuscador />} />
                            <Route path="superbuscador/:id" element={<SuperContratoDetalle />} />
                            <Route path="favoritos" element={<Favoritos />} />
                            <Route path="adjudicatarios" element={<Adjudicatarios />} />
                            <Route path="adjudicatarios/:nombre" element={<AdjudicatarioDetalle />} />
                            <Route path="auditoria" element={<Auditoria />} />
                            <Route path="pla-contractacio" element={<PlaContractacio />} />
                            <Route path="configuracion" element={<ConfiguracionPage />} />
                            <Route path="credits" element={<Credits />} />
                            <Route path="contratos-menores" element={<ContratosMenores />} />
                            <Route path="contratos-menores/:id" element={<ContratoMenorDetalle />} />
                        </Route>
                    </Route>
                </Routes>
            </SetupGuard>
        </BrowserRouter>
    );
}

export default App;

