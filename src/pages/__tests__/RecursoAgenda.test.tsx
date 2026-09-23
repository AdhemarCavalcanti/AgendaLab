import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    localStorage.removeItem('agendalab_plano')
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
    const checkboxRegras = screen.getByRole('checkbox', { name: /Declaro que li e concordo/i })
    await user.click(checkboxRegras)

    // Agora deve estar habilitado
    expect(btnConfirmar).not.toBeDisabled()
  })

  it('envia quatro reservas semanais em uma única RPC com a data de término', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 1)
    localStorage.setItem('agendalab_plano', 'premium')

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 3, nome: 'Laboratório', lotacao: 20, status: 'livre' },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { sucesso: true, quantidade: 4, ids: [1, 2, 3, 4] },
      error: null,
    } as any)

    render(
      <MemoryRouter initialEntries={['/recurso/sala/3']}>
        <Routes><Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} /></Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Laboratório')).toBeInTheDocument()
    const slot = (await screen.findAllByRole('button')).find((button) => button.textContent?.includes('15:00 – 16:00'))
    await user.click(slot!)
    await user.click(screen.getByRole('button', { name: /solicitar reserva/i }))
    await user.click(screen.getByRole('checkbox', { name: 'Repetir semanalmente' }))

    expect(screen.getByLabelText('Data de término')).toHaveValue('2026-10-02')
    expect(screen.getByText(/4 reservas no mesmo dia da semana/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Data de término'), { target: { value: '2026-09-17' } })
    expect(screen.getByRole('button', { name: /confirmar solicitação/i })).toBeDisabled()
    expect(supabase.rpc).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Data de término'), { target: { value: '2026-10-02' } })
    await user.click(screen.getByRole('button', { name: /confirmar solicitação/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledTimes(1)
      expect(supabase.rpc).toHaveBeenCalledWith('solicitar_reservas_semanais', expect.objectContaining({
        p_tipo: 'sala',
        p_id_recurso: 3,
        p_data_termino: '2026-10-02',
      }))
    })
    expect(await screen.findByText(/4 solicitações enviadas/i)).toBeInTheDocument()
  })

  it('mostra a data indisponível da série e mantém o formulário aberto', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 1)
    localStorage.setItem('agendalab_plano', 'premium')
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 3, nome: 'Laboratório', lotacao: 20, status: 'livre' },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '23P01', message: 'Série indisponível em 25/09/2026: sala já reservada.' },
    } as any)

    render(
      <MemoryRouter initialEntries={['/recurso/sala/3']}>
        <Routes><Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} /></Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Laboratório')).toBeInTheDocument()
    const slot = (await screen.findAllByRole('button')).find((button) => button.textContent?.includes('15:00 – 16:00'))
    await user.click(slot!)
    await user.click(screen.getByRole('button', { name: /solicitar reserva/i }))
    await user.click(screen.getByRole('checkbox', { name: 'Repetir semanalmente' }))
    await user.click(screen.getByRole('button', { name: /confirmar solicitação/i }))

    expect(await screen.findByText('Série indisponível em 25/09/2026: sala já reservada.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar solicitação/i })).toBeEnabled()
  })

  it('não cria reservas avulsas se a RPC de repetição ainda não estiver instalada', async () => {
    const user = userEvent.setup()
    setupAuth('aluno', 1)
    localStorage.setItem('agendalab_plano', 'premium')
    const insert = vi.fn()
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 3, nome: 'Laboratório', lotacao: 20, status: 'livre' },
            error: null,
          }),
        } as any
      }
      return { ...criarConsultaVazia(), insert }
    })
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function public.solicitar_reservas_semanais not found' },
    } as any)

    render(
      <MemoryRouter initialEntries={['/recurso/sala/3']}>
        <Routes><Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} /></Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Laboratório')).toBeInTheDocument()
    const slot = (await screen.findAllByRole('button')).find((button) => button.textContent?.includes('15:00 – 16:00'))
    await user.click(slot!)
    await user.click(screen.getByRole('button', { name: /solicitar reserva/i }))
    await user.click(screen.getByRole('checkbox', { name: 'Repetir semanalmente' }))
    await user.click(screen.getByRole('button', { name: /confirmar solicitação/i }))

    expect(await screen.findByText('A repetição semanal ainda não foi habilitada no banco de dados.')).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('valida e bloqueia envio quando quantidade de pessoas excede a lotação da sala ou não é inteiro positivo', async () => {
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

    // Verifica exibição visível da capacidade máxima no formulário
    expect(screen.getByText(/Capacidade máxima permitida:/i)).toBeInTheDocument()
    expect(screen.getByText('5 pessoas')).toBeInTheDocument()
    expect(screen.getByText('Quantidade de pessoas / Ocupantes')).toBeInTheDocument()

    const inputQtd = screen.getByRole('spinbutton')
    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })

    // Testa valor inválido (0)
    await user.clear(inputQtd)
    await user.type(inputQtd, '0')
    expect(screen.getByText('Informe um número inteiro maior que zero.')).toBeInTheDocument()
    expect(btnConfirmar).toBeDisabled()

    // Altera a quantidade de pessoas para 10 (lotação é 5)
    await user.clear(inputQtd)
    await user.type(inputQtd, '10')

    expect(
      screen.getByText('A lotação máxima permitida para este espaço é de 5 pessoas.')
    ).toBeInTheDocument()
    expect(btnConfirmar).toBeDisabled()

    // Retorna para valor válido (4 pessoas)
    await user.clear(inputQtd)
    await user.type(inputQtd, '4')
    expect(
      screen.queryByText('A lotação máxima permitida para este espaço é de 5 pessoas.')
    ).not.toBeInTheDocument()
    expect(btnConfirmar).not.toBeDisabled()
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

  it('aplica o limite de 2 salas reservadas somente para usuário do plano gratuito', async () => {
    setupAuth('aluno', 1)
    localStorage.removeItem('agendalab_plano')

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 9, nome: 'Sala Extra', lotacao: 8, status: 'livre' },
            error: null,
          }),
        } as any
      }
      if (table === 'reservas_salas') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          gte: vi.fn(() => query),
          lt: vi.fn(() => query),
          gt: vi.fn(() => query),
          then(resolve: (value: any) => any, reject?: (reason: any) => any) {
            return Promise.resolve({
              data: [
                { id: 1, inicio: '2026-09-20T10:00:00.000Z', fim: '2026-09-20T12:00:00.000Z', status: 'aprovada' },
                { id: 2, inicio: '2026-09-21T10:00:00.000Z', fim: '2026-09-21T12:00:00.000Z', status: 'pendente' },
              ],
              error: null,
            }).then(resolve, reject)
          },
        }
        return query
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/sala/9']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala Extra')).toBeInTheDocument()
    expect(
      await screen.findByText(/Limite de 2 salas reservadas do plano gratuito atingido/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/grade de disponibilidade/i)).toBeInTheDocument()
  })

  it('não aplica limite de salas reservadas para administrador', async () => {
    setupAuth('admin', null)
    localStorage.removeItem('agendalab_plano')

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'salas') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id_sala: 9, nome: 'Sala Admin', lotacao: 8, status: 'livre' },
            error: null,
          }),
        } as any
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/sala/9']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sala Admin')).toBeInTheDocument()
    expect(screen.queryByText(/Limite de 2 salas reservadas/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Modo de visualização administrativa/i)).toBeInTheDocument()
  })

  it('exibe erro de lotação máxima quando o backend rejeita o payload', async () => {
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

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'A lotação máxima permitida para este espaço é de 5 pessoas.',
      },
    } as any)

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

    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })
    await user.click(btnConfirmar)

    expect(
      await screen.findByText('A lotação máxima permitida para este espaço é de 5 pessoas.')
    ).toBeInTheDocument()
  })

  it('contabiliza horas da semana e bloqueia com aviso explicativo quando ultrapassa o teto semanal de 4h', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setupAuth('aluno', 1)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 5, nome: 'Cortadora a Laser', quantidade: 2, status: 'livre' },
            error: null,
          }),
        } as any
      }
      if (table === 'reservas_equipamentos') {
        return criarConsultaComResultado([
          {
            inicio: '2026-09-11T08:00:00.000Z',
            fim: '2026-09-11T11:00:00.000Z',
            status: 'aprovada',
          },
        ])
      }
      return criarConsultaVazia()
    })

    render(
      <MemoryRouter initialEntries={['/recurso/equipamento/5']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Cortadora a Laser')).toBeInTheDocument()

    const slot14 = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('14:00 – 15:00')
    )
    const slot15 = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('15:00 – 16:00')
    )
    await user.click(slot14!)
    await user.click(slot15!)

    const btnSolicitar = screen.getByRole('button', { name: /solicitar reserva/i })
    await user.click(btnSolicitar)

    expect(await screen.findByText('Confirmar solicitação de reserva')).toBeInTheDocument()
    expect(await screen.findByText(/Cota semanal utilizada:/i)).toBeInTheDocument()
    expect(screen.getByText('3h de 4h')).toBeInTheDocument()

    expect(
      screen.getByText(
        /Limite semanal de horas excedido. Esta solicitação \(2h\) ultrapassa o teto semanal de 4h \(você já possui 3h agendadas nesta semana\)./i
      )
    ).toBeInTheDocument()

    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })
    expect(btnConfirmar).toBeDisabled()
  })

  it('permite confirmação quando a nova solicitação está dentro da cota semanal de 4h', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    setupAuth('aluno', 1)

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'equipamentos') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 5, nome: 'Cortadora a Laser', quantidade: 2, status: 'livre' },
            error: null,
          }),
        } as any
      }
      if (table === 'reservas_equipamentos') {
        return criarConsultaComResultado([
          {
            inicio: '2026-09-11T09:00:00.000Z',
            fim: '2026-09-11T10:00:00.000Z',
            status: 'aprovada',
          },
        ])
      }
      return criarConsultaVazia()
    })

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { sucesso: true, id: 99 },
      error: null,
    } as any)

    render(
      <MemoryRouter initialEntries={['/recurso/equipamento/5']}>
        <Routes>
          <Route path="/recurso/:tipo/:id" element={<RecursoAgenda />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Cortadora a Laser')).toBeInTheDocument()

    const slot14 = (await screen.findAllByRole('button')).find((btn) =>
      btn.textContent?.includes('14:00 – 15:00')
    )
    await user.click(slot14!)

    const btnSolicitar = screen.getByRole('button', { name: /solicitar reserva/i })
    await user.click(btnSolicitar)

    expect(await screen.findByText('Confirmar solicitação de reserva')).toBeInTheDocument()
    expect(await screen.findByText(/Cota semanal utilizada:/i)).toBeInTheDocument()
    expect(screen.getByText('1h de 4h')).toBeInTheDocument()

    expect(screen.queryByText(/Limite semanal de horas excedido/i)).not.toBeInTheDocument()

    const btnConfirmar = screen.getByRole('button', { name: /confirmar solicitação/i })
    expect(btnConfirmar).not.toBeDisabled()
  })
})
