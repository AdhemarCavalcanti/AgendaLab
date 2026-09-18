import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { BloqueioManutencao, Equipamento, Sala, StatusRecurso, TipoRecurso } from '../../lib/types'
import { StatusBadge } from '../../components/StatusBadge'
import { Modal } from '../../components/Modal'

type SalaComRegras = Sala & { regras_uso?: string }
type EquipamentoComRegras = Equipamento & { regras_uso?: string; quantidade_manutencao?: number }
type RecursoComRegras = SalaComRegras | EquipamentoComRegras
type AlvoBloqueio = { tipo: TipoRecurso; item: RecursoComRegras }

interface ReservaAfetadaManutencao {
  id: number
  status: 'pendente' | 'aprovada'
  inicio: string
  fim: string
  usuario_nome: string
  usuario_email: string
  usuario_matricula: string | null
  quantidade: number | null
}

const STATUS_OPTS: StatusRecurso[] = ['livre', 'ocupado']

function formatarDataHora(data: string) {
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function paraDatetimeLocal(data: Date) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function periodoInicial() {
  const inicio = new Date()
  inicio.setMinutes(0, 0, 0)
  inicio.setHours(inicio.getHours() + 1)
  const fim = new Date(inicio)
  fim.setHours(fim.getHours() + 1)
  return { inicio: paraDatetimeLocal(inicio), fim: paraDatetimeLocal(fim) }
}

export function AdminRecursos() {
  const [aba, setAba] = useState<TipoRecurso>('sala')
  const [salas, setSalas] = useState<SalaComRegras[]>([])
  const [equipamentos, setEquipamentos] = useState<EquipamentoComRegras[]>([])
  const [bloqueios, setBloqueios] = useState<BloqueioManutencao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<SalaComRegras | EquipamentoComRegras | null>(null)

  // Estado para controlar a modal de manutenção parcial em equipamentos
  const [equipamentoManutencao, setEquipamentoManutencao] = useState<{
    item: EquipamentoComRegras
    acao: 'entrar' | 'sair'
  } | null>(null)
  const [qtdManutencaoInput, setQtdManutencaoInput] = useState<number>(1)
  const [enviandoManutencao, setEnviandoManutencao] = useState(false)
  const [alvoBloqueio, setAlvoBloqueio] = useState<AlvoBloqueio | null>(null)
  const [sucessoBloqueio, setSucessoBloqueio] = useState<string | null>(null)
  // Trava de monetização: verifica o plano e conta as salas
  const isPremium = localStorage.getItem('agendalab_plano') === 'premium';
  const limiteSalasAtingido = !isPremium && aba === 'sala' && salas.length >= 2;

  async function carregar() {
    setLoading(true)
    setErro(null)
    const [{ data: s, error: eS }, { data: e, error: eE }, { data: b, error: eB }] = await Promise.all([
      supabase.from('salas').select('*').order('nome', { ascending: true }),
      supabase.from('equipamentos').select('*').order('nome', { ascending: true }),
      supabase
        .from('bloqueios_manutencao')
        .select('*')
        .gte('fim', new Date().toISOString())
        .order('inicio', { ascending: true }),
    ])
    if (eS || eE || eB) setErro((eS ?? eE ?? eB)?.message ?? null)
    setSalas((s as SalaComRegras[]) ?? [])
    setEquipamentos((e as EquipamentoComRegras[]) ?? [])
    setBloqueios((b as BloqueioManutencao[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function excluir(id: number) {
    if (!confirm('Excluir este recurso permanentemente? Esta ação não pode ser desfeita.')) return
    const tabela = aba === 'sala' ? 'salas' : 'equipamentos'
    const coluna = aba === 'sala' ? 'id_sala' : 'id'
    const { error } = await supabase.from(tabela).delete().eq(coluna, id)
    if (error) alert('Erro ao excluir: ' + error.message)
    else carregar()
  }

  async function reativarSala(item: SalaComRegras) {
    const { error } = await supabase.from('salas').update({ status: 'livre' }).eq('id_sala', item.id_sala)
    if (error) alert('Erro: ' + error.message)
    else carregar()
  }

  async function cancelarBloqueio(id: number) {
    if (!confirm('Cancelar esta interdição programada?')) return
    const { error } = await supabase.from('bloqueios_manutencao').delete().eq('id', id)
    if (error) alert('Erro ao cancelar interdição: ' + error.message)
    else carregar()
  }

  function abrirModalManutencaoEquipamento(item: EquipamentoComRegras, acao: 'entrar' | 'sair') {
    setEquipamentoManutencao({ item, acao })
    setQtdManutencaoInput(1)
  }

  async function confirmarManutencaoEquipamento() {
    if (!equipamentoManutencao || qtdManutencaoInput <= 0) return

    const { item, acao } = equipamentoManutencao
    const qtdAtual = item.quantidade ?? 0
    const qtdManutencaoAtual = item.quantidade_manutencao ?? 0

    let novaQtd = qtdAtual
    let novaQtdManutencao = qtdManutencaoAtual

    if (acao === 'entrar') {
      if (qtdManutencaoInput > qtdAtual) {
        alert('A quantidade em manutenção não pode ser maior do que o estoque disponível.')
        return
      }
      novaQtd = qtdAtual - qtdManutencaoInput
      novaQtdManutencao = qtdManutencaoAtual + qtdManutencaoInput
    } else {
      // TRAVA DE SEGURANÇA: Impede devolução superior à quantidade que está em manutenção
      if (qtdManutencaoInput > qtdManutencaoAtual) {
        alert(`A quantidade a retornar (${qtdManutencaoInput}) não pode ser maior do que a quantidade em manutenção (${qtdManutencaoAtual}).`)
        return
      }
      novaQtd = qtdAtual + qtdManutencaoInput
      novaQtdManutencao = Math.max(0, qtdManutencaoAtual - qtdManutencaoInput)
    }

    setEnviandoManutencao(true)

    // A TRIGGER trg_validar_e_ajustar_manutencao_equipamento no PostgreSQL
    // atualiza o campo status automaticamente ao salvar a requisição.
    const { error } = await supabase
      .from('equipamentos')
      .update({
        quantidade: novaQtd,
        quantidade_manutencao: novaQtdManutencao,
      })
      .eq('id', item.id)

    setEnviandoManutencao(false)

    if (error) {
      alert('Erro ao atualizar manutenção: ' + error.message)
    } else {
      setEquipamentoManutencao(null)
      carregar()
    }
  }

  const lista = aba === 'sala' ? salas : equipamentos
  const bloqueiosDaAba = bloqueios.filter((bloqueio) =>
    aba === 'sala' ? bloqueio.id_sala !== null : bloqueio.id_equipamento !== null
  )

  function nomeRecursoDoBloqueio(bloqueio: BloqueioManutencao) {
    if (bloqueio.id_sala !== null) {
      return salas.find((sala) => sala.id_sala === bloqueio.id_sala)?.nome ?? `Sala #${bloqueio.id_sala}`
    }
    return equipamentos.find((equipamento) => equipamento.id === bloqueio.id_equipamento)?.nome ?? `Equipamento #${bloqueio.id_equipamento}`
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
          <h1 className="font-display text-3xl font-bold">Gestão de recursos</h1>
        </div>
        
        <div className="flex flex-col items-end sm:items-start gap-1">
          <button
            className="btn-primary"
            onClick={() => {
              setEditando(null)
              setModalAberto(true)
            }}
            disabled={limiteSalasAtingido}
          >
            + novo {aba}
          </button>
          
          {limiteSalasAtingido && (
            <span className="text-[10px] text-(--color-coral) font-medium max-w-[200px] text-right sm:text-left leading-tight animate-fade-in">
              Limite de 2 salas atingido. <a href="/admin/planos" className="underline font-bold hover:text-(--color-coral)/80">Faça upgrade para Premium</a>
            </span>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        {(['sala', 'equipamento'] as TipoRecurso[]).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              aba === t ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)' : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
            }`}
          >
            {t === 'sala' ? 'salas' : 'equipamentos'}
          </button>
        ))}
      </div>

      {erro && <p className="mb-4 rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}
      {sucessoBloqueio && (
        <p className="mb-4 rounded-md border border-(--color-green)/30 bg-(--color-green-soft) px-3 py-2 text-sm text-(--color-green)">
          {sucessoBloqueio}
        </p>
      )}

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-(--color-border) p-10 text-center text-(--color-ink-soft)">Nenhum recurso cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--color-border)">
          <table className="w-full text-left text-sm">
            <thead className="bg-(--color-paper) font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">{aba === 'sala' ? 'Capacidade' : 'Disponível / Manutenção'}</th>
                <th className="px-4 py-3">Regras de Uso</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((item) => {
                const id = aba === 'sala' ? (item as SalaComRegras).id_sala : (item as EquipamentoComRegras).id
                return (
                  <tr key={id} className="border-t border-(--color-border)">
                    <td className="px-4 py-3 font-medium">{item.nome}</td>
                    <td className="px-4 py-3 font-mono">
                      {aba === 'sala' ? (
                        (item as SalaComRegras).lotacao
                      ) : (
                        <span>
                          {(item as EquipamentoComRegras).quantidade}{' '}
                          <span className="text-xs text-(--color-ink-soft)">
                            ({(item as EquipamentoComRegras).quantidade_manutencao ?? 0} em manut.)
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="line-clamp-2 text-xs text-(--color-ink-soft)">
                        {item.regras_uso ? item.regras_uso : <span className="italic opacity-50">Nenhuma regra cadastrada</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} tipo="recurso" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(item)
                            setModalAberto(true)
                          }}
                          className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                        >
                          editar
                        </button>

                        <button
                          onClick={() => {
                            setSucessoBloqueio(null)
                            setAlvoBloqueio({ tipo: aba, item })
                          }}
                          className="rounded-md border border-(--color-amber)/40 bg-(--color-amber-soft) px-2.5 py-1 text-xs font-medium text-(--color-amber) hover:bg-(--color-amber-soft)/70"
                        >
                          interditar período
                        </button>

                        {aba === 'sala' ? (
                          item.status === 'manutencao' && (
                          <button
                            onClick={() => reativarSala(item as SalaComRegras)}
                            className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                          >
                            reativar
                          </button>
                          )
                        ) : (
                          <>
                            <button
                              onClick={() => abrirModalManutencaoEquipamento(item as EquipamentoComRegras, 'entrar')}
                              className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5"
                              disabled={(item as EquipamentoComRegras).quantidade <= 0}
                            >
                              + manutenção
                            </button>
                            {((item as EquipamentoComRegras).quantidade_manutencao ?? 0) > 0 && (
                              <button
                                onClick={() => abrirModalManutencaoEquipamento(item as EquipamentoComRegras, 'sair')}
                                className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium hover:bg-black/5 text-(--color-cyan)"
                              >
                                retornar
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => excluir(id)}
                          className="rounded-md border border-(--color-border) px-2.5 py-1 text-xs font-medium text-(--color-coral) hover:bg-(--color-coral-soft)"
                        >
                          excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-(--color-amber)">agenda de manutenção</p>
            <h2 className="font-display text-xl font-semibold">Interdições atuais e futuras</h2>
          </div>
          <span className="font-mono text-xs text-(--color-ink-soft)">{bloqueiosDaAba.length} registro(s)</span>
        </div>

        {bloqueiosDaAba.length === 0 ? (
          <p className="rounded-lg border border-dashed border-(--color-border) bg-(--color-surface) p-5 text-sm text-(--color-ink-soft)">
            Nenhuma interdição programada para {aba === 'sala' ? 'salas' : 'equipamentos'}.
          </p>
        ) : (
          <div className="space-y-2">
            {bloqueiosDaAba.map((bloqueio) => (
              <div
                key={bloqueio.id}
                className="flex flex-col gap-3 rounded-lg border border-(--color-amber)/40 bg-(--color-amber-soft) p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="font-medium">{nomeRecursoDoBloqueio(bloqueio)}</p>
                    <StatusBadge status="manutencao" tipo="recurso" />
                  </div>
                  <p className="font-mono text-xs text-(--color-ink-soft)">
                    {formatarDataHora(bloqueio.inicio)} → {formatarDataHora(bloqueio.fim)}
                  </p>
                  <p className="mt-1 text-sm text-(--color-amber)">{bloqueio.motivo}</p>
                </div>
                <button
                  onClick={() => cancelarBloqueio(bloqueio.id)}
                  className="shrink-0 rounded-md border border-(--color-coral)/30 bg-white px-3 py-1.5 text-xs font-medium text-(--color-coral) hover:bg-(--color-coral-soft)"
                >
                  cancelar interdição
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {modalAberto && (
        <RecursoForm
          tipo={aba}
          item={editando}
          onClose={() => setModalAberto(false)}
          onSaved={() => {
            setModalAberto(false)
            carregar()
          }}
        />
      )}

      {equipamentoManutencao && (
        <Modal
          title={
            equipamentoManutencao.acao === 'entrar'
              ? `Enviar para manutenção: ${equipamentoManutencao.item.nome}`
              : `Retornar da manutenção: ${equipamentoManutencao.item.nome}`
          }
          onClose={() => setEquipamentoManutencao(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-(--color-ink-soft)">
              {equipamentoManutencao.acao === 'entrar'
                ? `Estoque livre atual: ${equipamentoManutencao.item.quantidade}. Quantas unidades deseja colocar em manutenção?`
                : `Unidades em manutenção atual: ${equipamentoManutencao.item.quantidade_manutencao ?? 0}. Quantas unidades estão retornando para o estoque livre?`}
            </p>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Quantidade</span>
              <input
                type="number"
                min={1}
                max={
                  equipamentoManutencao.acao === 'entrar'
                    ? equipamentoManutencao.item.quantidade
                    : (equipamentoManutencao.item.quantidade_manutencao ?? 0) // Limita a entrada até a quantidade atual em manutenção
                }
                value={qtdManutencaoInput}
                onChange={(e) => setQtdManutencaoInput(Number(e.target.value))}
                className="input"
              />
            </label>

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEquipamentoManutencao(null)} disabled={enviandoManutencao}>
                cancelar
              </button>
              <button className="btn-primary" onClick={confirmarManutencaoEquipamento} disabled={enviandoManutencao || qtdManutencaoInput < 1}>
                {enviandoManutencao ? 'salvando…' : 'confirmar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {alvoBloqueio && (
        <BloqueioManutencaoForm
          alvo={alvoBloqueio}
          onClose={() => setAlvoBloqueio(null)}
          onSaved={(reservasCanceladas) => {
            setAlvoBloqueio(null)
            setSucessoBloqueio(
              reservasCanceladas > 0
                ? `Interdição criada e ${reservasCanceladas} reserva(s) cancelada(s). Os usuários foram notificados.`
                : 'Interdição criada com sucesso.'
            )
            carregar()
          }}
        />
      )}
    </div>
  )
}

function BloqueioManutencaoForm({
  alvo,
  onClose,
  onSaved,
}: {
  alvo: AlvoBloqueio
  onClose: () => void
  onSaved: (reservasCanceladas: number) => void
}) {
  const [periodo] = useState(periodoInicial)
  const [inicio, setInicio] = useState(periodo.inicio)
  const [fim, setFim] = useState(periodo.fim)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [reservasAfetadas, setReservasAfetadas] = useState<ReservaAfetadaManutencao[]>([])

  const nome = alvo.item.nome
  const idRecurso = alvo.tipo === 'sala'
    ? (alvo.item as SalaComRegras).id_sala
    : (alvo.item as EquipamentoComRegras).id

  function limparConfirmacao() {
    setReservasAfetadas([])
    setErro(null)
  }

  async function enviarInterdicao(confirmarCancelamento: boolean) {
    const motivoLimpo = motivo.trim()
    const inicioData = new Date(inicio)
    const fimData = new Date(fim)

    if (!motivoLimpo) {
      setErro('Informe a justificativa da manutenção.')
      return
    }
    if (Number.isNaN(inicioData.getTime()) || Number.isNaN(fimData.getTime()) || fimData <= inicioData) {
      setErro('O fim da interdição deve ser posterior ao início.')
      return
    }

    setSalvando(true)
    setErro(null)

    const { data, error } = await supabase.rpc('interditar_recurso_manutencao', {
      p_tipo: alvo.tipo,
      p_id_recurso: idRecurso,
      p_inicio: inicioData.toISOString(),
      p_fim: fimData.toISOString(),
      p_motivo: motivoLimpo,
      p_confirmar_cancelamento: confirmarCancelamento,
      p_ids_reservas_confirmadas: confirmarCancelamento
        ? reservasAfetadas.map((reserva) => reserva.id)
        : null,
    })
    setSalvando(false)

    if (error) {
      const rpcAusente = error.code === '42883' || error.message.toLowerCase().includes('function')
      setErro(
        rpcAusente
          ? 'A atualização de cancelamento por manutenção ainda não foi aplicada no Supabase.'
          : error.message
      )
      return
    }

    const resultado = data as {
      sucesso?: boolean
      requer_confirmacao?: boolean
      lista_alterada?: boolean
      reservas_afetadas?: ReservaAfetadaManutencao[]
      reservas_canceladas?: number
    } | null

    if (resultado?.requer_confirmacao) {
      setReservasAfetadas(resultado.reservas_afetadas ?? [])
      if (resultado.lista_alterada) {
        setErro('As reservas afetadas mudaram enquanto você confirmava. Revise a lista atualizada e confirme novamente.')
      }
      return
    }

    if (!resultado?.sucesso) {
      setErro('Não foi possível criar a interdição.')
      return
    }

    onSaved(resultado.reservas_canceladas ?? 0)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await enviarInterdicao(false)
  }

  return (
    <Modal title={`Interditar período: ${nome}`} onClose={() => !salvando && onClose()}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Status</span>
          <input value="Em manutenção" className="input" disabled />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Início</span>
            <input
              type="datetime-local"
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value)
                limparConfirmacao()
              }}
              className="input"
              disabled={reservasAfetadas.length > 0}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Fim</span>
            <input
              type="datetime-local"
              value={fim}
              min={inicio}
              onChange={(e) => {
                setFim(e.target.value)
                limparConfirmacao()
              }}
              className="input"
              disabled={reservasAfetadas.length > 0}
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Justificativa</span>
          <textarea
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value)
              limparConfirmacao()
            }}
            className="input"
            rows={3}
            maxLength={500}
            placeholder="Ex: Calibração de sensores"
            disabled={reservasAfetadas.length > 0}
            required
          />
        </label>

        {reservasAfetadas.length === 0 ? (
          <p className="rounded-md border border-(--color-amber)/30 bg-(--color-amber-soft) p-3 text-xs text-(--color-amber)">
            A faixa será destacada no calendário e nenhuma nova reserva poderá ser solicitada durante o período.
          </p>
        ) : (
          <div className="rounded-lg border border-(--color-coral)/40 bg-(--color-coral-soft) p-4">
            <h3 className="font-display font-semibold text-(--color-coral)">
              {reservasAfetadas.length} reserva(s) serão cancelada(s)
            </h3>
            <p className="mt-1 text-sm text-(--color-ink-soft)">
              Revise os usuários afetados. Ao confirmar, a interdição e os cancelamentos serão gravados juntos, e cada usuário receberá a justificativa.
            </p>

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {reservasAfetadas.map((reserva) => (
                <div key={reserva.id} className="rounded-md border border-(--color-coral)/20 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{reserva.usuario_nome}</p>
                    <span className="rounded-full border border-(--color-amber)/30 bg-(--color-amber-soft) px-2 py-0.5 font-mono text-[11px] text-(--color-amber)">
                      {reserva.status === 'aprovada' ? 'aprovada' : 'pendente'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-(--color-ink-soft)">
                    {formatarDataHora(reserva.inicio)} → {formatarDataHora(reserva.fim)}
                  </p>
                  <p className="mt-1 text-xs text-(--color-ink-soft)">
                    {reserva.usuario_matricula && `Matrícula: ${reserva.usuario_matricula} · `}
                    {reserva.usuario_email}
                    {reserva.quantidade !== null && ` · Quantidade: ${reserva.quantidade}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {erro && (
          <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2">
          {reservasAfetadas.length > 0 ? (
            <>
              <button type="button" className="btn-secondary" onClick={limparConfirmacao} disabled={salvando}>
                voltar e editar
              </button>
              <button
                type="button"
                onClick={() => enviarInterdicao(true)}
                disabled={salvando}
                className="inline-flex items-center justify-center rounded-md bg-(--color-coral) px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? 'cancelando reservas…' : 'confirmar cancelamentos e interditar'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>
                cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={salvando || !motivo.trim()}>
                {salvando ? 'verificando reservas…' : 'continuar'}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  )
}

function RecursoForm({
  tipo,
  item,
  onClose,
  onSaved,
}: {
  tipo: TipoRecurso
  item: SalaComRegras | EquipamentoComRegras | null
  onClose: () => void
  onSaved: () => void
}) {
  const isSala = tipo === 'sala'
  const [nome, setNome] = useState(item?.nome ?? '')
  const [quantidadeOuLotacao, setQuantidadeOuLotacao] = useState(
    isSala ? (item as SalaComRegras)?.lotacao ?? 10 : (item as EquipamentoComRegras)?.quantidade ?? 1
  )
  const [qtdManutencao, setQtdManutencao] = useState(
    !isSala ? (item as EquipamentoComRegras)?.quantidade_manutencao ?? 0 : 0
  )
  const [regrasUso, setRegrasUso] = useState(item?.regras_uso ?? '')
  const [status, setStatus] = useState<StatusRecurso>(item?.status ?? 'livre')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      setErro('Informe o nome.')
      return
    }
    setSalvando(true)
    setErro(null)

    if (isSala) {
      const payload = {
        nome,
        lotacao: quantidadeOuLotacao,
        status,
        regras_uso: regrasUso.trim() || null,
      }
      const query = item
        ? supabase.from('salas').update(payload).eq('id_sala', (item as SalaComRegras).id_sala)
        : supabase.from('salas').insert(payload)
      const { error } = await query
      setSalvando(false)
      if (error) return setErro(error.message)
    } else {
      const payload = {
        nome,
        quantidade: quantidadeOuLotacao,
        quantidade_manutencao: qtdManutencao,
        status,
        regras_uso: regrasUso.trim() || null,
      }
      const query = item
        ? supabase.from('equipamentos').update(payload).eq('id', (item as EquipamentoComRegras).id)
        : supabase.from('equipamentos').insert(payload)
      const { error } = await query
      setSalvando(false)
      if (error) return setErro(error.message)
    }
    onSaved()
  }

  return (
    <Modal title={`${item ? 'Editar' : 'Novo'} ${tipo}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="input"
            placeholder={isSala ? 'Ex: Laboratório 3' : 'Ex: Microscópio óptico'}
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{isSala ? 'Capacidade (lotação)' : 'Quantidade disponível'}</span>
          <input
            type="number"
            min={0}
            value={quantidadeOuLotacao}
            onChange={(e) => setQuantidadeOuLotacao(Number(e.target.value))}
            className="input"
            required
          />
        </label>

        {!isSala && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Quantidade em manutenção</span>
            <input
              type="number"
              min={0}
              value={qtdManutencao}
              onChange={(e) => setQtdManutencao(Number(e.target.value))}
              className="input"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Regras de Uso</span>
          <textarea
            value={regrasUso}
            onChange={(e) => setRegrasUso(e.target.value)}
            className="input"
            rows={3}
            placeholder="Digite as instruções e regras para utilização deste recurso..."
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusRecurso)} className="input">
            {status === 'manutencao' && (
              <option value="manutencao">Em manutenção (estado atual)</option>
            )}
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>
                {s === 'livre' ? 'Disponível' : s === 'ocupado' ? 'Ocupado' : 'Em manutenção'}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-(--color-ink-soft)">
            Para manutenção com início, fim e justificativa, use “interditar período” na lista de recursos.
          </span>
        </label>

        {erro && <p className="rounded-md border border-(--color-coral)/30 bg-(--color-coral-soft) px-3 py-2 text-sm text-(--color-coral)">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>
            cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? 'salvando…' : 'salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
