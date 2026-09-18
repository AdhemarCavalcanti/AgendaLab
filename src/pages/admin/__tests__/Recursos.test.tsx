import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminRecursos } from '../Recursos'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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
    localStorage.setItem('agendalab_plano', 'premium')
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { sucesso: true, reservas_canceladas: 0 },
      error: null,
    } as any)

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
      if (table === 'bloqueios_manutencao') {
        const query: any = {
          select: vi.fn(() => query),
          gte: vi.fn(() => query),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          delete: vi.fn(() => query),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        return query
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

  it('interdita um período de manutenção com justificativa', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminRecursos />
      </MemoryRouter>
    )

    await screen.findByText('Sala A')
    await user.click(screen.getAllByRole('button', { name: /interditar período/i })[0])

    const inicio = '2026-11-10T08:00'
    const fim = '2026-11-10T12:00'
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: inicio } })
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: fim } })
    await user.type(screen.getByRole('textbox', { name: /^justificativa$/i }), 'Calibração de sensores')
    await user.click(screen.getByRole('button', { name: /continuar/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('interditar_recurso_manutencao', {
        p_tipo: 'sala',
        p_id_recurso: 1,
        p_inicio: new Date(inicio).toISOString(),
        p_fim: new Date(fim).toISOString(),
        p_motivo: 'Calibração de sensores',
        p_confirmar_cancelamento: false,
        p_ids_reservas_confirmadas: null,
      })
    })
    expect(await screen.findByText('Interdição criada com sucesso.')).toBeInTheDocument()
  })

  it('interdita turnos, confirma as reservas afetadas e envia a justificativa pública', async () => {
    const user = userEvent.setup()

    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: {
          sucesso: false,
          requer_confirmacao: true,
          reservas_afetadas: [
            {
              id: 101,
              status: 'aprovada',
              inicio: '2026-11-10T10:00:00.000Z',
              fim: '2026-11-10T12:00:00.000Z',
              usuario_nome: 'Aluno Afetado',
              usuario_email: 'aluno@example.com',
              usuario_matricula: '2026001',
              quantidade: null,
            },
          ],
        },
        error: null,
      } as any)
      .mockResolvedValueOnce({
        data: { sucesso: true, reservas_canceladas: 1 },
        error: null,
      } as any)

    render(
      <MemoryRouter>
        <AdminRecursos />
      </MemoryRouter>
    )

    await screen.findByText('Sala A')

    await user.click(screen.getAllByRole('button', { name: /interdição emergencial/i })[0])
    await user.click(screen.getByRole('checkbox', { name: /manhã/i }))
    await user.click(screen.getByRole('checkbox', { name: /noite/i }))
    await user.type(
      screen.getByRole('textbox', { name: /justificativa pública/i }),
      'Dedetização emergencial'
    )
    await user.click(screen.getByRole('button', { name: /continuar/i }))

    expect(await screen.findByText('Aluno Afetado')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'interditar_recurso_emergencial', {
      p_tipo: 'sala',
      p_id_recurso: 1,
      p_data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      p_turnos: ['manha', 'noite'],
      p_justificativa: 'Dedetização emergencial',
      p_confirmar_cancelamento: false,
      p_ids_reservas_confirmadas: null,
    })

    await user.click(screen.getByRole('button', { name: /confirmar interdição e avisar/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'interditar_recurso_emergencial', {
        p_tipo: 'sala',
        p_id_recurso: 1,
        p_data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        p_turnos: ['manha', 'noite'],
        p_justificativa: 'Dedetização emergencial',
        p_confirmar_cancelamento: true,
        p_ids_reservas_confirmadas: [101],
      })
    })
    expect(await screen.findByText(/1 reserva\(s\) cancelada\(s\)/i)).toBeInTheDocument()
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
