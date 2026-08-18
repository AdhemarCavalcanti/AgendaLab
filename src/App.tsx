import { BrowserRouter, Route, Routes } from 'react-router-dom'
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
              <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
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
            </Routes>
          </main>
          <footer className="border-t border-(--color-border) py-6 text-center font-mono text-xs text-(--color-ink-soft)">
            AgendaLab · MVP · React + Supabase
          </footer>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
