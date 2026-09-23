import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { Navbar } from './components/Navbar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Catalogo } from './pages/Catalogo'
import { RecursoAgenda } from './pages/RecursoAgenda'
import { MinhasReservas } from './pages/MinhasReservas'
import { AdminRecursos } from './pages/admin/Recursos'
import { AdminAprovacoes } from './pages/admin/Aprovacoes'
import { AdminReservas } from './pages/admin/Reservas'
import { AdminGestaoUsuarios } from './pages/admin/GestaoUsuarios'
import { AdminDashboard } from './pages/admin/Dashboard'
import { Perfil } from './pages/Perfil'
import { AdminPlanos } from './pages/admin/Planos'
import { AdminAcompanhamentoRecursos } from './pages/admin/AcompanhamentoRecursos'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex min-h-screen flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Catalogo />} />
              <Route path="/login" element={<Login />} />
              <Route path="/planos" element={<AdminPlanos />} />
              <Route path="/admin/planos" element={<Navigate to="/planos" replace />} />
              <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
              <Route
                path="/perfil"
                element={
                  <ProtectedRoute allow={['aluno', 'admin']}>
                    <Perfil />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/minhas-reservas"
                element={
                  <ProtectedRoute allow={['aluno']}>
                    <MinhasReservas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/recursos"
                element={
                  <ProtectedRoute allow={['admin']}>
                    <AdminRecursos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/aprovacoes"
                element={
                  <ProtectedRoute allow={['admin']}>
                    <AdminAprovacoes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/reservas"
                element={
                  <ProtectedRoute allow={['admin']}>
                    <AdminReservas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/usuarios"
                element={
                  <ProtectedRoute allow={['admin']}>
                    <AdminGestaoUsuarios />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute allow={['admin']}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
<<<<<<< Updated upstream
=======
              <Route path="/admin/planos" element={<AdminPlanos />} />
              <Route
                path="/admin/acompanhamento"
                element={
                  <ProtectedRoute allow={['admin']}>
                    <AdminAcompanhamentoRecursos />
                  </ProtectedRoute>
                }
              />
>>>>>>> Stashed changes
            </Routes>
          </main>
          <footer className="border-t border-(--color-border)/80 py-7 text-center text-xs text-(--color-ink-soft)">
            ReservaAI · reservas corporativas de salas, equipamentos e objetos
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
