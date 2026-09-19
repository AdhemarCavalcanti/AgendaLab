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
    },
  ]

  const mockSalas = [
    { id_sala: 1, nome: 'Sala de Estudos 01' },
    { id_sala: 2, nome: 'Anfiteatro B' },
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
})
