import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminReservas } from '../Reservas'
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

describe('AdminReservas Page', () => {
  const mockReservasSalas = [
    {
      id: 1,
      id_sala: 10,
      inicio: '2026-11-01T10:00:00.000Z',
      fim: '2026-11-01T12:00:00.000Z',
      status: 'aprovada',
      motivo: 'Reunião de Laboratório',
      quantidade_pessoas: 6,
      id_usuario: 1,
      usuarios: { nome: 'Prof. Silva' },
    },
  ]

  const mockReservasEquip = [
    {
      id: 2,
      id_equipamento: 20,
      inicio: '2026-11-02T14:00:00.000Z',
      fim: '2026-11-02T16:00:00.000Z',
      status: 'pendente',
      observacao: 'Trabalho de Conclusão',
      id_usuario: 2,
      usuarios: { nome: 'Aluno Marcos' },
    },
    {
      id: 3,
      id_equipamento: 21,
      id_reserva_sala: 1,
      inicio: '2026-11-01T10:00:00.000Z',
      fim: '2026-11-01T12:00:00.000Z',
      status: 'aprovada',
      quantidade: 2,
      id_usuario: 1,
      usuarios: { nome: 'Prof. Silva' },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-admin' } } as any,
      user: { id: 'uuid-admin' } as any,
      role: 'admin',
      perfil: { id_adm: 1, nome: 'Administrador Geral' } as any,
      meuIdUsuario: null,
      meuIdAdm: 1,
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
          order: vi.fn().mockResolvedValue({ data: mockReservasSalas, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'reservas_equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockReservasEquip, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      if (table === 'salas') {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id_sala: 10, nome: 'Sala Multiuso' }], error: null }),
        } as any
      }
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              { id: 20, nome: 'Câmera Térmica' },
              { id: 21, nome: 'Kit Didático' },
            ],
            error: null,
          }),
        } as any
      }
      return { select: vi.fn().mockReturnThis() } as any
    })
  })

  it('lista todas as reservas com os nomes de recursos e usuários', async () => {
    render(
      <MemoryRouter>
        <AdminReservas />
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala Multiuso')).toBeInTheDocument()
    expect(screen.getByText('Prof. Silva')).toBeInTheDocument()
    expect(screen.getByText('Câmera Térmica')).toBeInTheDocument()
    expect(screen.getByText('Aluno Marcos')).toBeInTheDocument()
    expect(screen.getByText(/Kit Didático × 2/i)).toBeInTheDocument()
  })

  it('filtra reservas por tipo de recurso (apenas equipamentos)', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminReservas />
      </MemoryRouter>
    )

    await screen.findByText('Sala Multiuso')

    const btnEquip = screen.getByRole('button', { name: /equipamentos/i })
    await user.click(btnEquip)

    expect(screen.getByText('Câmera Térmica')).toBeInTheDocument()
    expect(screen.queryByText('Sala Multiuso')).not.toBeInTheDocument()
  })

  it('filtra reservas por status (apenas pendentes)', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminReservas />
      </MemoryRouter>
    )

    await screen.findByText('Sala Multiuso')

    const btnPendentes = screen.getByRole('button', { name: /pendentes/i })
    await user.click(btnPendentes)

    expect(screen.getByText('Câmera Térmica')).toBeInTheDocument()
    expect(screen.queryByText('Sala Multiuso')).not.toBeInTheDocument()
  })
})
