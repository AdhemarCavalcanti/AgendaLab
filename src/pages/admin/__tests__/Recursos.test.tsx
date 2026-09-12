import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminRecursos } from '../Recursos'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('AdminRecursos Page', () => {
  const mockSalas = [
    { id_sala: 1, nome: 'Sala A', lotacao: 20, status: 'livre', regras_uso: 'Sem alimentos' },
    { id_sala: 2, nome: 'Sala B', lotacao: 15, status: 'manutencao', regras_uso: null },
  ]

  const mockEquipamentos = [
    { id: 10, nome: 'Projetor 4K', quantidade: 5, quantidade_manutencao: 1, status: 'livre' },
  ]

  const mockUpdateSalas = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  })
  const mockInsertSalas = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockDeleteSalas = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockSalas, error: null }),
          update: mockUpdateSalas,
          insert: mockInsertSalas,
          delete: mockDeleteSalas,
        } as any
      }
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockEquipamentos, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        } as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any
    })
  })

  it('lista salas cadastradas e permite alternar para a aba de equipamentos', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminRecursos />
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala A')).toBeInTheDocument()
    expect(screen.getByText('Sala B')).toBeInTheDocument()

    // Clica na aba equipamentos
    const tabEquip = screen.getByRole('button', { name: /equipamentos/i })
    await user.click(tabEquip)

    expect(await screen.findByText('Projetor 4K')).toBeInTheDocument()
    expect(screen.queryByText('Sala A')).not.toBeInTheDocument()
  })

  it('permite alternar status de manutenção de uma sala', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminRecursos />
      </MemoryRouter>
    )

    await screen.findByText('Sala A')

    // Botão de colocar em manutenção
    const btnManutencao = screen.getAllByRole('button', { name: 'manutenção' })[0]
    await user.click(btnManutencao)

    expect(mockUpdateSalas).toHaveBeenCalledWith({ status: 'manutencao' })
  })

  it('permite abrir modal e cadastrar nova sala', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminRecursos />
      </MemoryRouter>
    )

    await screen.findByText('Sala A')

    // Abre modal de criação
    const btnNovo = screen.getByRole('button', { name: /\+ novo/i })
    await user.click(btnNovo)

    expect(screen.getByRole('heading', { name: /novo sala/i })).toBeInTheDocument()

    // Preenche campos
    const inputNome = screen.getByPlaceholderText(/Ex: Laboratório 3/i)
    await user.type(inputNome, 'Sala C')

    const inputCapacidade = screen.getByRole('spinbutton')
    await user.clear(inputCapacidade)
    await user.type(inputCapacidade, '40')

    const btnSalvar = screen.getByRole('button', { name: /salvar/i })
    await user.click(btnSalvar)

    await waitFor(() => {
      expect(mockInsertSalas).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Sala C',
          lotacao: 40,
          status: 'livre',
        })
      )
    })
  })
})
