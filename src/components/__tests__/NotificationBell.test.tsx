import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { NotificationBell } from '../NotificationBell'
import { supabase } from '../../lib/supabase'
import * as AuthContextModule from '../../contexts/AuthContext'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../lib/supabase', () => {
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

describe('NotificationBell Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exibe contagem de aprovações pendentes para Administrador e navega ao clicar', async () => {
    const user = userEvent.setup()

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-admin' } } as any,
      user: { id: 'uuid-admin' } as any,
      role: 'admin',
      perfil: { id_adm: 1, nome: 'Admin' } as any,
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
          eq: vi.fn().mockResolvedValue({ count: 3, data: null, error: null }),
        } as any
      }
      if (table === 'reservas_equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ count: 2, data: null, error: null }),
        } as any
      }
      return {
        select: vi.fn().mockReturnThis(),
      } as any
    })

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    // Total de 3 salas + 2 equipamentos = 5 pendentes
    expect(await screen.findByText('5')).toBeInTheDocument()

    const bellBtn = screen.getByTitle('Solicitações pendentes')
    await user.click(bellBtn)

    expect(mockNavigate).toHaveBeenCalledWith('/admin/aprovacoes')
  })

  it('exibe notificações do Aluno, abre dropdown e permite marcar como lida', async () => {
    const user = userEvent.setup()

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: { user: { id: 'uuid-aluno' } } as any,
      user: { id: 'uuid-aluno' } as any,
      role: 'aluno',
      perfil: { id_usuario: 7, nome: 'Aluno' } as any,
      meuIdUsuario: 7,
      meuIdAdm: null,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: vi.fn(),
      refreshPerfil: vi.fn(),
    })

    const mockNotificacoes = [
      {
        id: 'notif-1',
        id_usuario: 7,
        titulo: 'Reserva Aprovada',
        mensagem: 'Sua reserva da Sala 101 foi aprovada!',
        lida: false,
        criado_em: new Date().toISOString(),
      },
    ]

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'notificacoes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockNotificacoes, error: null }),
          update: mockUpdate,
        } as any
      }
      return { select: vi.fn().mockReturnThis() } as any
    })

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    expect(await screen.findByText('1')).toBeInTheDocument()

    const bellBtn = screen.getByTitle('Seus avisos')
    await user.click(bellBtn)

    expect(screen.getByText('Sua reserva da Sala 101 foi aprovada!')).toBeInTheDocument()

    // Clica no botão para marcar como lida
    const btnMarcarLida = screen.getByRole('button', { name: /marcar como lida/i })
    await user.click(btnMarcarLida)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ lida: true })
    })
  })
})
