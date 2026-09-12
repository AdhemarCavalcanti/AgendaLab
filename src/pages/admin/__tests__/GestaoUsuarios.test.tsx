import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminGestaoUsuarios } from '../GestaoUsuarios'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('AdminGestaoUsuarios Page', () => {
  const mockUsuarios = [
    {
      id_usuario: 1,
      uuid: 'uuid-ativo-1',
      nome: 'João Ativo',
      email: 'joao@ufpe.br',
      matricula: '2023001',
    },
    {
      id_usuario: 2,
      uuid: null,
      nome: 'Pedro Pendente',
      email: 'pedro@ufpe.br',
      matricula: '2023002',
    },
  ]

  const mockAdmins = [
    {
      id_adm: 10,
      uuid: 'uuid-admin-1',
      nome: 'Administrador Titular',
      email: 'admin.titular@ufpe.br',
      codigo: 'ADM-100',
    },
  ]

  const mockInsertUsuarios = vi.fn().mockResolvedValue({ data: null, error: null })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'usuarios') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockUsuarios, error: null }),
          insert: mockInsertUsuarios,
        } as any
      }
      if (table === 'administradores') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockAdmins, error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any
      }
      return { select: vi.fn().mockReturnThis() } as any
    })
  })

  it('lista usuários ativos e pré-cadastros pendentes', async () => {
    render(
      <MemoryRouter>
        <AdminGestaoUsuarios />
      </MemoryRouter>
    )

    expect(await screen.findByText('João Ativo')).toBeInTheDocument()
    expect(screen.getByText('Pedro Pendente')).toBeInTheDocument()
    expect(screen.getByText(/Pendentes de ativação/i)).toBeInTheDocument()
  })

  it('filtra usuários pelo campo de busca', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGestaoUsuarios />
      </MemoryRouter>
    )

    await screen.findByText('João Ativo')

    const inputBusca = screen.getByPlaceholderText(/buscar por nome, e-mail/i)
    await user.type(inputBusca, 'Pedro')

    expect(screen.getByText('Pedro Pendente')).toBeInTheDocument()
    expect(screen.queryByText('João Ativo')).not.toBeInTheDocument()
  })

  it('permite pré-cadastrar um novo aluno inserindo registro com matrícula', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <AdminGestaoUsuarios />
      </MemoryRouter>
    )

    await screen.findByText('João Ativo')

    // Abre modal de pré-cadastro
    const btnNovo = screen.getByRole('button', { name: /\+ pré-cadastrar/i })
    await user.click(btnNovo)

    expect(screen.getByRole('heading', { name: /Pré-cadastrar aluno/i })).toBeInTheDocument()

    const inputNome = screen.getByPlaceholderText('Nome da pessoa')
    await user.type(inputNome, 'Lucas Novo')

    const inputEmail = screen.getByPlaceholderText('pessoa@universidade.edu')
    await user.type(inputEmail, 'lucas@ufpe.br')

    const inputMatricula = screen.getByPlaceholderText('Ex: 2023001234')
    await user.type(inputMatricula, '2024999')

    const btnSalvar = screen.getByRole('button', { name: /^pré-cadastrar$/i })
    await user.click(btnSalvar)

    await waitFor(() => {
      expect(mockInsertUsuarios).toHaveBeenCalledWith([
        {
          nome: 'Lucas Novo',
          email: 'lucas@ufpe.br',
          matricula: '2024999',
        },
      ])
    })
  })
})
