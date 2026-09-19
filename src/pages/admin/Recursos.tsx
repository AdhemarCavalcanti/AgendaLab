import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { BloqueioManutencao, Equipamento, Sala, StatusRecurso, TipoRecurso } from '../../lib/types'
import { StatusBadge } from '../../components/StatusBadge'
import { Modal } from '../../components/Modal'

type SalaComRegras = Sala & { regras_uso?: string }
type EquipamentoComRegras = Equipamento & { regras_uso?: string; quantidade_manutencao?: number }
type RecursoComRegras = SalaComRegras | EquipamentoComRegras
type AlvoIndisponibilidade = { tipo: TipoRecurso; item: RecursoComRegras }
type TurnoIndisponibilidade = 'manha' | 'tarde' | 'noite'
type FormaIndisponibilidade = 'intervalo' | 'turnos'

interface ReservaAfetada {
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
const TURNOS_INDISPONIBILIDADE: Array<{
  id: TurnoIndisponibilidade
  nome: string
  horario: string
}> = [
  { id: 'manha', nome: 'Manhã', horario: '07:00–12:00' },
  { id: 'tarde', nome: 'Tarde', horario: '12:00–18:00' },
  { id: 'noite', nome: 'Noite', horario: '18:00–22:00' },
]

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

function dataLocalHoje() {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
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
  const [alvoIndisponibilidade, setAlvoIndisponibilidade] = useState<AlvoIndisponibilidade | null>(null)
  const [sucessoIndisponibilidade, setSucessoIndisponibilidade] = useState<string | null>(null)
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
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">painel administrativo</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Gestão de recursos</h1>
        </div>
        
        <div className="flex flex-col items-end sm:items-start gap-1">
          <button
            className="btn-primary"
            onClick={() => {
              setEditando(null)
              setModalAberto(true)
            }}
          >
            + novo {aba}
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        {(['sala', 'equipamento'] as TipoRecurso[]).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`chip capitalize ${aba === t ? 'chip-on' : ''}`}
          >
            {t === 'sala' ? 'salas' : 'equipamentos'}
          </button>
        ))}
      </div>

      {erro && <p className="alert-error mb-4">{erro}</p>}
      {sucessoIndisponibilidade && (
        <p className="alert-ok mb-4">
          {sucessoIndisponibilidade}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-(--color-ink-soft)">carregando…</p>
      ) : lista.length === 0 ? (
        <p className="empty">Nenhum recurso cadastrado ainda.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>{aba === 'sala' ? 'Capacidade' : 'Disponível / Manutenção'}</th>
                <th>Regras de Uso</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
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
                      <div className="flex flex-wrap justify-end gap-2">
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
                            setSucessoIndisponibilidade(null)
                            setAlvoIndisponibilidade({ tipo: aba, item })
                          }}
                          className="rounded-md border border-(--color-amber)/40 bg-(--color-amber-soft) px-2.5 py-1 text-xs font-medium text-(--color-amber) hover:bg-(--color-amber-soft)/70"
                        >
                          indisponibilizar
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
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-amber)">agenda de manutenção</p>
            <h2 className="font-display text-xl font-semibold tracking-tight">Interdições atuais e futuras</h2>
          </div>
          <span className="text-xs text-(--color-ink-soft)">{bloqueiosDaAba.length} registro(s)</span>
        </div>

        {bloqueiosDaAba.length === 0 ? (
          <p className="empty text-sm">
            Nenhuma interdição programada para {aba === 'sala' ? 'salas' : 'equipamentos'}.
          </p>
        ) : (
          <div className="space-y-2">
            {bloqueiosDaAba.map((bloqueio) => (
              <div
                key={bloqueio.id}
                className="flex flex-col gap-3 rounded-2xl border border-(--color-amber)/40 bg-(--color-amber-soft) p-4 sm:flex-row sm:items-center sm:justify-between"
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

      {alvoIndisponibilidade && (
        <IndisponibilidadeForm
          alvo={alvoIndisponibilidade}
          onClose={() => setAlvoIndisponibilidade(null)}
          onSaved={(reservasCanceladas) => {
            setAlvoIndisponibilidade(null)
            setSucessoIndisponibilidade(
              reservasCanceladas > 0
                ? `Indisponibilidade criada e ${reservasCanceladas} reserva(s) cancelada(s). Os usuários foram notificados.`
                : 'Indisponibilidade criada com sucesso.'
            )
            carregar()
          }}
        />
      )}
    </div>
  )
}

function IndisponibilidadeForm({
  alvo,
  onClose,
  onSaved,
}: {
  alvo: AlvoIndisponibilidade
  onClose: () => void
  onSaved: (reservasCanceladas: number) => void
}) {
  const [forma, setForma] = useState<FormaIndisponibilidade>('intervalo')
  const [periodo] = useState(periodoInicial)
  const [inicio, setInicio] = useState(periodo.inicio)
  const [fim, setFim] = useState(periodo.fim)
  const [data, setData] = useState(dataLocalHoje)
  const [turnos, setTurnos] = useState<TurnoIndisponibilidade[]>([])
  const [justificativa, setJustificativa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [reservasAfetadas, setReservasAfetadas] = useState<ReservaAfetada[]>([])

  const nome = alvo.item.nome
  const idRecurso = alvo.tipo === 'sala'
    ? (alvo.item as SalaComRegras).id_sala
    : (alvo.item as EquipamentoComRegras).id

  function limparConfirmacao() {
    setReservasAfetadas([])
    setErro(null)
  }

  function alterarForma(novaForma: FormaIndisponibilidade) {
    setForma(novaForma)
    limparConfirmacao()
  }

  function alternarTurno(turno: TurnoIndisponibilidade) {
    setTurnos((atuais) =>
      atuais.includes(turno)
        ? atuais.filter((item) => item !== turno)
        : [...atuais, turno]
    )
    limparConfirmacao()
  }

  async function enviarIndisponibilidade(confirmarCancelamento: boolean) {
    const justificativaLimpa = justificativa.trim()

    if (!justificativaLimpa) {
      setErro('Informe uma justificativa pública para a indisponibilidade.')
      return
    }

    const inicioData = new Date(inicio)
    const fimData = new Date(fim)

    if (forma === 'intervalo') {
      if (Number.isNaN(inicioData.getTime()) || Number.isNaN(fimData.getTime()) || fimData <= inicioData) {
        setErro('O fim da indisponibilidade deve ser posterior ao início.')
        return
      }
    } else {
      if (!data) {
        setErro('Informe a data da indisponibilidade.')
        return
      }
      if (turnos.length === 0) {
        setErro('Selecione ao menos um turno afetado.')
        return
      }
    }

    setSalvando(true)
    setErro(null)

    const idsReservasConfirmadas = confirmarCancelamento
      ? reservasAfetadas.map((reserva) => reserva.id)
      : null
    const { data: resultadoRpc, error } = forma === 'intervalo'
      ? await supabase.rpc('interditar_recurso_manutencao', {
          p_tipo: alvo.tipo,
          p_id_recurso: idRecurso,
          p_inicio: inicioData.toISOString(),
          p_fim: fimData.toISOString(),
          p_motivo: justificativaLimpa,
          p_confirmar_cancelamento: confirmarCancelamento,
          p_ids_reservas_confirmadas: idsReservasConfirmadas,
        })
      : await supabase.rpc('interditar_recurso_emergencial', {
          p_tipo: alvo.tipo,
          p_id_recurso: idRecurso,
          p_data: data,
          p_turnos: turnos,
          p_justificativa: justificativaLimpa,
          p_confirmar_cancelamento: confirmarCancelamento,
          p_ids_reservas_confirmadas: idsReservasConfirmadas,
        })
    setSalvando(false)

    if (error) {
      const rpcAusente = error.code === '42883' || error.message.toLowerCase().includes('function')
      setErro(
        rpcAusente
          ? 'A funcionalidade de indisponibilidade ainda não foi aplicada no Supabase.'
          : error.message
      )
      return
    }

    const resultado = resultadoRpc as {
      sucesso?: boolean
      requer_confirmacao?: boolean
      lista_alterada?: boolean
      reservas_afetadas?: ReservaAfetada[]
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
      setErro('Não foi possível criar a indisponibilidade.')
      return
    }

    onSaved(resultado.reservas_canceladas ?? 0)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await enviarIndisponibilidade(false)
  }

  return (
    <Modal title={`Indisponibilizar recurso: ${nome}`} onClose={() => !salvando && onClose()}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={reservasAfetadas.length > 0}>
          <legend className="mb-2 text-sm font-medium">Como deseja definir o período?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-md border p-3 transition-colors ${
              forma === 'intervalo'
                ? 'border-(--color-amber) bg-(--color-amber-soft) text-(--color-amber)'
                : 'border-(--color-border) bg-white hover:bg-black/[0.02]'
            }`}>
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="forma-indisponibilidade"
                  checked={forma === 'intervalo'}
                  onChange={() => alterarForma('intervalo')}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Intervalo personalizado</span>
                  <span className="text-xs opacity-75">Escolha o início e o fim exatos</span>
                </span>
              </span>
            </label>
            <label className={`cursor-pointer rounded-md border p-3 transition-colors ${
              forma === 'turnos'
                ? 'border-(--color-amber) bg-(--color-amber-soft) text-(--color-amber)'
                : 'border-(--color-border) bg-white hover:bg-black/[0.02]'
            }`}>
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="forma-indisponibilidade"
                  checked={forma === 'turnos'}
                  onChange={() => alterarForma('turnos')}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Data e turnos</span>
                  <span className="text-xs opacity-75">Selecione manhã, tarde e/ou noite</span>
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {forma === 'intervalo' ? (
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
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Data</span>
              <input
                type="date"
                value={data}
                min={dataLocalHoje()}
                onChange={(e) => {
                  setData(e.target.value)
                  limparConfirmacao()
                }}
                className="input"
                disabled={reservasAfetadas.length > 0}
                required
              />
            </label>

            <fieldset disabled={reservasAfetadas.length > 0}>
              <legend className="mb-2 text-sm font-medium">Turnos afetados</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {TURNOS_INDISPONIBILIDADE.map((turno) => {
                  const selecionado = turnos.includes(turno.id)
                  return (
                    <label
                      key={turno.id}
                      className={`cursor-pointer rounded-md border p-3 transition-colors ${
                        selecionado
                          ? 'border-(--color-amber) bg-(--color-amber-soft) text-(--color-amber)'
                          : 'border-(--color-border) bg-white hover:bg-black/[0.02]'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={() => alternarTurno(turno.id)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-sm font-medium">{turno.nome}</span>
                          <span className="font-mono text-xs opacity-75">{turno.horario}</span>
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Justificativa pública</span>
          <textarea
            value={justificativa}
            onChange={(e) => {
              setJustificativa(e.target.value)
              limparConfirmacao()
            }}
            className="input"
            rows={3}
            maxLength={500}
            placeholder="Ex: Falta de energia, dedetização ou calibração"
            disabled={reservasAfetadas.length > 0}
            required
          />
          <span className="mt-1 block text-xs text-(--color-ink-soft)">
            Esta mensagem aparecerá no calendário e nos avisos enviados aos usuários.
          </span>
        </label>

        {reservasAfetadas.length === 0 ? (
          <p className="rounded-md border border-(--color-amber)/30 bg-(--color-amber-soft) p-3 text-xs text-(--color-amber)">
            O período ficará bloqueado para novas reservas. Se houver reservas ativas, você poderá revisá-las antes de confirmar o cancelamento e os avisos.
          </p>
        ) : (
          <div className="rounded-lg border border-(--color-coral)/40 bg-(--color-coral-soft) p-4">
            <h3 className="font-display font-semibold text-(--color-coral)">
              {reservasAfetadas.length} reserva(s) serão cancelada(s)
            </h3>
            <p className="mt-1 text-sm text-(--color-ink-soft)">
              Revise os usuários afetados. Ao confirmar, a indisponibilidade e os cancelamentos serão gravados juntos, e todos receberão a justificativa pública.
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
                onClick={() => enviarIndisponibilidade(true)}
                disabled={salvando}
                className="inline-flex items-center justify-center rounded-md bg-(--color-coral) px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? 'cancelando reservas…' : 'confirmar indisponibilidade e avisar'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={salvando}>
                cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={salvando || !justificativa.trim() || (forma === 'turnos' && turnos.length === 0)}
              >
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
            Use “indisponibilizar” para bloquear a agenda por um intervalo exato ou por data e turnos.
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
