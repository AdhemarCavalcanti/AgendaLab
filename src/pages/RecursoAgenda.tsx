import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Equipamento, Sala, TipoRecurso } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { AvailabilityGrid, type Ocupacao } from '../components/AvailabilityGrid'
import { Modal } from '../components/Modal'

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

const STATUS_MSG: Record<string, string> = {
  ocupado: 'Este recurso está marcado como ocupado pelo administrador e não pode ser reservado no momento.',
  manutencao: 'Este recurso está em manutenção e não pode ser reservado no momento.',
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
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [formErro, setFormErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const dias = useMemo(() => proximosDias(14), [])
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

    const inicioJanela = new Date(selectedDate)
    inicioJanela.setDate(inicioJanela.getDate() - 1)
    inicioJanela.setHours(0, 0, 0, 0)

    const fimJanela = new Date(selectedDate)
    fimJanela.setDate(fimJanela.getDate() + 2)
    fimJanela.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
      .from(tabela)
      .select('inicio, fim, status, id_usuario')
      .eq(coluna, idNum)
      .in('status', ['pendente', 'aprovada'])
      .gte('inicio', inicioJanela.toISOString())
      .lte('inicio', fimJanela.toISOString())

    if (!error && data) {
      setOcupacoes(
        data.map((o) => ({
          inicio: o.inicio,
          fim: o.fim,
          status: o.status,
          mine: o.id_usuario === meuIdUsuario,
        })) as unknown as Ocupacao[]
      )
    }
  }

  useEffect(() => {
    carregarRecurso()
  }, [tipo, id])

  useEffect(() => {
    carregarOcupacoes()
  }, [tipo, id, selectedDate])

  function abrirConfirmacao(inicio: Date, fim: Date) {
    setFormErro(null)
    setQtdPessoas(1)
    setPendingSlot({ inicio, fim })
  }

  async function confirmarReserva() {
    if (!pendingSlot || !user || !tipo || !recurso || meuIdUsuario === null) return

    if (tipo === 'sala' && qtdPessoas > (recurso as Sala).lotacao) {
      setFormErro(`A quantidade de pessoas (${qtdPessoas}) excede a lotação máxima da sala (${(recurso as Sala).lotacao}).`)
      return
    }

    setEnviando(true)
    setFormErro(null)

    const { data: conflitos } = await supabase
      .from(tabela)
      .select('id')
      .eq(coluna, idNum)
      .in('status', ['pendente', 'aprovada'])
      .lt('inicio', pendingSlot.fim.toISOString())
      .gt('fim', pendingSlot.inicio.toISOString())

    if (conflitos && conflitos.length > 0) {
      setFormErro('Horário reservado recentemente por outro usuário. Escolha outro horário.')
      setEnviando(false)
      await carregarOcupacoes()
      return
    }

    const payload: Record<string, unknown> = {
      [coluna]: idNum,
      id_usuario: meuIdUsuario,
      inicio: pendingSlot.inicio.toISOString(),
      fim: pendingSlot.fim.toISOString(),
      status: 'pendente',
    }

    if (tipo === 'sala') {
      payload.motivo = motivo || null
      payload.quantidade_pessoas = qtdPessoas
      payload.observacao = observacao || null
    } else {
      payload.observacao = observacao || null
      payload.status_devolucao = 'pendente'
    }

    const { error } = await supabase.from(tabela).insert(payload)
    setEnviando(false)

    if (error) {
      if (error.code === '23P01' || error.message.toLowerCase().includes('exclu')) {
        setFormErro('Horário reservado recentemente por outro usuário. Escolha outro horário.')
      } else {
        setFormErro(error.message)
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
    }, 1600)
  }

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 font-mono text-sm text-(--color-ink-soft)">carregando…</p>
  if (erro || !recurso) return <p className="mx-auto max-w-6xl px-4 py-10 text-(--color-coral)">{erro}</p>

  const nome = recurso.nome
  const detalhe = tipo === 'sala' ? `Capacidade: ${(recurso as Sala).lotacao} pessoas` : `Quantidade: ${(recurso as Equipamento).quantidade}`

  const equipamentoSemEstoque = tipo === 'equipamento' && (recurso as Equipamento).quantidade === 0
  const indisponivel = recurso.status !== 'livre' || equipamentoSemEstoque

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <button onClick={() => navigate(-1)} className="mb-6 text-sm text-(--color-ink-soft) hover:text-(--color-cyan)">
        ← voltar ao catálogo
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">{tipo}</p>
          <h1 className="font-display text-3xl font-bold">{nome}</h1>
          <p className="mt-1 text-(--color-ink-soft)">{detalhe}</p>
        </div>
        <StatusBadge status={equipamentoSemEstoque ? 'ocupado' : recurso.status} tipo="recurso" />
      </div>

      {/* Regras de Uso - Exibidas antes das regras de agenda/horários */}
      {recurso.regras_uso && (
        <div className="mb-8 rounded-lg border border-(--color-border) bg-black/5 p-4">
          <h3 className="mb-1 font-mono text-xs font-semibold uppercase tracking-wider text-(--color-cyan)">
            📋 Regras de Uso
          </h3>
          <p className="text-sm whitespace-pre-line text-(--color-ink-soft)">
            {recurso.regras_uso}
          </p>
        </div>
      )}

      {indisponivel ? (
        <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) p-4 text-sm text-(--color-coral)">
          {equipamentoSemEstoque
            ? 'Todos os equipamentos estão ocupados.'
            : STATUS_MSG[recurso.status] ?? 'Este recurso não está disponível para reservas no momento.'}
        </p>
      ) : !user ? (
        <p className="rounded-md border border-(--color-border) bg-(--color-surface) p-4 text-sm text-(--color-ink-soft)">
          <a href="/login" className="font-medium text-(--color-cyan) hover:underline">Entre na sua conta</a> para solicitar uma reserva.
        </p>
      ) : (
        <>
          {role === 'admin' && (
            <div className="mb-4 rounded-md border border-(--color-cyan)/30 bg-(--color-cyan-soft) p-3 text-xs text-(--color-cyan)">
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
                  className={`shrink-0 rounded-md border px-3 py-2 text-center font-mono text-xs transition-colors ${
                    ativo ? 'border-(--color-cyan) bg-(--color-cyan) text-white' : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
                  }`}
                >
                  <div className="uppercase">{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                  <div className="text-sm font-semibold">{d.getDate()}</div>
                </button>
              )
            })}
          </div>

          <AvailabilityGrid
            date={selectedDate}
            ocupacoes={ocupacoes}
            onConfirmSelection={role === 'aluno' ? abrirConfirmacao : undefined}
          />
        </>
      )}

      {pendingSlot && (
        <Modal title="Confirmar solicitação de reserva" onClose={() => !enviando && setPendingSlot(null)}>
          {sucesso ? (
            <p className="rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-3 text-sm text-(--color-green)">
              Solicitação enviada! Ela ficará com status <strong>Pendente</strong> até a aprovação de um administrador.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-(--color-border) bg-(--color-paper) p-3 font-mono text-sm">
                <p>{nome}</p>
                <p className="text-(--color-ink-soft)">
                  {pendingSlot.inicio.toLocaleDateString('pt-BR')} · {pendingSlot.inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {pendingSlot.fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {tipo === 'sala' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Motivo da reserva</span>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" placeholder="Ex: reunião de projeto" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">
                      Quantidade de pessoas <span className="font-mono text-xs text-(--color-ink-soft)">(lotação máx.: {(recurso as Sala).lotacao})</span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={qtdPessoas}
                      onChange={(e) => setQtdPessoas(Number(e.target.value))}
                      className="input"
                    />
                    {qtdPessoas > (recurso as Sala).lotacao && (
                      <span className="mt-1 block text-xs text-(--color-coral)">Excede a lotação máxima da sala.</span>
                    )}
                  </label>
                </>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium">Observações (opcional)</span>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className="input" rows={2} />
              </label>

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
                  disabled={enviando || (tipo === 'sala' && qtdPessoas > (recurso as Sala).lotacao)}
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