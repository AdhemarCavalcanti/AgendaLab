import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RecursoAgenda } from '../RecursoAgenda'
import { supabase } from '../../lib/supabase'
import * as AuthContextModule from '../../contexts/AuthContext'

vi.mock('../../lib/supabase', () => {
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

describe('RecursoAgenda Page & Concurrency Prevention (US09 / RF04)', () => {
  const mockUser = { id: 'uuid-aluno', email: 'aluno@ufpe.br' }

  function setupAuth(role: 'aluno' | 'admin' | null, meuIdUsuario: number | null = 1) {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      session: role ? ({ user: mockUser } as any) : null,
      user: role ? (mockUser as any) : null,
      role,
      perfil: role ? ({ id_usuario: 1, nome: 'Aluno Teste', email: 'aluno@ufpe.br', matricula: '123' } as any) : null,
      meuIdUsuario,
      meuIdAdm: role === 'admin' ? 99 : null,
      loading: false,
      signIn: vi.fn(),
      ativarCadastroUsuario: vi.fn(),
      ativarCadastroAdmin: vi.fn(),
      signOut: vi.fn(),
      refreshPerfil: vi.fn(),
    })
  }

  function criarConsultaVazia() {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      lt: vi.fn(() => query),
      gt: vi.fn(() => query),
      limit: vi.fn(() => query),
      then(resolve: (value: any) => any, reject?: (reason: any) => any) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      },
    }
    return query
  }

  function criarConsultaComResultado(data: any[]) {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      lt: vi.fn(() => query),
      gt: vi.fn(() => query),
      limit: vi.fn(() => query),
      order: vi.fn(() => query),
      then(resolve: (value: any) => any, reject?: (reason: any) => any) {
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      },
    }
    return query
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 11, 8, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exibe mensagem e bloqueia agendamento quando recurso está em manutenção', async () => {
    setupAuth('aluno', 1)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 5, nome: 'Sala 101', lotacao: 20, status: 'manutencao' },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/sala/5']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala 101')).toBeInTheDocument()
    expect(
      screen.getByText(/Este recurso está em manutenção e não pode ser reservado no momento/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/grade de disponibilidade/i)).not.toBeInTheDocument()
  })

  it('exibe alerta para entrar na conta quando usuário não está logado', async () => {
    setupAuth(null, null)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 1, nome: 'Sala Aberta', lotacao: 15, status: 'livre' },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/sala/1']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala Aberta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Entre na sua conta/i })).toBeInTheDocument()
    expect(screen.getByText(/para solicitar uma reserva/i)).toBeInTheDocument()
  })

  it('exibe aviso de concorrência padronizado quando o horário é reservado simultaneamente (código 23P01 / exclusão)', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 1)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 1, nome: 'Lab de Redes', lotacao: 30, status: 'livre' },
            error: null,
          }),
        } as any
      }
      // Mock para a verificação de conflitos e listagem de ocupações
      return criarConsultaVazia()
    })

    // Mock RPC simulando erro PostgreSQL 23P01 de concorrência/exclusion constraint
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: {
        code: '23P01',
        message: 'conflicting key value violates exclusion constraint "reservas_salas_sem_sobreposicao"',
      },
    } as any)

    render(
      <MemoryRouter initialEntries={['/recurso/sala/1']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Lab de Redes')).toBeInTheDocument()

    // Clica em um horário livre qualquer (ex: 15:00)
    const slotButton = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('15:00 – 16:00')
    )
    expect(slotButton).toBeDefined()
    await user.click(slotButton!)

    // Clica em solicitar reserva para abrir o modal de confirmação
    const btnSolicitar = screen.getByRole('button', { name: /solicitar reserva/i })
    await user.click(btnSolicitar)

    // Modal aberto
    expect(screen.getByText('Confirmar solicitação de reserva')).toBeInTheDocument()

    // Confirma envio da solicitação
    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })
    await user.click(btnConfirmar)

    // Aguarda e verifica a mensagem amigável padronizada de conflito de concorrência
    expect(
      await screen.findByText(
        'Este horário acabou de ser reservado por outro usuário. Por favor, escolha outro período.'
      )
    ).toBeInTheDocument()
  })

  it('valida regras de uso obrigatórias antes de habilitar confirmação', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 1)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id_sala: 2,
              nome: 'Sala de Alta Tensão',
              lotacao: 10,
              status: 'livre',
              regras_uso: 'Obrigatório uso de EPI e botas isolantes.',
            },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/sala/2']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala de Alta Tensão')).toBeInTheDocument()
    expect(screen.getByText(/Obrigatório uso de EPI e botas isolantes/i)).toBeInTheDocument()

    const slotButton = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('14:00 – 15:00')
    )
    await user.click(slotButton!)

    const btnSolicitar = screen.getByRole('button', { name: /solicitar reserva/i })
    await user.click(btnSolicitar)

    // Botão de confirmar deve estar desabilitado enquanto o checkbox de regras não for marcado
    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })
    expect(btnConfirmar).toBeDisabled()

    // Marca o checkbox de regras
    const checkboxRegras = screen.getByRole('checkbox')
    await user.click(checkboxRegras)

    // Agora deve estar habilitado
    expect(btnConfirmar).not.toBeDisabled()
  })

  it('valida e bloqueia envio quando quantidade de pessoas excede a lotação da sala', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 1)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 3, nome: 'Sala Pequena', lotacao: 5, status: 'livre' },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/sala/3']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala Pequena')).toBeInTheDocument()

    const slotButton = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('16:00 – 17:00')
    )
    await user.click(slotButton!)

    const btnSolicitar = screen.getByRole('button', { name: /solicitar reserva/i })
    await user.click(btnSolicitar)

    // Altera a quantidade de pessoas para 10 (lotação é 5)
    const inputQtd = screen.getByRole('spinbutton')
    await user.clear(inputQtd)
    await user.type(inputQtd, '10')

    expect(screen.getByText('Excede a lotação máxima da sala.')).toBeInTheDocument()
    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })
    expect(btnConfirmar).toBeDisabled()
  })

  it('seleciona acessórios disponíveis, consolida o resumo e envia as quantidades na mesma RPC', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 7)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 4, nome: 'Laboratório de Física', lotacao: 20, status: 'livre' },
            error: null,
          }),
        } as any
      }
      if (table === 'equipamentos') {
        return criarConsultaComResultado([
          { id: 10, nome: 'Projetor HD', quantidade: 3, status: 'livre' },
          { id: 11, nome: 'Kit Didático', quantidade: 2, status: 'livre' },
        ])
      }
      if (table === 'reservas_equipamentos') {
        return criarConsultaComResultado([
          { id_equipamento: 10, quantidade: 1 },
        ])
      }
      return criarConsultaVazia()
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { sucesso: true, id: 99, tipo: 'sala' },
      error: null,
    } as any)

    render(
      <MemoryRouter initialEntries={['/recurso/sala/4']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Laboratório de Física')).toBeInTheDocument()
    const slotButton = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('15:00 – 16:00')
    )
    await user.click(slotButton!)
    await user.click(screen.getByRole('button', { name: /solicitar reserva/i }))

    expect(await screen.findByText('Projetor HD')).toBeInTheDocument()
    expect(screen.getAllByText(/2 disponível\(is\)/i)).toHaveLength(2)

    await user.click(screen.getByRole('checkbox', { name: /Projetor HD/i }))
    const quantidadeProjetor = screen.getByRole('spinbutton', { name: 'Quantidade de Projetor HD' })
    await user.clear(quantidadeProjetor)
    await user.type(quantidadeProjetor, '2')

    expect(screen.getByText('Acessórios:', { exact: false }).parentElement).toHaveTextContent('Projetor HD × 2')
    await user.click(screen.getByRole('button', { name: /confirmar solicitação/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'solicitar_reserva',
        expect.objectContaining({
          p_tipo: 'sala',
          p_id_recurso: 4,
          p_id_usuario: 7,
          p_acessorios: [{ id_equipamento: 10, quantidade: 2 }],
        })
      )
    })
  })
})
