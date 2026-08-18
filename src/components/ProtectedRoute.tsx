import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Role } from '../lib/types'

export function ProtectedRoute({ children, allow }: { children: ReactNode; allow?: Role[] }) {
  const { session, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando sessão…</p>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (allow && !allow.includes(role)) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <h2 className="mb-2 text-2xl font-bold">Acesso restrito</h2>
        <p className="text-(--color-ink-soft)">Esta área é exclusiva para outro perfil de usuário.</p>
      </div>
    )
  }

  return <>{children}</>
}
