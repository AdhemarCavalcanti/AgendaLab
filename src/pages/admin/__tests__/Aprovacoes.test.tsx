import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminAprovacoes } from '../Aprovacoes'
import { supabase } from '../../../lib/supabase'
import * as AuthContextModule from '../../../contexts/AuthContext'

vi.mock('../../../lib/supabase', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  return {
    supabase: {
      from: vi.fn(),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  }
})

describe('AdminAprovacoes Page', () => {
  const mockSalasPendentes = [
    {
      id: 1,
      id_sala: 10,
      inicio: '2026-10-20T10:00:00.000Z',
      fim: '2026-10-20T12:00:00.000Z',
      motivo: 'Aula Prática',
      quantidade_pessoas: 15,
      status: 'pendente',
      usuarios: { nome: 'Carlos Aluno', email: 'carlos@ufpe.br', matricula: '20231' },
    },
  ]

  const mockEquipDevolucoes = [
    {
      id: 5,
      id_equipamento: 20,
      inicio: '2026-10-19T09:00:00.000Z',
      fim: '2026-10-19T11:00:00.000Z',
      observacao: 'Uso em bancada',
      quantidade: 1,
      status: 'aprovada',
      status_devolucao: 'pendente',
      usuarios: { nome: 'Ana Pesquisadora', email: 'ana@ufpe.br', matricula: '20232' },
    },
  ]

  const mockUpdateChain = {
    select: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: [{ id: 1 }], error: null }).then(resolve, reject)
    },
  }

  const mockUpdateSalas = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue(mockUpdateChain),
  })
  const mockUpdateEquip = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 5 }], error: null }),
    }),
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-admin' } } as any,
      user: { id: 'uuid-admin' } as any,
      role: 'admin',
      perfil: { id_adm: 3, nome: 'Admin Chefe' } as any,
      meuIdUsuario: null,
      meuIdAdm: 3,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: vi.fn(),
      refreshPerfil: vi.fn(),
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'reservas_salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockSalasPendentes, error: null }),
          update: mockUpdateSalas,
        } as any
      }
      if (table === 'reservas_equipamentos') {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (col === 'status_devolucao' && val === 'pendente') {
              return {
                order: vi.fn().mockResolvedValue({ data: mockEquipDevolucoes, error: null }),
              }
            }
            return chain
          }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          update: mockUpdateEquip,
        }
        return chain as any
      }
      if (table === 'salas') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id_sala: 10, nome: 'Laboratório Beta' }], error: null }),
        } as any
      }
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id: 20, nome: 'Multímetro Digital' }], error: null }),
        } as any
      }
      return { select: vi.fn().mockReturnThis() } as any
    })
  })

  it('lista solicitações pendentes e permite aprovação', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminAprovacoes />
      </MemoryRouter>
    )

    expect(await screen.findByText(/Laboratório Beta/i)).toBeInTheDocument()
    expect(screen.getByText(/Carlos Aluno/i)).toBeInTheDocument()

    const btnAprovar = screen.getByRole('button', { name: /aprovar/i })
    await user.click(btnAprovar)

    await waitFor(() => {
      expect(mockUpdateSalas).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'aprovada',
          id_adm: 3,
        })
      )
    })
  })

  it('abre modal de cancelamento/rejeição, preenche justificativa e confirma', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminAprovacoes />
      </MemoryRouter>
    )

    await screen.findByText(/Laboratório Beta/i)

    const btnCancelar = screen.getByRole('button', { name: /^cancelar$/i })
    await user.click(btnCancelar)

    expect(screen.getByText('Cancelar reserva')).toBeInTheDocument()

    const inputJustificativa = screen.getByPlaceholderText(/Explique o motivo do cancelamento…/i)
    await user.type(inputJustificativa, 'Horário em manutenção técnica')

    const btnConfirmar = screen.getByRole('button', { name: /confirmar cancelamento/i })
    await user.click(btnConfirmar)

    await waitFor(() => {
      expect(mockUpdateSalas).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelada',
          id_adm: 3,
          motivo: 'Horário em manutenção técnica',
        })
      )
    })
  })

  it('alterna para aba de devoluções e registra devolução de equipamento', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminAprovacoes />
      </MemoryRouter>
    )

    await screen.findByText(/Laboratório Beta/i)

    const tabDevolucoes = screen.getByRole('button', { name: /Pedidos para devolução/i })
    await user.click(tabDevolucoes)

    expect(await screen.findByText(/Multímetro Digital/i)).toBeInTheDocument()
    expect(screen.getByText(/Ana Pesquisadora/i)).toBeInTheDocument()

    const btnDevolver = screen.getByRole('button', { name: /devolvido/i })
    await user.click(btnDevolver)

    await waitFor(() => {
      expect(mockUpdateEquip).toHaveBeenCalledWith(
        expect.objectContaining({
          status_devolucao: 'devolvido',
          id_adm: 3,
        })
      )
    })
  })
})
