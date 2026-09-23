import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Navbar } from '../Navbar'
import * as AuthContextModule from '../../contexts/AuthContext'

vi.mock('../NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell">Sino</div>,
}))

describe('Navbar Component', () => {
  const mockSignOut = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza links públicos e botão de entrar para usuário não autenticado', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
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
      signOut: mockSignOut,
      refreshPerfil: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /Reserve\s*AI/i })).toBeInTheDocument()
    expect(screen.getByText('catálogo')).toBeInTheDocument()
    expect(screen.getByText('planos')).toBeInTheDocument()
    expect(screen.getByText(/entrar/i)).toBeInTheDocument()
    expect(screen.queryByText('minhas reservas')).not.toBeInTheDocument()
  })

  it('renderiza links de aluno quando logado como aluno', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-aluno' } } as any,
      user: { id: 'uuid-aluno' } as any,
      role: 'aluno',
      perfil: { id_usuario: 1, nome: 'Aluno João' } as any,
      meuIdUsuario: 1,
      meuIdAdm: null,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: mockSignOut,
      refreshPerfil: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    )

    expect(screen.getByText('minhas reservas')).toBeInTheDocument()
    expect(screen.getByText('planos')).toBeInTheDocument()
    expect(screen.getByText('perfil')).toBeInTheDocument()
    const alunoLinks = Array.from(document.querySelector('nav')!.querySelectorAll('a')).map((a) => a.textContent)
    expect(alunoLinks.at(-1)).toBe('planos')
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument()
  })

  it('renderiza links de admin quando logado como admin', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-admin' } } as any,
      user: { id: 'uuid-admin' } as any,
      role: 'admin',
      perfil: { id_adm: 1, nome: 'Admin Titular' } as any,
      meuIdUsuario: null,
      meuIdAdm: 1,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: mockSignOut,
      refreshPerfil: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    )

    expect(screen.getByText('recursos')).toBeInTheDocument()
    expect(screen.getByText('aprovações')).toBeInTheDocument()
    expect(screen.getByText('todas as reservas')).toBeInTheDocument()
    expect(screen.getByText('usuários')).toBeInTheDocument()
    expect(screen.getByText('dashboard')).toBeInTheDocument()
    expect(screen.getByText('planos')).toBeInTheDocument()
    const adminLinks = Array.from(document.querySelector('nav')!.querySelectorAll('a')).map((a) => a.textContent)
    expect(adminLinks.at(-1)).toBe('planos')
  })
})
