import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Equipamento, Sala, TipoRecurso } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { AvailabilityGrid, type Ocupacao } from '../components/AvailabilityGrid'
import { Modal } from '../components/Modal'
import { obterImagemRecurso } from '../lib/recursoImagens'

function proximosDias(n: number) {
  const dias: Date[] = []
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  for (let i = 0; i < n; i++) {
    const d = new Date(hoje)
    d.setDate(hoje.getDate() + i)
    dias.push(d)
  }
  return dias
}

function dataLocalISO(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

function somarDias(data: Date, dias: number) {
  const resultado = new Date(data)
  resultado.setDate(resultado.getDate() + dias)
  return resultado
}

function contarOcorrenciasSemanais(inicio: Date, termino: string) {
  const [ano, mes, dia] = termino.split('-').map(Number)
  if (!ano || !mes || !dia) return 0
  const fim = new Date(ano, mes - 1, dia)
  if (dataLocalISO(fim) !== termino) return 0
  const dias = Math.round((Date.UTC(ano, mes - 1, dia) - Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate())) / 86400000)
  return Math.floor(dias / 7) + 1
}

const STATUS_MSG: Record<string, string> = {
  ocupado: 'Este recurso está marcado como ocupado pelo administrador e não pode ser reservado no momento.',
  manutencao: 'Este recurso está em manutenção e não pode ser reservado no momento.',
  manutenção: 'Este recurso está em manutenção e não pode ser reservado no momento.',
}

const MSG_CONFLITO_CONCORRENCIA =
  'Este horário acabou de ser reservado por outro usuário. Por favor, escolha outro período.'

const MSG_MANUTENCAO = 'Este recurso está em manutenção no período selecionado. Escolha outro horário.'
const LIMITE_SALAS_ATIVAS_GRATIS = 2
const LIMITE_RESERVAS_MENSAIS_GRATIS = 50
export const TETO_HORAS_SEMANAIS = 4

export function getInicioEFimSemana(dataReferencia: Date) {
  const d = new Date(dataReferencia)
  const diaSemana = d.getDay()
  const diffSegunda = d.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1)
  const inicioSemana = new Date(d.getFullYear(), d.getMonth(), diffSegunda, 0, 0, 0, 0)
  const fimSemana = new Date(inicioSemana)
  fimSemana.setDate(inicioSemana.getDate() + 7)
  return { inicioSemana, fimSemana }
}

export async function obterHorasSemanaUsuario(
  idUsuario: number,
  tipo: TipoRecurso,
  idRecurso: number,
  dataSlot: Date
): Promise<number> {
  const { inicioSemana, fimSemana } = getInicioEFimSemana(dataSlot)
  const tabela = tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'
  const colunaRecurso = tipo === 'sala' ? 'id_sala' : 'id_equipamento'

  const { data, error } = await supabase
    .from(tabela)
    .select('inicio, fim')
    .eq('id_usuario', idUsuario)
    .eq(colunaRecurso, idRecurso)
    .in('status', ['pendente', 'aprovada'])
    .gte('inicio', inicioSemana.toISOString())
    .lt('inicio', fimSemana.toISOString())

  if (error || !data) return 0

  const totalHoras = data.reduce((acc, r: { inicio: string; fim: string }) => {
    const inicio = new Date(r.inicio).getTime()
    const fim = new Date(r.fim).getTime()
    const horas = Math.max(0, (fim - inicio) / (1000 * 60 * 60))
    return acc + horas
  }, 0)

  return Math.round(totalHoras * 10) / 10
}

function planoEhPremium() {
  return localStorage.getItem('agendalab_plano') === 'premium'
}

async function obterUsoReservasUsuario(idUsuario: number) {
  const agoraISO = new Date().toISOString()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [salasAtivas, salasMes, equipMes] = await Promise.all([
    supabase
      .from('reservas_salas')
      .select('id')
      .eq('id_usuario', idUsuario)
      .in('status', ['pendente', 'aprovada'])
      .gte('fim', agoraISO),
    supabase
      .from('reservas_salas')
      .select('id')
      .eq('id_usuario', idUsuario)
      .gte('inicio', inicioMes.toISOString()),
    supabase
      .from('reservas_equipamentos')
      .select('id')
      .eq('id_usuario', idUsuario)
      .gte('inicio', inicioMes.toISOString()),
  ])

  return {
    salasAtivas: (salasAtivas.data ?? []).length,
    reservasNoMes: (salasMes.data ?? []).length + (equipMes.data ?? []).length,
  }
}

const MSG_CONFLITO_ACESSORIO =
  'A sala ou um dos acessórios selecionados não está mais disponível. Revise o período e as quantidades.'

interface AcessorioDisponivel extends Equipamento {
  disponivel: number
}

function isErroConcorrencia(error: any): boolean {
  if (!error) return false
  const code = error.code
  const msg = (error.message || '').toLowerCase()
  return (
    code === '23P01' ||
    code === '23505' ||
    msg.includes('este horário acabou de ser reservado') ||
    msg.includes('acabou de ser reservado') ||
    msg.includes('reservado recentemente') ||
    msg.includes('sem_sobreposicao') ||
    msg.includes('sobreposicao') ||
    msg.includes('conflito') ||
    msg.includes('exclusion')
  )
}

function isErroManutencao(error: any): boolean {
  const msg = (error?.message || '').toLowerCase()
  return msg.includes('manutenção no período') || msg.includes('manutencao no periodo')
}

export function RecursoAgenda() {
  const { tipo, id } = useParams<{ tipo: TipoRecurso; id: string }>()
  const { user, role, meuIdUsuario } = useAuth()
  const navigate = useNavigate()

  const [recurso, setRecurso] = useState<(Sala | Equipamento) & { regras_uso?: string } | null>(null)
  const [ocupacoes, setOcupacoes] = useState<Ocupacao[]>([])
  const [selectedDate, setSelectedDate] = useState(() => proximosDias(1)[0])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [pendingSlot, setPendingSlot] = useState<{ inicio: Date; fim: Date } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [qtdPessoas, setQtdPessoas] = useState(1)
  const [qtdEquipamento, setQtdEquipamento] = useState(1)
  const [observacao, setObservacao] = useState('')
  const [repetirSemanalmente, setRepetirSemanalmente] = useState(false)
  const [dataTermino, setDataTermino] = useState('')
  const [aceitouRegras, setAceitouRegras] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [formErro, setFormErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [acessorios, setAcessorios] = useState<AcessorioDisponivel[]>([])
  const [acessoriosSelecionados, setAcessoriosSelecionados] = useState<Record<number, number>>({})
  const [carregandoAcessorios, setCarregandoAcessorios] = useState(false)
  const [erroAcessorios, setErroAcessorios] = useState<string | null>(null)
  const carregamentoAcessoriosId = useRef(0)
  const carregamentoOcupacoesId = useRef(0)
  const [avisoLimiteUsuario, setAvisoLimiteUsuario] = useState<string | null>(null)
  const [horasSemanaUsuario, setHorasSemanaUsuario] = useState(0)

  const dias = useMemo(() => proximosDias(15), [])
  const tabela = tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'
  const coluna = tipo === 'sala' ? 'id_sala' : 'id_equipamento'
  const idNum = Number(id)

  async function carregarRecurso() {
    if (!tipo || !id) return
    setLoading(true)
    setErro(null)
    const query =
      tipo === 'sala' ? supabase.from('salas').select('*').eq('id_sala', idNum) : supabase.from('equipamentos').select('*').eq('id', idNum)
    const { data, error } = await query.maybeSingle()
    if (error || !data) {
      setErro('Recurso não encontrado.')
    } else {
      setRecurso(data as (Sala | Equipamento) & { regras_uso?: string })
    }
    setLoading(false)
  }

  async function carregarOcupacoes() {
    if (!tipo || !id) return
    const requestId = ++carregamentoOcupacoesId.current

    const inicioJanela = new Date(selectedDate)
    inicioJanela.setDate(inicioJanela.getDate() - 1)
    inicioJanela.setHours(0, 0, 0, 0)

    const fimJanela = new Date(selectedDate)
    fimJanela.setDate(fimJanela.getDate() + 2)
    fimJanela.setHours(23, 59, 59, 999)

    const selectFields = tipo === 'equipamento' ? 'inicio, fim, status, id_usuario, quantidade' : 'inicio, fim, status, id_usuario'

    const reservasPromise = supabase
      .from(tabela)
      .select(selectFields)
      .eq(coluna, idNum)
      .in('status', ['pendente', 'aprovada'])
      .lt('inicio', fimJanela.toISOString())
      .gt('fim', inicioJanela.toISOString())

    let bloqueiosQuery = supabase
      .from('bloqueios_manutencao')
      .select('inicio, fim, motivo')
      .lt('inicio', fimJanela.toISOString())
      .gt('fim', inicioJanela.toISOString())

    bloqueiosQuery = tipo === 'sala'
      ? bloqueiosQuery.eq('id_sala', idNum)
      : bloqueiosQuery.eq('id_equipamento', idNum)

    const [reservasResult, bloqueiosResult] = await Promise.all([reservasPromise, bloqueiosQuery])

    if (requestId === carregamentoOcupacoesId.current && !reservasResult.error && !bloqueiosResult.error) {
      const reservasFormatadas: Ocupacao[] = ((reservasResult.data ?? []) as any[]).map((o) => ({
        inicio: o.inicio,
        fim: o.fim,
        status: o.status,
        mine: o.id_usuario === meuIdUsuario,
        quantidade: o.quantidade ? Number(o.quantidade) : 1,
      }))

      const bloqueiosFormatados: Ocupacao[] = ((bloqueiosResult.data ?? []) as any[]).map((bloqueio) => ({
        inicio: bloqueio.inicio,
        fim: bloqueio.fim,
        status: 'manutencao',
        motivo: bloqueio.motivo,
      }))

      setOcupacoes([...reservasFormatadas, ...bloqueiosFormatados])
    }
  }

  async function carregarAcessorios(inicio: Date, fim: Date) {
    const requestId = ++carregamentoAcessoriosId.current
    setCarregandoAcessorios(true)
    setErroAcessorios(null)

    const inicioISO = inicio.toISOString()
    const fimISO = fim.toISOString()

    const [inventarioResult, reservasResult, bloqueiosResult] = await Promise.all([
      supabase
        .from('equipamentos')
        .select('id, nome, quantidade, status')
        .eq('status', 'livre')
        .gt('quantidade', 0),
      supabase
        .from('reservas_equipamentos')
        .select('id_equipamento, quantidade')
        .in('status', ['pendente', 'aprovada'])
        .lt('inicio', fimISO)
        .gt('fim', inicioISO),
      supabase
        .from('bloqueios_manutencao')
        .select('id_equipamento, motivo')
        .lt('inicio', fimISO)
        .gt('fim', inicioISO),
    ])

    if (requestId !== carregamentoAcessoriosId.current) return

    if (inventarioResult.error || reservasResult.error || bloqueiosResult.error) {
      setAcessorios([])
      setAcessoriosSelecionados({})
      setErroAcessorios('Não foi possível consultar os acessórios disponíveis. Tente novamente.')
      setCarregandoAcessorios(false)
      return
    }

    const quantidadesEmUso = new Map<number, number>()
    for (const reserva of (reservasResult.data ?? []) as any[]) {
      const idEquipamento = Number(reserva.id_equipamento)
      quantidadesEmUso.set(
        idEquipamento,
        (quantidadesEmUso.get(idEquipamento) ?? 0) + Number(reserva.quantidade ?? 1)
      )
    }

    const equipamentosBloqueados = new Set<number>(
      ((bloqueiosResult.data ?? []) as any[])
        .filter((bloqueio) => bloqueio.id_equipamento !== null)
        .map((bloqueio) => Number(bloqueio.id_equipamento))
    )

    const disponiveis = ((inventarioResult.data ?? []) as Equipamento[])
      .filter((equipamento) => equipamento.status === 'livre' && Number(equipamento.quantidade) > 0)
      .map((equipamento) => ({
        ...equipamento,
        disponivel: equipamentosBloqueados.has(equipamento.id)
          ? 0
          : Math.max(0, Number(equipamento.quantidade) - (quantidadesEmUso.get(equipamento.id) ?? 0)),
      }))
      .filter((equipamento) => equipamento.disponivel > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    setAcessorios(disponiveis)
    setAcessoriosSelecionados({})
    setCarregandoAcessorios(false)
  }

  useEffect(() => {
    carregarRecurso()
  }, [tipo, id])

  useEffect(() => {
    if (role !== 'aluno' || !meuIdUsuario || planoEhPremium()) {
      setAvisoLimiteUsuario(null)
      return
    }

    obterUsoReservasUsuario(meuIdUsuario).then((uso) => {
      if (uso.reservasNoMes >= LIMITE_RESERVAS_MENSAIS_GRATIS) {
        setAvisoLimiteUsuario(
          `Limite de ${LIMITE_RESERVAS_MENSAIS_GRATIS} reservas mensais do plano gratuito atingido.`
        )
        return
      }
      if (tipo === 'sala' && uso.salasAtivas >= LIMITE_SALAS_ATIVAS_GRATIS) {
        setAvisoLimiteUsuario(
          `Limite de ${LIMITE_SALAS_ATIVAS_GRATIS} salas reservadas do plano gratuito atingido. Cancele uma reserva ou faça upgrade.`
        )
        return
      }
      setAvisoLimiteUsuario(null)
    })
  }, [role, meuIdUsuario, tipo])

  useEffect(() => {
    void carregarOcupacoes()

    if (!tipo || !id) return

    const atualizarOcupacoes = () => {
      void carregarOcupacoes()
    }
    const atualizarSeVisivel = () => {
      if (document.visibilityState === 'visible') atualizarOcupacoes()
    }

    window.addEventListener('focus', atualizarOcupacoes)
    document.addEventListener('visibilitychange', atualizarSeVisivel)
    // Recupera alterações caso a conexão Realtime não entregue algum evento.
    const intervalo = window.setInterval(atualizarSeVisivel, 30_000)

    const channel = supabase
      .channel(`agenda-realtime-${tipo}-${idNum}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tabela,
        },
        atualizarOcupacoes
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bloqueios_manutencao',
        },
        atualizarOcupacoes
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') atualizarOcupacoes()
      })

    return () => {
      carregamentoOcupacoesId.current += 1
      window.removeEventListener('focus', atualizarOcupacoes)
      document.removeEventListener('visibilitychange', atualizarSeVisivel)
      window.clearInterval(intervalo)
      supabase.removeChannel(channel)
    }
  }, [tipo, id, selectedDate, tabela, idNum, meuIdUsuario])

  useEffect(() => {
    if (tipo === 'sala' && pendingSlot) {
      void carregarAcessorios(pendingSlot.inicio, pendingSlot.fim)
      return
    }

    carregamentoAcessoriosId.current += 1
    setAcessorios([])
    setAcessoriosSelecionados({})
    setCarregandoAcessorios(false)
    setErroAcessorios(null)
  }, [tipo, pendingSlot])

  const estoqueTotal = tipo === 'equipamento' ? (recurso as Equipamento)?.quantidade ?? 0 : 0

  const disponivelNoSlot = useMemo(() => {
    if (!pendingSlot || tipo !== 'equipamento' || !estoqueTotal) return 0

    const inicioSlot = pendingSlot.inicio.getTime()
    const fimSlot = pendingSlot.fim.getTime()

    const emManutencao = ocupacoes.some((o) => {
      if (o.status.toLowerCase() !== 'manutencao') return false
      const oStart = new Date(o.inicio).getTime()
      const oEnd = new Date(o.fim).getTime()
      return inicioSlot < oEnd && fimSlot > oStart
    })

    if (emManutencao) return 0

    let maxUsoNoIntervalo = 0

    for (let t = inicioSlot; t < fimSlot; t += 3600000) {
      const horaInicio = t
      const horaFim = t + 3600000

      const usoNestaHora = ocupacoes.reduce((acc, o) => {
        const oStart = new Date(o.inicio).getTime()
        const oEnd = new Date(o.fim).getTime()

        if (horaInicio < oEnd && horaFim > oStart) {
          return acc + (o.quantidade ?? 1)
        }
        return acc
      }, 0)

      if (usoNestaHora > maxUsoNoIntervalo) {
        maxUsoNoIntervalo = usoNestaHora
      }
    }

    return Math.max(0, estoqueTotal - maxUsoNoIntervalo)
  }, [pendingSlot, ocupacoes, tipo, estoqueTotal])

  async function abrirConfirmacao(inicio: Date, fim: Date) {
    setFormErro(null)
    setQtdPessoas(1)
    setQtdEquipamento(1)
    setAceitouRegras(false)
    setAcessoriosSelecionados({})
    setRepetirSemanalmente(false)
    setDataTermino('')
    if (tipo === 'sala') setCarregandoAcessorios(true)
    if (meuIdUsuario && tipo && idNum) {
      const horas = await obterHorasSemanaUsuario(meuIdUsuario, tipo, idNum, inicio)
      setHorasSemanaUsuario(horas)
    }
    setPendingSlot({ inicio, fim })
  }

  const duracaoHorasSlot = useMemo(() => {
    if (!pendingSlot) return 0
    const horas = (pendingSlot.fim.getTime() - pendingSlot.inicio.getTime()) / (1000 * 60 * 60)
    return Math.round(horas * 10) / 10
  }, [pendingSlot])

  const dataTerminoMinima = pendingSlot ? dataLocalISO(somarDias(pendingSlot.inicio, 7)) : ''
  const dataTerminoMaxima = pendingSlot ? dataLocalISO(somarDias(pendingSlot.inicio, 357)) : ''
  const quantidadeOcorrencias = pendingSlot ? contarOcorrenciasSemanais(pendingSlot.inicio, dataTermino) : 0
  const repeticaoInvalida = repetirSemanalmente &&
    (!dataTermino || dataTermino < dataTerminoMinima || dataTermino > dataTerminoMaxima || quantidadeOcorrencias < 2)

  const limiteHorasExcedido = useMemo(() => {
    if (role !== 'aluno' || !pendingSlot) return false
    return (horasSemanaUsuario + duracaoHorasSlot) > TETO_HORAS_SEMANAIS
  }, [role, pendingSlot, horasSemanaUsuario, duracaoHorasSlot])

  async function confirmarReserva() {
    if (!pendingSlot || !user || !tipo || !recurso || meuIdUsuario === null) return

    if (repeticaoInvalida) {
      setFormErro('Informe uma data de término entre a semana seguinte e 52 semanas de reservas.')
      return
    }

    if (role === 'aluno' && limiteHorasExcedido) {
      setFormErro(
        `Limite semanal de horas excedido. Esta solicitação (${duracaoHorasSlot}h) ultrapassa o teto semanal de ${TETO_HORAS_SEMANAIS}h (você já possui ${horasSemanaUsuario}h agendadas nesta semana).`
      )
      return
    }

    if (tipo === 'sala') {
      const lotacao = (recurso as Sala).lotacao
      if (!Number.isInteger(qtdPessoas) || qtdPessoas < 1) {
        setFormErro('Informe um número inteiro maior que zero.')
        return
      }
      if (qtdPessoas > lotacao) {
        setFormErro(`A lotação máxima permitida para este espaço é de ${lotacao} pessoas.`)
        return
      }
    }

    if (tipo === 'equipamento' && qtdEquipamento > disponivelNoSlot) {
      setFormErro(`A quantidade solicitada (${qtdEquipamento}) excede o estoque disponível para este horário (${disponivelNoSlot}).`)
      return
    }

    const acessoriosPayload = tipo === 'sala'
      ? acessorios
          .filter((acessorio) => Object.prototype.hasOwnProperty.call(acessoriosSelecionados, acessorio.id))
          .map((acessorio) => ({
            id_equipamento: acessorio.id,
            quantidade: acessoriosSelecionados[acessorio.id],
          }))
      : []

    const acessorioInvalido = acessoriosPayload.find(({ id_equipamento, quantidade }) => {
      const acessorio = acessorios.find((item) => item.id === id_equipamento)
      return !acessorio || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > acessorio.disponivel
    })

    if (acessorioInvalido) {
      setFormErro('Revise as quantidades dos acessórios selecionados.')
      return
    }

    if (role === 'aluno' && !planoEhPremium()) {
      const uso = await obterUsoReservasUsuario(meuIdUsuario)
      const novasReservas = repetirSemanalmente ? quantidadeOcorrencias : 1
      const novosRegistros = novasReservas * (1 + acessoriosPayload.length)
      if (uso.reservasNoMes + novosRegistros > LIMITE_RESERVAS_MENSAIS_GRATIS) {
        setFormErro(`Limite de ${LIMITE_RESERVAS_MENSAIS_GRATIS} reservas mensais do plano gratuito atingido.`)
        return
      }
      if (tipo === 'sala' && uso.salasAtivas + novasReservas > LIMITE_SALAS_ATIVAS_GRATIS) {
        setFormErro(
          `Limite de ${LIMITE_SALAS_ATIVAS_GRATIS} salas reservadas do plano gratuito atingido. Cancele uma reserva ou faça upgrade.`
        )
        return
      }
    }

    setEnviando(true)
    setFormErro(null)

    const slotInicioISO = pendingSlot.inicio.toISOString()
    const slotFimISO = pendingSlot.fim.toISOString()

    let bloqueiosQuery = supabase
      .from('bloqueios_manutencao')
      .select('motivo')
      .lt('inicio', slotFimISO)
      .gt('fim', slotInicioISO)
      .limit(1)

    bloqueiosQuery = tipo === 'sala'
      ? bloqueiosQuery.eq('id_sala', idNum)
      : bloqueiosQuery.eq('id_equipamento', idNum)

    const { data: bloqueios, error: erroBloqueios } = await bloqueiosQuery

    if (erroBloqueios) {
      setFormErro('Não foi possível validar a disponibilidade do recurso. Tente novamente.')
      setEnviando(false)
      return
    }

    if (bloqueios && bloqueios.length > 0) {
      setFormErro(`${MSG_MANUTENCAO} Motivo: ${bloqueios[0].motivo}`)
      setEnviando(false)
      await carregarOcupacoes()
      return
    }

    // 1. Verificação prévia de conflito em tempo real antes de persistir
    if (tipo === 'sala') {
      const { data: conflitos } = await supabase
        .from('reservas_salas')
        .select('id')
        .eq('id_sala', idNum)
        .in('status', ['pendente', 'aprovada'])
        .lt('inicio', slotFimISO)
        .gt('fim', slotInicioISO)

      if (conflitos && conflitos.length > 0) {
        setFormErro(MSG_CONFLITO_CONCORRENCIA)
        setEnviando(false)
        await carregarOcupacoes()
        return
      }
    } else {
      // Para equipamento, verifica em tempo real se o estoque restante comporta a solicitação
      const { data: conflitosEquip } = await supabase
        .from('reservas_equipamentos')
        .select('quantidade, inicio, fim')
        .eq('id_equipamento', idNum)
        .in('status', ['pendente', 'aprovada'])
        .lt('inicio', slotFimISO)
        .gt('fim', slotInicioISO)

      if (conflitosEquip && conflitosEquip.length > 0) {
        const totalUso = conflitosEquip.reduce(
          (acc, o: any) => acc + (o.quantidade ? Number(o.quantidade) : 1),
          0
        )
        if (totalUso + qtdEquipamento > estoqueTotal) {
          setFormErro(MSG_CONFLITO_CONCORRENCIA)
          setEnviando(false)
          await carregarOcupacoes()
          return
        }
      }
    }

    // 2. Tenta invocar a RPC com bloqueio pessimista (FOR UPDATE)
    const { error: rpcError } = await supabase.rpc(repetirSemanalmente ? 'solicitar_reservas_semanais' : 'solicitar_reserva', {
      p_tipo: tipo,
      p_id_recurso: idNum,
      p_id_usuario: meuIdUsuario,
      p_inicio: slotInicioISO,
      p_fim: slotFimISO,
      p_motivo: tipo === 'sala' ? motivo || null : null,
      p_quantidade_pessoas: tipo === 'sala' ? qtdPessoas : null,
      p_quantidade_equipamento: tipo === 'equipamento' ? qtdEquipamento : null,
      p_observacao: observacao || null,
      p_acessorios: acessoriosPayload,
      ...(repetirSemanalmente ? { p_data_termino: dataTermino } : {}),
    })

    if (!rpcError) {
      setEnviando(false)
      setSucesso(true)
      await carregarOcupacoes()
      await carregarRecurso()
      setTimeout(() => {
        setPendingSlot(null)
        setSucesso(false)
        setMotivo('')
        setObservacao('')
        setQtdPessoas(1)
        setQtdEquipamento(1)
        setAcessoriosSelecionados({})
        setRepetirSemanalmente(false)
        setDataTermino('')
      }, 1600)
      return
    }

    // Se houve erro de concorrência na RPC
    if (isErroManutencao(rpcError)) {
      setEnviando(false)
      setFormErro(rpcError.message || MSG_MANUTENCAO)
      await carregarOcupacoes()
      if (tipo === 'sala') await carregarAcessorios(pendingSlot.inicio, pendingSlot.fim)
      return
    }

    if (isErroConcorrencia(rpcError)) {
      setEnviando(false)
      setFormErro(repetirSemanalmente && rpcError.message?.startsWith('Série indisponível em ')
        ? rpcError.message
        : acessoriosPayload.length > 0 ? MSG_CONFLITO_ACESSORIO : MSG_CONFLITO_CONCORRENCIA)
      await carregarOcupacoes()
      if (tipo === 'sala') await carregarAcessorios(pendingSlot.inicio, pendingSlot.fim)
      return
    }

    // Se a RPC ainda não existe no Supabase (fallback para INSERT direto)
    const isRpcNaoExiste =
      rpcError.message.includes('function') ||
      rpcError.message.includes('not found') ||
      rpcError.code === '42883'

    if (isRpcNaoExiste) {
      if (repetirSemanalmente) {
        setEnviando(false)
        setFormErro('A repetição semanal ainda não foi habilitada no banco de dados.')
        return
      }
      if (acessoriosPayload.length > 0) {
        setEnviando(false)
        setFormErro('A reserva conjunta de acessórios ainda não foi habilitada no banco de dados.')
        return
      }

      const payload: Record<string, unknown> = {
        [coluna]: idNum,
        id_usuario: meuIdUsuario,
        inicio: slotInicioISO,
        fim: slotFimISO,
        status: 'pendente',
      }

      if (tipo === 'sala') {
        payload.motivo = motivo || null
        payload.quantidade_pessoas = qtdPessoas
        payload.observacao = observacao || null
      } else {
        payload.quantidade = qtdEquipamento
        payload.observacao = observacao || null
        payload.status_devolucao = 'pendente'
      }

      const { error: insertError } = await supabase.from(tabela).insert(payload)
      setEnviando(false)

      if (insertError) {
        if (isErroManutencao(insertError)) {
          setFormErro(insertError.message || MSG_MANUTENCAO)
        } else if (isErroConcorrencia(insertError)) {
          setFormErro(MSG_CONFLITO_CONCORRENCIA)
        } else {
          setFormErro(insertError.message)
        }
        await carregarOcupacoes()
        return
      }

      setSucesso(true)
      await carregarOcupacoes()
      await carregarRecurso()
      setTimeout(() => {
        setPendingSlot(null)
        setSucesso(false)
        setMotivo('')
        setObservacao('')
        setQtdPessoas(1)
        setQtdEquipamento(1)
        setAcessoriosSelecionados({})
      }, 1600)
      return
    }

    // Outro erro na RPC
    setEnviando(false)
    setFormErro(rpcError.message)
    await carregarOcupacoes()
    if (acessoriosPayload.length > 0) await carregarAcessorios(pendingSlot.inicio, pendingSlot.fim)
  }

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-(--color-ink-soft)">carregando…</p>
  if (erro || !recurso) return <p className="mx-auto max-w-6xl px-4 py-10 text-(--color-coral)">{erro}</p>

  const nome = recurso.nome
  const detalhe = tipo === 'sala' ? `Capacidade: ${(recurso as Sala).lotacao} pessoas` : `Estoque total: ${(recurso as Equipamento).quantidade}`

  const equipamentoSemEstoque = tipo === 'equipamento' && (recurso as Equipamento).quantidade === 0
  const statusAtual = equipamentoSemEstoque ? 'manutenção' : recurso.status
  const indisponivel = recurso.status !== 'livre' || equipamentoSemEstoque
  const acessoriosNoResumo = acessorios
    .filter((acessorio) => Object.prototype.hasOwnProperty.call(acessoriosSelecionados, acessorio.id))
    .map((acessorio) => ({
      ...acessorio,
      quantidadeSelecionada: acessoriosSelecionados[acessorio.id],
    }))

  const imgInfo = obterImagemRecurso(tipo as TipoRecurso, nome)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <button onClick={() => navigate(-1)} className="mb-6 text-sm text-(--color-ink-soft) hover:text-(--color-cyan)">
        ← voltar ao catálogo
      </button>

      {/* Banner / Foto Temática do Recurso */}
      <div className={`relative mb-6 h-52 md:h-64 w-full overflow-hidden rounded-2xl border border-(--color-border) bg-gradient-to-br ${imgInfo.gradienteFallback} shadow-sm`}>
        <img
          src={imgInfo.url}
          alt={imgInfo.alt}
          className="h-full w-full object-cover"
          onError={(e) => {
            ;(e.target as HTMLElement).style.display = 'none'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        <div className="absolute top-4 left-4 flex gap-2">
          <span className="rounded-full bg-black/50 backdrop-blur-md px-3 py-1 text-xs font-semibold text-white border border-white/20">
            {tipo === 'sala' ? '🏛️ Sala' : '⚙️ Equipamento'}
          </span>
          <span className="rounded-full bg-black/40 backdrop-blur-md px-3 py-1 text-xs font-medium text-white/90 border border-white/20">
            {imgInfo.categoria}
          </span>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">{tipo}</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{nome}</h1>
          <p className="mt-1 text-(--color-ink-soft)">{detalhe}</p>
        </div>
        <StatusBadge status={statusAtual} tipo="recurso" />
      </div>

      {recurso.regras_uso && (
        <div className="card mb-8 p-5">
          <h3 className="kicker">
            Regras de Uso
          </h3>
          <p className="text-sm whitespace-pre-line text-(--color-ink-soft)">
            {recurso.regras_uso}
          </p>
        </div>
      )}

      {indisponivel ? (
        <p className="alert-error">
          {equipamentoSemEstoque
            ? 'Este recurso está em manutenção e não pode ser reservado no momento.'
            : STATUS_MSG[recurso.status] ?? 'Este recurso não está disponível para reservas no momento.'}
        </p>
      ) : !user ? (
        <p className="card p-5 text-sm text-(--color-ink-soft)">
          <a href="/login" className="font-medium text-(--color-cyan) hover:underline">Entre na sua conta</a> para solicitar uma reserva.
        </p>
      ) : (
        <>
          {role === 'admin' && (
            <div className="alert-info mb-4 text-xs">
              Modo de visualização administrativa. Apenas alunos/pesquisadores podem realizar solicitações de reserva.
            </div>
          )}

          <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-thin pb-2">
            {dias.map((d) => {
              const ativo = d.toDateString() === selectedDate.toDateString()
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                  className={`shrink-0 rounded-2xl border px-3.5 py-2.5 text-center text-xs transition-colors ${
                    ativo ? 'border-transparent bg-(--color-cyan) text-white' : 'border-(--color-border) bg-white text-(--color-ink-soft) hover:bg-black/5'
                  }`}
                >
                  <div className="uppercase">{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                  <div className="text-sm font-semibold">{d.getDate()}</div>
                </button>
              )
            })}
          </div>

          {avisoLimiteUsuario && role === 'aluno' && (
            <p className="alert-error mb-4">
              {avisoLimiteUsuario}{' '}
              <a href="/planos" className="font-semibold underline">
                Ver planos
              </a>
            </p>
          )}

          <AvailabilityGrid
            date={selectedDate}
            ocupacoes={ocupacoes}
            totalEstoque={tipo === 'equipamento' ? (recurso as Equipamento).quantidade : 1}
            isEquipamento={tipo === 'equipamento'}
            onConfirmSelection={role === 'aluno' && !avisoLimiteUsuario ? abrirConfirmacao : undefined}
          />
        </>
      )}

      {pendingSlot && (
        <Modal title="Confirmar solicitação de reserva" onClose={() => !enviando && setPendingSlot(null)}>
          {sucesso ? (
            <p className="rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-3 text-sm text-(--color-green)">
              {repetirSemanalmente ? `${quantidadeOcorrencias} solicitações enviadas! ` : 'Solicitação enviada! '}
              {repetirSemanalmente ? 'Elas ficarão' : 'Ela ficará'} com status <strong>Pendente</strong> até a aprovação de um administrador.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-(--color-border) bg-(--color-paper) p-3 font-mono text-sm">
                <p><span className="text-(--color-ink-soft)">{tipo === 'sala' ? 'Sala: ' : 'Equipamento: '}</span>{nome}</p>
                <p className="text-(--color-ink-soft)">
                  {pendingSlot.inicio.toLocaleDateString('pt-BR')} · {pendingSlot.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {pendingSlot.fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ({duracaoHorasSlot}h)
                </p>
                {role === 'aluno' && (
                  <p className="mt-1 text-xs text-(--color-ink-soft)">
                    Cota semanal utilizada: <strong className="text-(--color-ink)">{horasSemanaUsuario}h de {TETO_HORAS_SEMANAIS}h</strong>
                  </p>
                )}
                {tipo === 'sala' && (
                  <p className="mt-1 text-sm font-sans text-(--color-ink)">
                    <span className="text-(--color-ink-soft)">Capacidade máxima permitida: </span>
                    <strong className="font-semibold text-(--color-cyan)">{(recurso as Sala).lotacao} pessoas</strong>
                  </p>
                )}
                {tipo === 'sala' && (
                  <p className="mt-2 border-t border-(--color-border) pt-2">
                    <span className="text-(--color-ink-soft)">Acessórios: </span>
                    {acessoriosNoResumo.length > 0
                      ? acessoriosNoResumo.map((item) => `${item.nome} × ${item.quantidadeSelecionada}`).join(', ')
                      : 'nenhum'}
                  </p>
                )}
              </div>

              <fieldset className="rounded-md border border-(--color-border) p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={repetirSemanalmente}
                    onChange={(e) => {
                      setRepetirSemanalmente(e.target.checked)
                      setDataTermino(e.target.checked ? dataLocalISO(somarDias(pendingSlot.inicio, 21)) : '')
                      setFormErro(null)
                    }}
                  />
                  Repetir semanalmente
                </label>
                {repetirSemanalmente && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Data de término</span>
                      <input
                        type="date"
                        aria-label="Data de término"
                        min={dataTerminoMinima}
                        max={dataTerminoMaxima}
                        value={dataTermino}
                        onChange={(e) => setDataTermino(e.target.value)}
                        className="input"
                      />
                    </label>
                    <p className="text-xs text-(--color-ink-soft)">
                      {repeticaoInvalida
                        ? 'Escolha uma data a partir da próxima semana, com até 52 reservas.'
                        : `${quantidadeOcorrencias} reservas no mesmo dia da semana e horário, incluindo a primeira. A data de término é inclusiva.`}
                    </p>
                  </div>
                )}
              </fieldset>

              {limiteHorasExcedido && (
                <div className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) p-3 text-xs text-(--color-coral)">
                  Limite semanal de horas excedido. Esta solicitação ({duracaoHorasSlot}h) ultrapassa o teto semanal de {TETO_HORAS_SEMANAIS}h (você já possui {horasSemanaUsuario}h agendadas nesta semana).
                </div>
              )}

              {tipo === 'sala' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Motivo da reserva</span>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" placeholder="Ex: reunião de projeto" />
                  </label>
                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-sm font-medium">
                      <span>Quantidade de pessoas / Ocupantes</span>
                      <span className="font-mono text-xs text-(--color-ink-soft)">
                        (lotação máx.: {(recurso as Sala).lotacao} pessoas)
                      </span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={qtdPessoas}
                      onChange={(e) => setQtdPessoas(Number(e.target.value))}
                      className="input"
                    />
                    {(!Number.isInteger(qtdPessoas) || qtdPessoas < 1) && (
                      <span className="mt-1 block text-xs text-(--color-coral)">
                        Informe um número inteiro maior que zero.
                      </span>
                    )}
                    {qtdPessoas > (recurso as Sala).lotacao && (
                      <span className="mt-1 block text-xs text-(--color-coral)">
                        A lotação máxima permitida para este espaço é de {(recurso as Sala).lotacao} pessoas.
                      </span>
                    )}
                  </label>

                  <fieldset className="rounded-md border border-(--color-border) p-3">
                    <legend className="px-1 text-sm font-medium">Acessórios adicionais (opcional)</legend>
                    <p className="mb-3 text-xs text-(--color-ink-soft)">
                      As quantidades são reservadas para o mesmo período da sala.
                    </p>

                    {carregandoAcessorios ? (
                      <p className="font-mono text-xs text-(--color-ink-soft)">consultando disponibilidade…</p>
                    ) : erroAcessorios ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs text-(--color-coral)">{erroAcessorios}</p>
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => void carregarAcessorios(pendingSlot.inicio, pendingSlot.fim)}
                        >
                          tentar novamente
                        </button>
                      </div>
                    ) : acessorios.length === 0 ? (
                      <p className="text-xs text-(--color-ink-soft)">Nenhum acessório disponível neste período.</p>
                    ) : (
                      <div className="space-y-2">
                        {acessorios.map((acessorio) => {
                          const quantidadeSelecionada = acessoriosSelecionados[acessorio.id] ?? 0
                          const selecionado = Object.prototype.hasOwnProperty.call(acessoriosSelecionados, acessorio.id)

                          return (
                            <div key={acessorio.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-black/[0.03] p-2.5">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selecionado}
                                  onChange={(e) => {
                                    setAcessoriosSelecionados((atuais) => {
                                      const proximos = { ...atuais }
                                      if (e.target.checked) proximos[acessorio.id] = 1
                                      else delete proximos[acessorio.id]
                                      return proximos
                                    })
                                  }}
                                />
                                <span className="truncate text-sm">{acessorio.nome}</span>
                                <span className="shrink-0 font-mono text-[11px] text-(--color-ink-soft)">
                                  {acessorio.disponivel} disponível(is)
                                </span>
                              </label>

                              {selecionado && (
                                <label className="flex items-center gap-2 text-xs">
                                  <span>Qtd.</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={acessorio.disponivel}
                                    aria-label={`Quantidade de ${acessorio.nome}`}
                                    value={quantidadeSelecionada}
                                    onChange={(e) => {
                                      const quantidade = Number(e.target.value)
                                      setAcessoriosSelecionados((atuais) => ({ ...atuais, [acessorio.id]: quantidade }))
                                    }}
                                    className="input w-20 py-1"
                                  />
                                  {(!Number.isInteger(quantidadeSelecionada) ||
                                    quantidadeSelecionada < 1 ||
                                    quantidadeSelecionada > acessorio.disponivel) && (
                                    <span className="text-(--color-coral)">
                                      Informe entre 1 e {acessorio.disponivel}.
                                    </span>
                                  )}
                                </label>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </fieldset>
                </>
              )}

              {tipo === 'equipamento' && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">
                    Quantidade a reservar <span className="font-mono text-xs text-(--color-ink-soft)">(Disponível neste horário: {disponivelNoSlot} de {estoqueTotal})</span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={disponivelNoSlot}
                    value={qtdEquipamento}
                    onChange={(e) => setQtdEquipamento(Number(e.target.value))}
                    className="input"
                  />
                  {qtdEquipamento > disponivelNoSlot && (
                    <span className="mt-1 block text-xs text-(--color-coral)">Excede a quantidade disponível para este intervalo de horário.</span>
                  )}
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Observações (opcional)</span>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className="input" rows={2} />
              </label>

              {recurso.regras_uso && (
                <label className="mt-2 flex items-start gap-2 cursor-pointer rounded-md border border-(--color-border) bg-black/5 p-3">
                  <input
                    type="checkbox"
                    checked={aceitouRegras}
                    onChange={(e) => setAceitouRegras(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-(--color-ink-soft) leading-tight">
                    Declaro que li e concordo com as regras de uso específicas deste recurso.
                  </span>
                </label>
              )}

              {formErro && (
                <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">
                  {formErro}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setPendingSlot(null)} disabled={enviando}>
                  cancelar
                </button>
                <button
                  className="btn-primary"
                  onClick={confirmarReserva}
                  disabled={
                    enviando ||
                    repeticaoInvalida ||
                    limiteHorasExcedido ||
                    (tipo === 'sala' && carregandoAcessorios) ||
                    (recurso.regras_uso && !aceitouRegras) ||
                    (tipo === 'sala' && (qtdPessoas > (recurso as Sala).lotacao || !Number.isInteger(qtdPessoas) || qtdPessoas < 1)) ||
                    (tipo === 'sala' && acessoriosNoResumo.some((item) =>
                      !Number.isInteger(item.quantidadeSelecionada) ||
                      item.quantidadeSelecionada < 1 ||
                      item.quantidadeSelecionada > item.disponivel
                    )) ||
                    (tipo === 'equipamento' && (disponivelNoSlot <= 0 || qtdEquipamento > disponivelNoSlot || qtdEquipamento < 1))
                  }
                >
                  {enviando ? 'enviando…' : 'confirmar solicitação'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
