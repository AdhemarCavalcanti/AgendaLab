import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Perfil } from '../Perfil'
import { supabase } from '../../lib/supabase'
import * as AuthContextModule from '../../contexts/AuthContext'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
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

describe('Perfil Page & LGPD Account Deletion', () => {
  const mockSignOut = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-aluno-1' } } as any,
      user: { id: 'uuid-aluno-1' } as any,
      role: 'aluno',
      perfil: {
        id_usuario: 10,
        uuid: 'uuid-aluno-1',
        nome: 'Maria Silva',
        email: 'maria@ufpe.br',
        matricula: '20230101',
      },
      meuIdUsuario: 10,
      meuIdAdm: null,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: mockSignOut,
      refreshPerfil: vi.fn(),
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'reservas_salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 50,
                id_sala: 1,
                inicio: new Date(Date.now() + 86400000).toISOString(),
                fim: new Date(Date.now() + 90000000).toISOString(),
                status: 'aprovada',
              },
            ],
            error: null,
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'reservas_equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'salas') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id_sala: 1, nome: 'Laboratório Central' }], error: null }),
        } as any
      }
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        } as any
      }
      if (table === 'notificacoes') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'usuarios') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any
    })
  })

  it('exibe as informações cadastrais do usuário autenticado', () => {
    render(
      <MemoryRouter>
        <Perfil />
      </MemoryRouter>
    )

    expect(screen.getByText('Maria Silva')).toBeInTheDocument()
    expect(screen.getByText('maria@ufpe.br')).toBeInTheDocument()
    expect(screen.getByText('20230101')).toBeInTheDocument()
    expect(screen.getByText(/Zona de Perigo/i)).toBeInTheDocument()
  })

  it('abre modal de exclusão, lista reservas futuras ativas e exige digitação de EXCLUIR', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Perfil />
      </MemoryRouter>
    )

    const btnAbrirModal = screen.getByRole('button', { name: /Excluir minha conta/i })
    await user.click(btnAbrirModal)

    expect(screen.getByText('Excluir Conta e Anonimizar Dados')).toBeInTheDocument()
    expect(await screen.findByText('Laboratório Central')).toBeInTheDocument()
    expect(screen.getAllByText(/serão canceladas automaticamente/i).length).toBeGreaterThan(0)

    const btnConfirmar = screen.getByRole('button', { name: /confirmar exclusão definitiva/i })
    expect(btnConfirmar).toBeDisabled()

    const inputConfirmacao = screen.getByPlaceholderText('EXCLUIR')
    await user.type(inputConfirmacao, 'errado')
    expect(btnConfirmar).toBeDisabled()

    await user.clear(inputConfirmacao)
    await user.type(inputConfirmacao, 'EXCLUIR')
    expect(btnConfirmar).not.toBeDisabled()
  })

  it('executa exclusão de conta via RPC com sucesso, encerra sessão e redireciona', async () => {
    const user = userEvent.setup()
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    render(
      <MemoryRouter>
        <Perfil />
      </MemoryRouter>
    )

    const btnAbrirModal = screen.getByRole('button', { name: /Excluir minha conta/i })
    await user.click(btnAbrirModal)

    const inputConfirmacao = await screen.findByPlaceholderText('EXCLUIR')
    await user.type(inputConfirmacao, 'EXCLUIR')

    const btnConfirmar = screen.getByRole('button', { name: /confirmar exclusão definitiva/i })
    await user.click(btnConfirmar)

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('excluir_minha_conta')
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login', expect.objectContaining({ replace: true }))
    })
  })

  it('executa fallback no cliente quando a RPC ainda não existe, anonimizando dados e cancelando reservas', async () => {
    const user = userEvent.setup()
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function excluir_minha_conta does not exist' },
    } as any)

    render(
      <MemoryRouter>
        <Perfil />
      </MemoryRouter>
    )

    const btnAbrirModal = screen.getByRole('button', { name: /Excluir minha conta/i })
    await user.click(btnAbrirModal)

    const inputConfirmacao = await screen.findByPlaceholderText('EXCLUIR')
    await user.type(inputConfirmacao, 'EXCLUIR')

    const btnConfirmar = screen.getByRole('button', { name: /confirmar exclusão definitiva/i })
    await user.click(btnConfirmar)

    await waitFor(() => {
      // Verifica atualizações de fallback (cancelamento e anonimização)
      expect(supabase.from).toHaveBeenCalledWith('reservas_salas')
      expect(supabase.from).toHaveBeenCalledWith('reservas_equipamentos')
      expect(supabase.from).toHaveBeenCalledWith('notificacoes')
      expect(supabase.from).toHaveBeenCalledWith('usuarios')
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login', expect.objectContaining({ replace: true }))
    })
  })
})
