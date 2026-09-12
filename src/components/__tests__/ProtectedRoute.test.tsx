import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '../ProtectedRoute'
import * as AuthContextModule from '../../contexts/AuthContext'
import type { Role } from '../../lib/types'

describe('ProtectedRoute Component', () => {
  function renderWithAuth(
    authValues: Partial<ReturnType<typeof AuthContextModule.useAuth>>,
    allow?: Role[]
  ) {
    const defaultAuth: ReturnType<typeof AuthContextModule.useAuth> = {
      session: null,
      user: null,
      role: null,
      perfil: null,
      meuIdUsuario: null,
      meuIdAdm: null,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: vi.fn(),
      refreshPerfil: vi.fn(),
      ...authValues,
    }

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(defaultAuth)

    return render(
      <MemoryRouter initialEntries={['/protegida']}>
        <Routes>
          <Route path="/login" element={<div>Página de Login</div>} />
          <Route path="/" element={<div>Página Inicial / Catálogo</div>} />
          <Route
            path="/protegida"
            element={
              <ProtectedRoute allow={allow}>
                <div>Conteúdo Secreto Protegido</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )
  }

  it('exibe indicador de carregamento enquanto o estado de auth é resolvido', () => {
    renderWithAuth({ loading: true })
    expect(screen.getByText('carregando sessão…')).toBeInTheDocument()
  })

  it('redireciona usuário sem sessão para /login', () => {
    renderWithAuth({ loading: false, session: null })
    expect(screen.getByText('Página de Login')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo Secreto Protegido')).not.toBeInTheDocument()
  })

  it('exibe tela de acesso restrito para usuário autenticado sem permissão exigida', () => {
    const mockSession = { user: { id: 'uuid-1' } } as any
    renderWithAuth({ loading: false, session: mockSession, role: 'aluno' }, ['admin'])
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument()
    expect(screen.getByText(/Esta área é exclusiva para outro perfil de usuário/i)).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo Secreto Protegido')).not.toBeInTheDocument()
  })

  it('permite acesso quando o usuário possui a permissão adequada', () => {
    const mockSession = { user: { id: 'uuid-admin' } } as any
    renderWithAuth({ loading: false, session: mockSession, role: 'admin' }, ['admin'])
    expect(screen.getByText('Conteúdo Secreto Protegido')).toBeInTheDocument()
  })
})
