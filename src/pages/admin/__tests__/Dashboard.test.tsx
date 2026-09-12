import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminDashboard } from '../Dashboard'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  }
})

describe('AdminDashboard Page', () => {
  const mockSalas = [
    { id_sala: 1, nome: 'Sala de Redes', lotacao: 25 },
    { id_sala: 2, nome: 'Sala Multimídia', lotacao: 40 },
  ]

  const mockEquipamentos = [
    { id: 10, nome: 'Projetor Laser', quantidade: 3 },
  ]

  const mockReservasSalas = [
    {
      id: 1,
      id_sala: 1,
      inicio: '2026-10-10T10:00:00.000Z',
      fim: '2026-10-10T12:00:00.000Z',
      status: 'aprovada',
    },
    {
      id: 2,
      id_sala: 2,
      inicio: '2026-10-11T14:00:00.000Z',
      fim: '2026-10-11T16:00:00.000Z',
      status: 'pendente',
    },
  ]

  const mockReservasEquip = [
    {
      id: 3,
      id_equipamento: 10,
      inicio: '2026-10-12T08:00:00.000Z',
      fim: '2026-10-12T10:00:00.000Z',
      status: 'aprovada',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return { select: vi.fn().mockResolvedValue({ data: mockSalas, error: null }) } as any
      }
      if (table === 'equipamentos') {
        return { select: vi.fn().mockResolvedValue({ data: mockEquipamentos, error: null }) } as any
      }
      if (table === 'reservas_salas') {
        return { select: vi.fn().mockResolvedValue({ data: mockReservasSalas, error: null }) } as any
      }
      if (table === 'reservas_equipamentos') {
        return { select: vi.fn().mockResolvedValue({ data: mockReservasEquip, error: null }) } as any
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) } as any
    })
  })

  it('calcula e exibe corretamente os indicadores numéricos dos cards', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    )

    expect(await screen.findByText('Dashboard & métricas')).toBeInTheDocument()

    // 2 reservas aprovadas e 2 salas cadastradas exibem o número 2
    expect(screen.getByText('Reservas concluídas')).toBeInTheDocument()
    expect(screen.getAllByText('2')).toHaveLength(2)

    // 1 pendente e 1 equipamento cadastrado exibem o número 1
    expect(screen.getByText('Solicitações pendentes')).toBeInTheDocument()
    expect(screen.getAllByText('1')).toHaveLength(2)

    // 2 salas cadastradas
    expect(screen.getByText('Salas cadastradas')).toBeInTheDocument()

    // 1 equipamento cadastrado
    expect(screen.getByText('Equipamentos cadastrados')).toBeInTheDocument()
  })

  it('exibe a lista de taxa de ocupação por recurso', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala de Redes')).toBeInTheDocument()
    expect(screen.getByText('Projetor Laser')).toBeInTheDocument()
    expect(screen.getByText(/Taxa de ocupação por recurso/i)).toBeInTheDocument()
  })
})
