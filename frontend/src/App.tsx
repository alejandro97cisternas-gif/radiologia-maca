import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ConfigProvider, Spin } from 'antd'
import esES from 'antd/locale/es_ES'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DerivadoresPage from './pages/DerivadoresPage'
import HonorariosPage from './pages/HonorariosPage'
import AppLayout from './components/AppLayout'
import PortalAcceso from './pages/portal/PortalAcceso'
import PortalDashboard from './pages/portal/PortalDashboard'
import PortalNuevoPaciente from './pages/portal/PortalNuevoPaciente'
import PortalExamen from './pages/portal/PortalExamen'
import PortalTarifas from './pages/portal/PortalTarifas'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'

function ProtectedRoutes() {
  const { token, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <Spin fullscreen />
  if (!token) return <Navigate to="/login" replace />

  const isDashboard = location.pathname === '/'

  return (
    <AppLayout noPadding={isDashboard}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/derivadores" element={<DerivadoresPage />} />
        <Route path="/honorarios" element={<HonorariosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <ConfigProvider locale={esES} theme={{ token: { colorPrimary: '#2563EB' } }}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/portal/acceder" element={<PortalAcceso />} />
            <Route path="/portal/acceder/:slug" element={<PortalAcceso />} />
            <Route path="/portal/dashboard" element={<PortalDashboard />} />
            <Route path="/portal/nuevo-paciente" element={<PortalNuevoPaciente />} />
            <Route path="/portal/examen/:id" element={<PortalExamen />} />
            <Route path="/portal/tarifas" element={<PortalTarifas />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  )
}
