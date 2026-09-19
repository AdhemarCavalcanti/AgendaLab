import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Login } from '../Login'
import { supabase } from '../../lib/supabase'
import * as AuthContextModule from '../../contexts/AuthContext'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Login Page', () => {
  const mockSignIn = vi.fn()
  const mockAtivarAluno = vi.fn()
  const mockAtivarAdmin = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockSignIn.mockResolvedValue({ error: null, role: 'aluno' })
    mockAtivarAluno.mockResolvedValue({ error: null })
    mockAtivarAdmin.mockResolvedValue({ error: null })

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: null,
      user: null,
      role: null,
      perfil: null,
      meuIdUsuario: null,
      meuIdAdm: null,
      loading: false,
      signIn: mockSignIn,
      ativarCadastroUsuario: mockAtivarAluno,
      ativarCadastroAdmin: mockAtivarAdmin,
      signOut: vi.fn(),
      refreshPerfil: vi.fn(),
    })

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'uuid-aluno-1' } } as any },
      error: null,
    } as any)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'administradores') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any
      }
      if (table === 'usuarios') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_usuario: 1, uuid: 'uuid-aluno-1', nome: 'Aluno Teste', email: 'aluno@ufpe.br' },
            error: null,
          }),
        } as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any
    })
  })

  it('renderiza o formulário de login por padrão', () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByText('Entrar no ReservaAI')).toBeInTheDocument()
    const submitBtn = container.querySelector('button[type="submit"]')
    expect(submitBtn).toBeInTheDocument()
    expect(submitBtn?.textContent).toBe('entrar')
  })

  it('redireciona para a tela principal se o usuário já estiver autenticado', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-aluno-1' } } as any,
      user: { id: 'uuid-aluno-1' } as any,
      role: 'aluno',
      perfil: { id_usuario: 1, nome: 'Aluno Teste' } as any,
      meuIdUsuario: 1,
      meuIdAdm: null,
      loading: false,
      signIn: mockSignIn,
      ativarCadastroUsuario: mockAtivarAluno,
      ativarCadastroAdmin: mockAtivarAdmin,
      signOut: vi.fn(),
      refreshPerfil: vi.fn(),
    })

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('permite submeter login com e-mail e senha e redireciona', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    const inputEmail = screen.getByPlaceholderText('voce@universidade.edu')
    const inputSenha = screen.getByPlaceholderText('••••••••')

    await user.type(inputEmail, 'aluno@ufpe.br')
    await user.type(inputSenha, '123456')

    const submitBtn = container.querySelector('button[type="submit"]')!
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('aluno@ufpe.br', '123456')
      expect(mockNavigate).toHaveBeenCalledWith('/', expect.objectContaining({ replace: true }))
    })
  })

  it('permite alternar para aba de ativação de usuário e submeter ativação com matrícula', async () => {
    const user = userEvent.setup()
    mockAtivarAluno.mockResolvedValue({ error: null })

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    // Clica na aba de ativação de usuário
    const tabAtivarUsuario = screen.getByRole('button', { name: /ativar \(usuário\)/i })
    await user.click(tabAtivarUsuario)

    expect(screen.getByText('Ativar meu cadastro')).toBeInTheDocument()

    const inputEmail = screen.getByPlaceholderText('voce@universidade.edu')
    const inputMatricula = screen.getByPlaceholderText('Ex: 2023001234')
    const inputSenha = screen.getByPlaceholderText('mínimo 6 caracteres')

    await user.type(inputEmail, 'novo@ufpe.br')
    await user.type(inputMatricula, '20241010')
    await user.type(inputSenha, 'senhaSegura')

    const btnAtivar = screen.getByRole('button', { name: /ativar cadastro/i })
    await user.click(btnAtivar)

    await waitFor(() => {
      expect(mockAtivarAluno).toHaveBeenCalledWith({
        matricula: '20241010',
        email: 'novo@ufpe.br',
        password: 'senhaSegura',
      })
    })
  })

  it('exibe mensagem de erro na tela quando as credenciais forem inválidas', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue({ error: 'E-mail ou senha inválidos.', role: null })

    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    const inputEmail = screen.getByPlaceholderText('voce@universidade.edu')
    const inputSenha = screen.getByPlaceholderText('••••••••')

    await user.type(inputEmail, 'errado@ufpe.br')
    await user.type(inputSenha, 'senha-errada')

    const submitBtn = container.querySelector('button[type="submit"]')!
    await user.click(submitBtn)

    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeInTheDocument()
  })
})
