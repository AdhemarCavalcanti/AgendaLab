import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
      rpc: vi.fn(),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  }
})

describe('AdminAprovacoes Page', () => {
  let mockVistorias: any[] = []
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
      id_reserva_sala: 1,
      inicio: '2026-10-19T09:00:00.000Z',
      fim: '2026-10-19T11:00:00.000Z',
      observacao: 'Uso em bancada',
      quantidade: 1,
      status: 'aprovada',
      status_devolucao: 'pendente',
      reservas_salas: { id_sala: 10 },
      usuarios: { nome: 'Ana Pesquisadora', email: 'ana@ufpe.br', matricula: '20232' },
    },
  ]

  const mockEquipPendentes = [
    {
      id: 6,
      id_equipamento: 21,
      id_reserva_sala: 1,
      inicio: '2026-10-20T10:00:00.000Z',
      fim: '2026-10-20T12:00:00.000Z',
      quantidade: 2,
      status: 'pendente',
      usuarios: { nome: 'Carlos Aluno', email: 'carlos@ufpe.br', matricula: '20231' },
    },
  ]

  const mockAvarias = [
    {
      id: 50,
      id_usuario: 5,
      tipo_recurso: 'equipamento',
      id_recurso: 20,
      recurso_nome: 'Multímetro Digital',
      id_reserva_sala: null,
      id_reserva_equipamento: 5,
      severidade: 'critica',
      descricao: 'Display quebrado e cabos danificados',
      status: 'pendente',
      criado_em: '2026-09-20T10:00:00.000Z',
      usuarios: { nome: 'Carlos Aluno', email: 'carlos@ufpe.br', matricula: '20231' },
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
  const mockUpdateAvarias = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: [{ id: 50 }], error: null }),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockVistorias = []
    vi.mocked(supabase.rpc).mockImplementation(((_fn: string, params: any) => {
      mockVistorias.push({
        id: mockVistorias.length + 1,
        id_reserva_equipamento: params.p_id_reserva_equipamento,
        etapa: params.p_etapa,
        cabo_presente: params.p_cabo_presente,
        pecas_completas: params.p_pecas_completas,
        sem_danos_visiveis: params.p_sem_danos_visiveis,
        observacoes: params.p_observacoes,
        criado_em: '2026-10-19T09:00:00.000Z',
      })
      return Promise.resolve({ data: null, error: null })
    }) as any)

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
            if (col === 'status' && val === 'pendente') {
              return {
                order: vi.fn().mockResolvedValue({ data: mockEquipPendentes, error: null }),
              }
            }
            if (col === 'status_devolucao' && val === 'pendente') {
              return {
                order: vi.fn().mockImplementation(async () => ({
                  data: mockEquipDevolucoes.map((reserva) => ({
                    ...reserva,
                    vistorias_equipamentos: mockVistorias.filter((vistoria) => vistoria.id_reserva_equipamento === reserva.id),
                  })),
                  error: null,
                })),
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
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 20, nome: 'Multímetro Digital' },
              { id: 21, nome: 'Kit Didático' },
            ],
            error: null,
          }),
        } as any
      }
      if (table === 'relatos_avarias') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockAvarias, error: null }),
          update: mockUpdateAvarias,
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
    expect(screen.getByText(/Kit Didático × 2/i)).toBeInTheDocument()

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

  it('impede o cancelamento sem uma justificativa válida', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminAprovacoes />
      </MemoryRouter>
    )

    await screen.findByText(/Laboratório Beta/i)
    await user.click(screen.getByRole('button', { name: /^cancelar$/i }))

    const inputJustificativa = screen.getByRole('textbox', { name: /justificativa/i })
    expect(inputJustificativa).toBeRequired()

    await user.type(inputJustificativa, '   ')
    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a justificativa da recusa.')
    expect(mockUpdateSalas).not.toHaveBeenCalled()
  })

  it('exige checklist completo na entrega e registra a conferência do retorno com avaria', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminAprovacoes />
      </MemoryRouter>
    )

    await screen.findByText(/Laboratório Beta/i)

    const tabDevolucoes = screen.getByRole('button', { name: /Entrega e devolução/i })
    await user.click(tabDevolucoes)

    expect(await screen.findByText(/Multímetro Digital/i)).toBeInTheDocument()
    expect(screen.getByText(/Ana Pesquisadora/i)).toBeInTheDocument()
    expect(screen.getByText('Acessório de:', { exact: false }).parentElement).toHaveTextContent('Laboratório Beta')

    await user.click(screen.getByRole('button', { name: /vistoriar entrega/i }))
    await user.click(screen.getByRole('button', { name: /registrar vistoria/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Confira todos os itens')
    for (const grupo of ['Cabo presente', 'Peças completas', 'Sem danos visíveis']) {
      const sim = within(screen.getByRole('group', { name: grupo })).getByRole('radio', { name: 'Sim' })
      await user.click(sim)
      expect(sim).toBeChecked()
    }
    await user.click(screen.getByRole('button', { name: /registrar vistoria/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('registrar_vistoria_equipamento', expect.objectContaining({
        p_id_reserva_equipamento: 5,
        p_etapa: 'entrega',
        p_cabo_presente: true,
        p_pecas_completas: true,
        p_sem_danos_visiveis: true,
      }))
    })
    await user.click(await screen.findByRole('button', { name: /vistoriar devolução/i }))
    await user.click(screen.getByRole('group', { name: 'Cabo presente' }).querySelectorAll('input')[1])
    await user.click(screen.getByRole('group', { name: 'Peças completas' }).querySelectorAll('input')[0])
    await user.click(screen.getByRole('group', { name: 'Sem danos visíveis' }).querySelectorAll('input')[0])
    await user.click(screen.getByRole('button', { name: /registrar vistoria/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Descreva as peças ausentes')
    await user.type(screen.getByRole('textbox', { name: /Observações de avaria/i }), 'Cabo não retornou')
    await user.click(screen.getByRole('button', { name: /registrar vistoria/i }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('registrar_vistoria_equipamento', expect.objectContaining({
        p_etapa: 'devolucao',
        p_cabo_presente: false,
        p_observacoes: 'Cabo não retornou',
      }))
    })
  })

  it('alterna para aba de avarias, visualiza detalhes e altera status', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminAprovacoes />
      </MemoryRouter>
    )

    await screen.findByText(/Laboratório Beta/i)

    const tabAvarias = screen.getByRole('button', { name: /Avarias reportadas/i })
    expect(tabAvarias).toHaveTextContent('Avarias reportadas (1)')
    await user.click(tabAvarias)

    // Detalhes da ocorrência exibidos
    expect(await screen.findByText('Multímetro Digital')).toBeInTheDocument()
    expect(screen.getByText(/Severidade: critica/i)).toBeInTheDocument()
    expect(screen.getByText('Display quebrado e cabos danificados')).toBeInTheDocument()
    expect(screen.getByText(/Carlos Aluno/i)).toBeInTheDocument()

    // Clica em "Marcar em análise"
    const btnEmAnalise = screen.getByRole('button', { name: /marcar em análise/i })
    await user.click(btnEmAnalise)

    await waitFor(() => {
      expect(mockUpdateAvarias).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'em_analise',
        })
      )
    })
  })
})
