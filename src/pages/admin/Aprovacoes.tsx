import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'
import type { RelatoAvaria, StatusAvaria } from '../../lib/types'

interface Solicitacao {
  id: number
  tipo: 'sala' | 'equipamento'
  recursoNome: string
  usuarioNome: string
  usuarioEmail?: string
  usuarioMatricula?: string
  inicio: string
  fim: string
  status: 'aprovada' | 'pendente' | 'cancelada'
  status_devolucao?: 'pendente' | 'devolvido'
  quantidade?: number
  detalhe?: string
  acessorios?: Array<{
    nome: string
    quantidade: number
  }>
  salaVinculada?: string
}

export function AdminAprovacoes() {
  const { meuIdAdm } = useAuth()
  const [aba, setAba] = useState<'pendentes' | 'devolucao' | 'avarias'>('pendentes')
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [devolucoes, setDevolucoes] = useState<Solicitacao[]>([])
  const [avarias, setAvarias] = useState<RelatoAvaria[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<number | null>(null)
  const [processandoAvaria, setProcessandoAvaria] = useState<number | null>(null)
  const [rejeitando, setRejeitando] = useState<Solicitacao | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [erroJustificativa, setErroJustificativa] = useState<string | null>(null)
  const [novaSolicitacao, setNovaSolicitacao] = useState(false)

  async function carregar() {
    setLoading(true)

    const [resSalas, resEquip, resDevolucoes, resAvarias, resListaSalas, resListaEquip] = await Promise.all([
      // 1. Salas pendentes de aprovação
      supabase
        .from('reservas_salas')
        .select('id, id_sala, inicio, fim, motivo, quantidade_pessoas, status, usuarios(nome, email, matricula)')
        .eq('status', 'pendente')
        .order('inicio', { ascending: true }),

      // 2. Equipamentos pendentes de aprovação
      supabase
        .from('reservas_equipamentos')
        .select('id, id_equipamento, id_reserva_sala, inicio, fim, motivo, observacao, quantidade, status, usuarios(nome, email, matricula)')
        .eq('status', 'pendente')
        .order('inicio', { ascending: true }),

      // 3. Equipamentos APROVADOS que ainda estão PENDENTES DE DEVOLUÇÃO
      supabase
        .from('reservas_equipamentos')
        .select('id, id_equipamento, id_reserva_sala, inicio, fim, observacao, quantidade, status, status_devolucao, usuarios(nome, email, matricula), reservas_salas(id_sala)')
        .eq('status', 'aprovada')
        .eq('status_devolucao', 'pendente')
        .order('inicio', { ascending: true }),

      // 4. Avarias e defeitos reportados
      supabase
        .from('relatos_avarias')
        .select('id, id_usuario, tipo_recurso, id_recurso, recurso_nome, id_reserva_sala, id_reserva_equipamento, severidade, descricao, status, criado_em, usuarios(nome, email, matricula)')
        .order('criado_em', { ascending: false }),

      supabase.from('salas').select('id_sala, nome'),
      supabase.from('equipamentos').select('id, nome'),
    ])

    const mapaSalas = new Map<number, string>(
      (resListaSalas.data ?? []).map((s: any) => [s.id_sala, s.nome])
    )
    const mapaEquip = new Map<number, string>(
      (resListaEquip.data ?? []).map((e: any) => [e.id, e.nome])
    )

    const acessoriosPorReservaSala = new Map<number, NonNullable<Solicitacao['acessorios']>>()
    for (const reserva of (resEquip.data ?? []) as any[]) {
      if (reserva.id_reserva_sala === null || reserva.id_reserva_sala === undefined) continue
      const idReservaSala = Number(reserva.id_reserva_sala)
      const atuais = acessoriosPorReservaSala.get(idReservaSala) ?? []
      atuais.push({
        nome: mapaEquip.get(reserva.id_equipamento) ?? `Equipamento #${reserva.id_equipamento}`,
        quantidade: Number(reserva.quantidade ?? 1),
      })
      acessoriosPorReservaSala.set(idReservaSala, atuais)
    }

    const itensSalas: Solicitacao[] = (resSalas.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'sala',
      recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      usuarioEmail: r.usuarios?.email ?? undefined,
      usuarioMatricula: r.usuarios?.matricula ?? undefined,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      detalhe: r.motivo ? `Motivo: ${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : `${r.quantidade_pessoas ?? '—'} pessoa(s)`,
      acessorios: acessoriosPorReservaSala.get(r.id) ?? [],
    }))

    const itensEquip: Solicitacao[] = (resEquip.data ?? [])
      .filter((r: any) => r.id_reserva_sala === null || r.id_reserva_sala === undefined)
      .map((r: any) => ({
        id: r.id,
        tipo: 'equipamento',
        recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
        usuarioNome: r.usuarios?.nome ?? 'Usuário',
        usuarioEmail: r.usuarios?.email ?? undefined,
        usuarioMatricula: r.usuarios?.matricula ?? undefined,
        inicio: r.inicio,
        fim: r.fim,
        status: r.status,
        quantidade: r.quantidade ?? 1,
        detalhe: r.motivo ? `Motivo: ${r.motivo} · Quantidade: ${r.quantidade ?? 1}` : `Quantidade: ${r.quantidade ?? 1}${r.observacao ? ` · Obs: ${r.observacao}` : ''}`,
      }))

    const devolucoesEquip: Solicitacao[] = (resDevolucoes.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'equipamento',
      recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      usuarioEmail: r.usuarios?.email ?? undefined,
      usuarioMatricula: r.usuarios?.matricula ?? undefined,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      status_devolucao: r.status_devolucao,
      quantidade: r.quantidade ?? 1,
      detalhe: `Quantidade retirada: ${r.quantidade ?? 1}${r.observacao ? ` · Obs: ${r.observacao}` : ''}`,
      salaVinculada: r.id_reserva_sala
        ? mapaSalas.get(Number(r.reservas_salas?.id_sala)) ?? `Reserva de sala #${r.id_reserva_sala}`
        : undefined,
    }))

    const avariasFormatadas: RelatoAvaria[] = (resAvarias.data ?? []).map((a: any) => ({
      id: a.id,
      id_usuario: a.id_usuario,
      tipo_recurso: a.tipo_recurso,
      id_recurso: a.id_recurso,
      recurso_nome: a.recurso_nome,
      id_reserva_sala: a.id_reserva_sala,
      id_reserva_equipamento: a.id_reserva_equipamento,
      severidade: a.severidade,
      descricao: a.descricao,
      status: a.status,
      criado_em: a.criado_em,
      usuarios: a.usuarios
        ? {
            nome: a.usuarios.nome,
            email: a.usuarios.email,
            matricula: a.usuarios.matricula,
          }
        : undefined,
    }))

    setItens([...itensSalas, ...itensEquip].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
    setDevolucoes(devolucoesEquip)
    setAvarias(avariasFormatadas)
    setLoading(false)
    setNovaSolicitacao(false)
  }

  useEffect(() => {
    carregar()

    const channel = supabase
      .channel('aprovacoes-pendentes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservas_salas' }, () => setNovaSolicitacao(true))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservas_equipamentos' }, () => setNovaSolicitacao(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservas_salas' }, () => setNovaSolicitacao(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservas_equipamentos' }, () => setNovaSolicitacao(true))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'relatos_avarias' }, () => setNovaSolicitacao(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'relatos_avarias' }, () => setNovaSolicitacao(true))
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function alterarStatusAvaria(id: number, novoStatus: StatusAvaria) {
    setProcessandoAvaria(id)
    const { error } = await supabase
      .from('relatos_avarias')
      .update({ status: novoStatus })
      .eq('id', id)

    setProcessandoAvaria(null)
    if (error) {
      alert('Erro ao atualizar status da avaria: ' + error.message)
    } else {
      carregar()
    }
  }

  async function aprovar(item: Solicitacao) {
    setProcessando(item.id)
    const tabela = item.tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'

    const payloadUpdate = item.tipo === 'equipamento'
      ? { status: 'aprovada', status_devolucao: 'pendente', id_adm: meuIdAdm }
      : { status: 'aprovada', id_adm: meuIdAdm }

    const { error } = await supabase
      .from(tabela)
      .update(payloadUpdate)
      .eq('id', Number(item.id))

    setProcessando(null)
    if (error) alert('Erro: ' + error.message)
    else carregar()
  }

  async function marcarDevolvido(item: Solicitacao) {
    setProcessando(item.id)

    try {
      const { data, error } = await supabase
        .from('reservas_equipamentos')
        .update({
          status_devolucao: 'devolvido',
          id_adm: meuIdAdm
        })
        .eq('id', Number(item.id))
        .select()

      if (error) {
        console.error('Erro na atualização:', error)
        alert('Erro ao registrar devolução: ' + error.message)
        return
      }

      if (!data || data.length === 0) {
        alert('Nenhum registro foi atualizado. Verifique se o ID existe.')
        return
      }

      await carregar()
    } catch (err: any) {
      console.error('Erro inesperado:', err)
      alert('Erro inesperado: ' + err.message)
    } finally {
      setProcessando(null)
    }
  }

  async function confirmarRejeicao() {
    if (!rejeitando) return

    const justificativaNormalizada = justificativa.trim()
    if (!justificativaNormalizada) {
      setErroJustificativa('Informe a justificativa da recusa.')
      return
    }

    setErroJustificativa(null)
    setProcessando(rejeitando.id)
    const tabela = rejeitando.tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'

    const payload: Record<string, unknown> = {
      status: 'cancelada',
      id_adm: meuIdAdm
    }

    // Se for cancelamento de equipamento, define status_devolucao como 'devolvido'
    if (rejeitando.tipo === 'equipamento') {
      payload.status_devolucao = 'devolvido'
    }

    payload.motivo = justificativaNormalizada

    // Executa o update e retorna os dados atualizados para conferência
    const { data, error } = await supabase
      .from(tabela)
      .update(payload)
      .eq('id', Number(rejeitando.id))
      .select()

    setProcessando(null)

    if (error) {
      console.error('Erro ao cancelar reserva:', error)
      alert('Erro: ' + error.message)
      return
    }

    if (!data || data.length === 0) {
      alert('Nenhum registro foi atualizado. Verifique se a política RLS de UPDATE permite alterar este registro.')
      return
    }

    setRejeitando(null)
    setJustificativa('')
    setErroJustificativa(null)
    carregar()
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <p className="kicker">painel administrativo</p>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Gestão de reservas</h1>
        {novaSolicitacao && (
          <button
            onClick={carregar}
            className="flex animate-pulse items-center gap-1.5 rounded-full border border-(--color-amber)/40 bg-(--color-amber-soft) px-3 py-1 text-xs font-medium text-(--color-amber)"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-amber)" />
            atualização em tempo real · clique para atualizar
          </button>
        )}
      </div>

      <div className="mb-6 mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setAba('pendentes')}
          className={`chip ${aba === 'pendentes' ? 'chip-on' : ''}`}
        >
          Fila de aprovações ({itens.length})
        </button>
        <button
          onClick={() => setAba('devolucao')}
          className={`chip ${aba === 'devolucao' ? 'chip-on' : ''}`}
        >
          Pedidos para devolução ({devolucoes.length})
        </button>
        <button
          onClick={() => setAba('avarias')}
          className={`chip ${aba === 'avarias' ? 'chip-on' : ''}`}
        >
          Avarias reportadas ({avarias.filter((a) => a.status !== 'resolvido').length})
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-(--color-ink-soft)">carregando…</p>
      ) : aba === 'pendentes' ? (
        itens.length === 0 ? (
          <p className="empty">
            Nenhuma solicitação pendente. Tudo em dia! ✓
          </p>
        ) : (
          <div className="space-y-3">
            {itens.map((item) => (
              <div key={`${item.tipo}-${item.id}`} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">{item.tipo}</span>
                    <span className="rounded-full border border-(--color-amber)/30 bg-(--color-amber-soft) px-2 py-0.5 text-[11px] font-medium text-(--color-amber)">pendente</span>
                  </div>
                  <p className="font-medium">{item.recursoNome} — solicitado por {item.usuarioNome}</p>

                  <p className="text-xs text-(--color-ink-soft)">
                    {item.usuarioMatricula && <span>Matrícula: {item.usuarioMatricula}</span>}
                    {item.usuarioMatricula && item.usuarioEmail && <span> · </span>}
                    {item.usuarioEmail && <span>E-mail: {item.usuarioEmail}</span>}
                  </p>

                  <p className="mt-1 text-sm text-(--color-ink-soft)">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')} · {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {item.detalhe && <p className="mt-1 text-sm text-(--color-ink-soft)">{item.detalhe}</p>}
                  {item.acessorios && item.acessorios.length > 0 && (
                    <p className="mt-1 text-sm text-(--color-ink-soft)">
                      <span className="font-medium text-(--color-ink)">Acessórios: </span>
                      {item.acessorios.map((acessorio) => `${acessorio.nome} × ${acessorio.quantidade}`).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setJustificativa('')
                      setErroJustificativa(null)
                      setRejeitando(item)
                    }}
                    disabled={processando === item.id}
                    className="btn-secondary hover:border-(--color-coral) hover:text-(--color-coral)"
                  >
                    cancelar
                  </button>
                  <button onClick={() => aprovar(item)} disabled={processando === item.id} className="btn-primary">
                    {processando === item.id ? 'processando…' : 'aprovar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : aba === 'devolucao' ? (
        devolucoes.length === 0 ? (
          <p className="empty">
            Nenhum equipamento em uso aguardando devolução.
          </p>
        ) : (
          <div className="space-y-3">
            {devolucoes.map((item) => (
              <div key={`devolucao-${item.id}`} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">equipamento</span>
                    <span className="rounded-full border border-(--color-cyan)/30 bg-(--color-cyan-soft) px-2 py-0.5 text-[11px] font-medium text-(--color-cyan)">em uso / aguardando devolução</span>
                  </div>
                  <p className="font-medium">{item.recursoNome} — retirado por {item.usuarioNome}</p>

                  <p className="text-xs text-(--color-ink-soft)">
                    {item.usuarioMatricula && <span>Matrícula: {item.usuarioMatricula}</span>}
                    {item.usuarioMatricula && item.usuarioEmail && <span> · </span>}
                    {item.usuarioEmail && <span>E-mail: {item.usuarioEmail}</span>}
                  </p>

                  <p className="mt-1 text-sm text-(--color-ink-soft)">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')} · {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {item.salaVinculada && (
                    <p className="mt-1 text-sm text-(--color-ink-soft)">
                      <span className="font-medium text-(--color-ink)">Acessório de: </span>{item.salaVinculada}
                    </p>
                  )}
                  {item.detalhe && <p className="mt-1 text-sm text-(--color-ink-soft)">{item.detalhe}</p>}
                </div>
                <button
                  onClick={() => marcarDevolvido(item)}
                  disabled={processando === item.id}
                  className="btn-primary bg-(--color-cyan) hover:bg-(--color-cyan)"
                >
                  {processando === item.id ? 'salvando…' : 'devolvido'}
                </button>
              </div>
            ))}
          </div>
        )
      ) : avarias.length === 0 ? (
        <p className="empty">
          Nenhum relato de defeito ou avaria registrado. Tudo em ordem! ✓
        </p>
      ) : (
        <div className="space-y-3">
          {avarias.map((avaria) => {
            const severidadeBadge = {
              leve: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              media: 'border-(--color-amber)/30 bg-(--color-amber-soft) text-(--color-amber)',
              critica: 'border-(--color-coral)/30 bg-rose-500/10 text-(--color-coral)',
            }[avaria.severidade]

            const statusBadge = {
              pendente: 'border-(--color-amber)/30 bg-(--color-amber-soft) text-(--color-amber)',
              em_analise: 'border-(--color-cyan)/30 bg-(--color-cyan-soft) text-(--color-cyan)',
              resolvido: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            }[avaria.status]

            return (
              <div key={`avaria-${avaria.id}`} className="card flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="max-w-2xl space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">
                      {avaria.tipo_recurso}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${severidadeBadge}`}>
                      Severidade: {avaria.severidade}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusBadge}`}>
                      {avaria.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="font-semibold text-base">
                    {avaria.recurso_nome}
                  </p>

                  <p className="text-xs text-(--color-ink-soft)">
                    Reportado por: <span className="font-medium text-(--color-ink)">{avaria.usuarios?.nome ?? 'Usuário'}</span>
                    {avaria.usuarios?.matricula && <span> · Matrícula: {avaria.usuarios.matricula}</span>}
                    {avaria.usuarios?.email && <span> · {avaria.usuarios.email}</span>}
                    <span> · {new Date(avaria.criado_em).toLocaleString('pt-BR')}</span>
                  </p>

                  <div className="rounded-md border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-3 text-sm">
                    <p className="font-medium text-xs text-(--color-ink-soft) mb-1 uppercase tracking-wider">Descrição da ocorrência:</p>
                    <p className="whitespace-pre-wrap">{avaria.descricao}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {avaria.status === 'pendente' && (
                    <button
                      onClick={() => alterarStatusAvaria(avaria.id, 'em_analise')}
                      disabled={processandoAvaria === avaria.id}
                      className="btn-secondary text-xs"
                    >
                      {processandoAvaria === avaria.id ? 'salvando…' : 'Marcar em análise'}
                    </button>
                  )}
                  {avaria.status !== 'resolvido' && (
                    <button
                      onClick={() => alterarStatusAvaria(avaria.id, 'resolvido')}
                      disabled={processandoAvaria === avaria.id}
                      className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-xs"
                    >
                      {processandoAvaria === avaria.id ? 'salvando…' : 'Marcar resolvido'}
                    </button>
                  )}
                  {avaria.status === 'resolvido' && (
                    <button
                      onClick={() => alterarStatusAvaria(avaria.id, 'pendente')}
                      disabled={processandoAvaria === avaria.id}
                      className="btn-secondary text-xs"
                    >
                      Reabrir ocorrência
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {rejeitando && (
        <Modal
          title="Cancelar reserva"
          onClose={() => {
            setRejeitando(null)
            setJustificativa('')
            setErroJustificativa(null)
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-(--color-ink-soft)">
              {rejeitando.recursoNome} · {new Date(rejeitando.inicio).toLocaleString('pt-BR')}
            </p>
            <label className="block" htmlFor="justificativa-rejeicao">
              <span className="mb-1 block text-sm font-medium">Justificativa (obrigatória)</span>
              <textarea
                id="justificativa-rejeicao"
                value={justificativa}
                onChange={(e) => {
                  setJustificativa(e.target.value)
                  if (erroJustificativa) setErroJustificativa(null)
                }}
                className="input"
                rows={3}
                placeholder="Explique o motivo do cancelamento…"
                required
                aria-invalid={Boolean(erroJustificativa)}
                aria-describedby={erroJustificativa ? 'erro-justificativa-rejeicao' : undefined}
              />
              {erroJustificativa && (
                <p id="erro-justificativa-rejeicao" role="alert" className="mt-1 text-sm text-(--color-coral)">
                  {erroJustificativa}
                </p>
              )}
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setRejeitando(null)
                  setJustificativa('')
                  setErroJustificativa(null)
                }}
              >
                voltar
              </button>
              <button
                className="btn-primary bg-(--color-coral) hover:bg-(--color-coral)"
                onClick={confirmarRejeicao}
                disabled={processando === rejeitando.id}
              >
                confirmar cancelamento
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
