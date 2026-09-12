import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Catalogo } from '../Catalogo'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const mockSalas = [
  { id_sala: 1, nome: 'Laboratório de Química 01', lotacao: 30, status: 'livre' },
  { id_sala: 2, nome: 'Auditório Principal', lotacao: 100, status: 'ocupado' },
]

const mockEquipamentos = [
  { id: 10, nome: 'Microscópio Óptico', quantidade: 5, quantidade_manutencao: 0, status: 'livre' },
  { id: 11, nome: 'Osciloscópio Digital', quantidade: 2, quantidade_manutencao: 2, status: 'manutencao' },
]

describe('Catalogo Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockSalas, error: null }),
        } as any
      }
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockEquipamentos, error: null }),
        } as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any
    })
  })

  it('renderiza o catálogo com salas e equipamentos', async () => {
    render(
      <MemoryRouter>
        <Catalogo />
      </MemoryRouter>
    )

    expect(await screen.findByText('Laboratório de Química 01')).toBeInTheDocument()
    expect(screen.getByText('Auditório Principal')).toBeInTheDocument()
    expect(screen.getByText('Microscópio Óptico')).toBeInTheDocument()
    expect(screen.getByText('Osciloscópio Digital')).toBeInTheDocument()
  })

  it('filtra por tipo de recurso (apenas salas)', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Catalogo />
      </MemoryRouter>
    )

    await screen.findByText('Laboratório de Química 01')

    const btnSalas = screen.getByRole('button', { name: /salas/i })
    await user.click(btnSalas)

    expect(screen.getByText('Laboratório de Química 01')).toBeInTheDocument()
    expect(screen.getByText('Auditório Principal')).toBeInTheDocument()
    expect(screen.queryByText('Microscópio Óptico')).not.toBeInTheDocument()
    expect(screen.queryByText('Osciloscópio Digital')).not.toBeInTheDocument()
  })

  it('filtra por termo de busca no input', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Catalogo />
      </MemoryRouter>
    )

    await screen.findByText('Laboratório de Química 01')

    const inputBusca = screen.getByPlaceholderText(/buscar por nome do recurso/i)
    await user.type(inputBusca, 'Microscópio')

    expect(screen.getByText('Microscópio Óptico')).toBeInTheDocument()
    expect(screen.queryByText('Laboratório de Química 01')).not.toBeInTheDocument()
    expect(screen.queryByText('Auditório Principal')).not.toBeInTheDocument()
  })

  it('exibe mensagem de erro caso o carregamento falhe', async () => {
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Erro ao conectar ao banco' } }),
    } as any))

    render(
      <MemoryRouter>
        <Catalogo />
      </MemoryRouter>
    )

    expect(await screen.findByText(/Erro ao conectar ao banco/i)).toBeInTheDocument()
  })
})
