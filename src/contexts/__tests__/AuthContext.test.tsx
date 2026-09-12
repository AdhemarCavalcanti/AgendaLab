import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import { supabase } from '../../lib/supabase'

// Mock do módulo do supabase
vi.mock('../../lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
      },
      rpc: vi.fn(),
      from: vi.fn(),
    },
  }
})

function TestConsumer() {
  const { role, perfil, meuIdUsuario, meuIdAdm, loading, signIn, signOut, ativarCadastroUsuario, ativarCadastroAdmin } = useAuth()
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="role">{role ?? 'none'}</div>
      <div data-testid="user-id">{meuIdUsuario ?? 'none'}</div>
      <div data-testid="admin-id">{meuIdAdm ?? 'none'}</div>
      <div data-testid="perfil-nome">{perfil?.nome ?? 'none'}</div>
      <button onClick={() => signIn('teste@agendalab.com', '123456')}>Login</button>
      <button onClick={() => signOut()}>Logout</button>
      <button
        onClick={() =>
          ativarCadastroUsuario({ email: 'aluno@ufpe.br', password: 'password123', matricula: '202401' })
        }
      >
        Ativar Aluno
      </button>
      <button
        onClick={() =>
          ativarCadastroAdmin({ email: 'admin@ufpe.br', password: 'password123', codigo: 'ADM-99' })
        }
      >
        Ativar Admin
      </button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any)

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(() => {
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      } as any
    })
  })

  it('inicia sem sessão e com loading resolvido para ready', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('role').textContent).toBe('none')
  })

  it('resolve perfil de aluno com sucesso na inicialização', async () => {
    const mockUser = { id: 'uuid-aluno-1', email: 'aluno@ufpe.br' }
    const mockSession = { user: mockUser }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any)

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ tipo_perfil: 'aluno', id: 42 }],
      error: null,
    } as any)

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id_usuario: 42, nome: 'Estudante Teste', email: 'aluno@ufpe.br' },
        error: null,
      }),
    } as any)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('role').textContent).toBe('aluno')
    expect(screen.getByTestId('user-id').textContent).toBe('42')
    expect(screen.getByTestId('perfil-nome').textContent).toBe('Estudante Teste')
  })

  it('resolve perfil de administrador com sucesso na inicialização', async () => {
    const mockUser = { id: 'uuid-admin-1', email: 'admin@ufpe.br' }
    const mockSession = { user: mockUser }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any)

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ tipo_perfil: 'admin', id: 10 }],
      error: null,
    } as any)

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id_adm: 10, nome: 'Administrador Chefe', email: 'admin@ufpe.br' },
        error: null,
      }),
    } as any)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('role').textContent).toBe('admin')
    expect(screen.getByTestId('admin-id').textContent).toBe('10')
    expect(screen.getByTestId('perfil-nome').textContent).toBe('Administrador Chefe')
  })

  it('realiza login e traduz erros conhecidos de autenticação', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as any)

    let contextValue: ReturnType<typeof useAuth> | null = null
    function CaptureContext() {
      contextValue = useAuth()
      return null
    }

    render(
      <AuthProvider>
        <CaptureContext />
      </AuthProvider>
    )

    const res = await act(async () => {
      return await contextValue!.signIn('errado@ufpe.br', 'senha-errada')
    })

    expect(res.error).toBe('E-mail ou senha inválidos.')
  })

  it('valida pré-cadastro e chama signUp ao ativar cadastro de aluno', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: true,
      error: null,
    } as any)

    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: 'uuid-novo' }, session: null },
      error: null,
    } as any)

    let contextValue: ReturnType<typeof useAuth> | null = null
    function CaptureContext() {
      contextValue = useAuth()
      return null
    }

    render(
      <AuthProvider>
        <CaptureContext />
      </AuthProvider>
    )

    const res = await act(async () => {
      return await contextValue!.ativarCadastroUsuario({
        email: 'novoaluno@ufpe.br',
        password: 'senhaSegura123',
        matricula: '202410',
      })
    })

    expect(res.error).toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('validar_pre_cadastro_usuario', {
      p_email: 'novoaluno@ufpe.br',
      p_matricula: '202410',
    })
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'novoaluno@ufpe.br',
      password: 'senhaSegura123',
      options: { data: { matricula: '202410' } },
    })
  })

  it('rejeita ativação de aluno se pré-cadastro não for encontrado', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: false,
      error: null,
    } as any)

    let contextValue: ReturnType<typeof useAuth> | null = null
    function CaptureContext() {
      contextValue = useAuth()
      return null
    }

    render(
      <AuthProvider>
        <CaptureContext />
      </AuthProvider>
    )

    const res = await act(async () => {
      return await contextValue!.ativarCadastroUsuario({
        email: 'naocadastrado@ufpe.br',
        password: 'senhaSegura123',
        matricula: '999999',
      })
    })

    expect(res.error).toContain('E-mail ou matrícula não autorizados')
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('encerra a sessão com signOut', async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as any)

    let contextValue: ReturnType<typeof useAuth> | null = null
    function CaptureContext() {
      contextValue = useAuth()
      return null
    }

    render(
      <AuthProvider>
        <CaptureContext />
      </AuthProvider>
    )

    await act(async () => {
      await contextValue!.signOut()
    })

    expect(supabase.auth.signOut).toHaveBeenCalled()
    expect(contextValue!.role).toBeNull()
    expect(contextValue!.perfil).toBeNull()
  })
})
