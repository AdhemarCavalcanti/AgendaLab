import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'

interface Solicitacao {
  id: number
  tipo: 'sala' | 'equipamento'
  recursoNome: string
  usuarioNome: string
  usuarioEmail?: string
  usuarioMatricula?: string
  inicio: string
  fim: string
  status: string
  detalhe?: string
}

export function AdminAprovacoes() {
  const { meuIdAdm } = useAuth()
  const [aba, setAba] = useState<'pendentes' | 'devolucao'>('pendentes')
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [devolucoes, setDevolucoes] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<number | null>(null)
  const [rejeitando, setRejeitando] = useState<Solicitacao | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [novaSolicitacao, setNovaSolicitacao] = useState(false)

  async function carregar() {
    setLoading(true)

    const [resSalas, resEquip, resDevolucoes, resListaSalas, resListaEquip] = await Promise.all([
      supabase
        .from('reservas_salas')
        .select('id, id_sala, inicio, fim, motivo, quantidade_pessoas, status, usuarios(nome)')
        .eq('status', 'pendente')
        .order('inicio', { ascending: true }),
      supabase
        .from('reservas_equipamentos')
        .select('id, id_equipamento, inicio, fim, observacao, status, usuarios(nome)')
        .eq('status', 'pendente')
        .order('inicio', { ascending: true }),
      supabase
        .from('reservas_equipamentos')
        .select('id, id_equipamento, inicio, fim, observacao, status, usuarios(nome, email, matricula)')
        .eq('status', 'aprovada')
        .order('inicio', { ascending: true }),
      supabase.from('salas').select('id_sala, nome'),
      supabase.from('equipamentos').select('id, nome'),
    ])

    const mapaSalas = new Map<number, string>(
      (resListaSalas.data ?? []).map((s: any) => [s.id_sala, s.nome])
    )
    const mapaEquip = new Map<number, string>(
      (resListaEquip.data ?? []).map((e: any) => [e.id, e.nome])
    )

    const itensSalas: Solicitacao[] = (resSalas.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'sala',
      recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      detalhe: r.motivo ? `Motivo: ${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : `${r.quantidade_pessoas ?? '—'} pessoa(s)`,
    }))

    const itensEquip: Solicitacao[] = (resEquip.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'equipamento',
      recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      detalhe: r.observacao ?? undefined,
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
      detalhe: r.observacao ?? undefined,
    }))

    setItens([...itensSalas, ...itensEquip].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
    setDevolucoes(devolucoesEquip)
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function aprovar(item: Solicitacao) {
    setProcessando(item.id)
    const tabela = item.tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'
    
    const { error } = await supabase
      .from(tabela)
      .update({ status: 'aprovada', id_adm: meuIdAdm })
      .eq('id', item.id)

    setProcessando(null)
    if (error) alert('Erro: ' + error.message)
    else carregar()
  }

  async function marcarDevolvido(item: Solicitacao) {
    setProcessando(item.id)
    const { error } = await supabase
      .from('reservas_equipamentos')
      .update({ status: 'cancelada', id_adm: meuIdAdm })
      .eq('id', item.id)

    setProcessando(null)
    if (error) alert('Erro: ' + error.message)
    else carregar()
  }

  async function confirmarRejeicao() {
    if (!rejeitando) return
    setProcessando(rejeitando.id)
    const tabela = rejeitando.tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'
    
    const payload: Record<string, unknown> = { 
      status: 'cancelada', 
      id_adm: meuIdAdm 
    }
    
    if (justificativa.trim()) {
      if (rejeitando.tipo === 'sala') {
        payload.motivo = justificativa.trim()
      } else {
        payload.observacao = justificativa.trim()
      }
    }
    
    const { error } = await supabase.from(tabela).update(payload).eq('id', rejeitando.id)
    setProcessando(null)
    if (error) {
      alert('Erro: ' + error.message)
      return
    }
    setRejeitando(null)
    setJustificativa('')
    carregar()
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold">Gestão de reservas</h1>
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

      <div className="mb-6 mt-4 flex gap-2">
        <button
          onClick={() => setAba('pendentes')}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
            aba === 'pendentes'
              ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
              : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
          }`}
        >
          Fila de aprovações ({itens.length})
        </button>
        <button
          onClick={() => setAba('devolucao')}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
            aba === 'devolucao'
              ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
              : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
          }`}
        >
          Pedidos para devolução ({devolucoes.length})
        </button>
      </div>

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : aba === 'pendentes' ? (
        itens.length === 0 ? (
          <p className="rounded-lg border border-dashed border-(--color-border) p-10 text-center text-(--color-ink-soft)">
            Nenhuma solicitação pendente. Tudo em dia! ✓
          </p>
        ) : (
          <div className="space-y-3">
            {itens.map((item) => (
              <div key={`${item.tipo}-${item.id}`} className="card flex flex-wrap items-center justify-between gap-4 p-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-(--color-ink-soft)">{item.tipo}</span>
                    <span className="rounded-full border border-(--color-amber)/30 bg-(--color-amber-soft) px-2 py-0.5 text-[11px] font-medium text-(--color-amber)">pendente</span>
                  </div>
                  <p className="font-medium">{item.recursoNome} — solicitado por {item.usuarioNome}</p>
                  <p className="font-mono text-sm text-(--color-ink-soft)">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')} · {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {item.detalhe && <p className="mt-1 text-sm text-(--color-ink-soft)">{item.detalhe}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejeitando(item)}
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
      ) : devolucoes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-(--color-border) p-10 text-center text-(--color-ink-soft)">
          Nenhum equipamento em uso aguardando devolução.
        </p>
      ) : (
        <div className="space-y-3">
          {devolucoes.map((item) => (
            <div key={`devolucao-${item.id}`} className="card flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-(--color-ink-soft)">equipamento</span>
                  <span className="rounded-full border border-(--color-cyan)/30 bg-(--color-cyan-soft) px-2 py-0.5 text-[11px] font-medium text-(--color-cyan)">em uso / aprovado</span>
                </div>
                <p className="font-medium">{item.recursoNome} — retirado por {item.usuarioNome}</p>
                
                {/* Informações adicionais do usuário */}
                <p className="text-xs text-(--color-ink-soft)">
                  {item.usuarioMatricula && <span>Matrícula: {item.usuarioMatricula}</span>}
                  {item.usuarioMatricula && item.usuarioEmail && <span> · </span>}
                  {item.usuarioEmail && <span>E-mail: {item.usuarioEmail}</span>}
                </p>

                <p className="mt-1 font-mono text-sm text-(--color-ink-soft)">
                  {new Date(item.inicio).toLocaleDateString('pt-BR')} · {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
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
      )}

      {rejeitando && (
        <Modal title="Cancelar reserva" onClose={() => setRejeitando(null)}>
          <div className="space-y-4">
            <p className="text-sm text-(--color-ink-soft)">
              {rejeitando.recursoNome} · {new Date(rejeitando.inicio).toLocaleString('pt-BR')}
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Justificativa (opcional)</span>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input" rows={3} placeholder="Explique o motivo do cancelamento…" />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setRejeitando(null)}>
                voltar
              </button>
              <button className="btn-primary bg-(--color-coral) hover:bg-(--color-coral)" onClick={confirmarRejeicao}>
                confirmar cancelamento
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}