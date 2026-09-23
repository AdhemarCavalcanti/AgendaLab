import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MinhasReservas } from '../MinhasReservas'
import { supabase } from '../../lib/supabase'
import * as AuthContextModule from '../../contexts/AuthContext'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

describe('MinhasReservas Page', () => {
  const mockReservasSalas = [
    {
      id: 101,
      id_sala: 1,
      inicio: '2026-10-15T10:00:00.000Z',
      fim: '2026-10-15T12:00:00.000Z',
      status: 'pendente',
      motivo: 'Estudo de Física Teórica',
      quantidade_pessoas: 4,
    },
    {
      id: 102,
      id_sala: 2,
      inicio: '2026-10-16T14:00:00.000Z',
      fim: '2026-10-16T16:00:00.000Z',
      status: 'aprovada',
      motivo: 'Defesa de TCC',
      quantidade_pessoas: 10,
    },
    {
      id: 103,
      id_sala: 3,
      inicio: '2025-01-10T08:00:00.000Z',
      fim: '2025-01-10T10:00:00.000Z',
      status: 'aprovada',
      motivo: 'Aula Prática Concluída',
      quantidade_pessoas: 5,
    },
  ]

  const mockReservasEquip = [
    {
      id: 201,
      id_equipamento: 10,
      inicio: '2026-10-17T08:00:00.000Z',
      fim: '2026-10-17T10:00:00.000Z',
      status: 'cancelada',
      observacao: 'Experimento de Óptica',
      cancelada_por_administracao: true,
      justificativa_cancelamento: 'Falta de energia no campus',
    },
    {
      id: 202,
      id_equipamento: 11,
      id_reserva_sala: 101,
      inicio: '2026-10-15T10:00:00.000Z',
      fim: '2026-10-15T12:00:00.000Z',
      status: 'pendente',
      quantidade: 2,
      observacao: null,
      vistorias_equipamentos: [{
        id: 80,
        id_reserva_equipamento: 202,
        etapa: 'entrega',
        cabo_presente: true,
        pecas_completas: true,
        sem_danos_visiveis: true,
        observacoes: null,
        criado_em: '2026-10-15T09:00:00.000Z',
        administradores: { nome: 'Responsável' },
      }],
    },
  ]

  const mockInsertRelato = vi.fn()

  const mockSalas = [
    { id_sala: 1, nome: 'Sala de Estudos 01' },
    { id_sala: 2, nome: 'Anfiteatro B' },
    { id_sala: 3, nome: 'Laboratório Maker' },
  ]

  const mockEquipamentos = [
    { id: 10, nome: 'Projetor HD' },
    { id: 11, nome: 'Kit Didático' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-1' } } as any,
      user: { id: 'uuid-1' } as any,
      role: 'aluno',
      perfil: { id_usuario: 5, nome: 'Aluno Logado' } as any,
      meuIdUsuario: 5,
      meuIdAdm: null,
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
          order: vi.fn().mockResolvedValue({ data: mockReservasSalas, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'reservas_equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockReservasEquip, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'salas') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockSalas, error: null }),
        } as any
      }
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockEquipamentos, error: null }),
        } as any
      }
      if (table === 'relatos_avarias') {
        return {
          insert: mockInsertRelato.mockResolvedValue({ data: [{ id: 1 }], error: null }),
        } as any
      }
      return {
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any
    })
  })

  it('lista todas as reservas do usuário com os nomes correspondentes dos recursos', async () => {
    render(
      <MemoryRouter>
        <MinhasReservas />
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala de Estudos 01')).toBeInTheDocument()
    expect(screen.getByText('Anfiteatro B')).toBeInTheDocument()
    expect(screen.getByText('Projetor HD')).toBeInTheDocument()
    expect(screen.getByText(/Estudo de Física Teórica/i)).toBeInTheDocument()
    expect(screen.getByText(/Kit Didático × 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Cabo: presente · Peças: completas/i)).toBeInTheDocument()
    expect(screen.getByText('Cancelada pela Administração')).toBeInTheDocument()
    expect(screen.getByText(/Falta de energia no campus/i)).toBeInTheDocument()
  })

  it('filtra reservas por status (apenas aprovadas)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <MinhasReservas />
      </MemoryRouter>
    )

    await screen.findByText('Sala de Estudos 01')

    const btnAprovadas = screen.getByRole('button', { name: /aprovadas/i })
    await user.click(btnAprovadas)

    expect(screen.getByText('Anfiteatro B')).toBeInTheDocument()
    expect(screen.queryByText('Sala de Estudos 01')).not.toBeInTheDocument()
    expect(screen.queryByText('Projetor HD')).not.toBeInTheDocument()
  })

  it('permite cancelar uma reserva pendente com confirmação', async () => {
    const user = userEvent.setup()
    window.confirm = vi.fn().mockReturnValue(true)

    render(
      <MemoryRouter>
        <MinhasReservas />
      </MemoryRouter>
    )

    await screen.findByText('Sala de Estudos 01')

    // Procura botões de cancelar disponíveis para reservas pendentes/aprovadas
    const btnCancelarList = screen.getAllByRole('button', { name: /cancelar/i })
    expect(btnCancelarList.length).toBeGreaterThan(0)

    await user.click(btnCancelarList[0])

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('reservas_salas')
    })
  })

  it('exibe o botão "Reportar problema/avaria" em reservas concluídas e abre o formulário', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <MinhasReservas />
      </MemoryRouter>
    )

    // Aguarda o carregamento dos itens
    expect(await screen.findByText('Laboratório Maker')).toBeInTheDocument()

    // Reserva 103 está no passado com status 'aprovada' (concluída)
    const btnReportar = screen.getByRole('button', { name: /reportar problema\/avaria/i })
    expect(btnReportar).toBeInTheDocument()

    // Clica no botão para abrir modal
    await user.click(btnReportar)

    // O modal abre com título e opções de severidade
    expect(screen.getByText(/Reportar problema\/avaria: Laboratório Maker/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Severidade/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Detalhes da ocorrência/i)).toBeInTheDocument()

    // Testa opções de severidade
    const selectSeveridade = screen.getByLabelText(/Severidade/i) as HTMLSelectElement
    expect(selectSeveridade.value).toBe('media')
  })

  it('submete o relato de avaria com severidade crítica e descrição', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <MinhasReservas />
      </MemoryRouter>
    )

    await screen.findByText('Laboratório Maker')

    const btnReportar = screen.getByRole('button', { name: /reportar problema\/avaria/i })
    await user.click(btnReportar)

    // Muda severidade para crítica
    const selectSeveridade = screen.getByLabelText(/Severidade/i)
    await user.selectOptions(selectSeveridade, 'critica')

    // Preenche descrição
    const inputDescricao = screen.getByLabelText(/Detalhes da ocorrência/i)
    await user.type(inputDescricao, 'Ar-condicionado vazando água e tomada solta na parede.')

    // Clica em Enviar relato
    const btnEnviar = screen.getByRole('button', { name: /enviar relato/i })
    await user.click(btnEnviar)

    await waitFor(() => {
      expect(mockInsertRelato).toHaveBeenCalledWith(
        expect.objectContaining({
          id_usuario: 5,
          tipo_recurso: 'sala',
          id_recurso: 3,
          recurso_nome: 'Laboratório Maker',
          id_reserva_sala: 103,
          severidade: 'critica',
          descricao: 'Ar-condicionado vazando água e tomada solta na parede.',
          status: 'pendente',
        })
      )
    })

    expect(await screen.findByText(/Relato de avaria enviado com sucesso à administração/i)).toBeInTheDocument()
  })
})
