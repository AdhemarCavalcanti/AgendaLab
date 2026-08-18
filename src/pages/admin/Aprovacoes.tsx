import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'

interface Solicitacao {
  id: number
  tipo: 'sala' | 'equipamento'
  recursoNome: string
  usuarioNome: string
  inicio: string
  fim: string
  detalhe?: string
}

export function AdminAprovacoes() {
  const { meuIdAdm } = useAuth()
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<number | null>(null)
  const [rejeitando, setRejeitando] = useState<Solicitacao | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [novaSolicitacao, setNovaSolicitacao] = useState(false)

  async function carregar() {
    setLoading(true)
    const [{ data: rs }, { data: re }] = await Promise.all([
      supabase
        .from('reservas_salas')
        .select('id, inicio, fim, motivo, quantidade_pessoas, salas(nome), usuarios(nome)')
        .eq('status', 'pendente')
        .order('inicio', { ascending: true }),
      supabase
        .from('reservas_equipamentos')
        .select('id, inicio, fim, observacao, equipamentos(nome), usuarios(nome)')
        .eq('status', 'pendente')
        .order('inicio', { ascending: true }),
    ])

    const itensSalas: Solicitacao[] = (rs ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'sala',
      recursoNome: r.salas?.nome ?? 'Sala',
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      detalhe: r.motivo ? `Motivo: ${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : `${r.quantidade_pessoas ?? '—'} pessoa(s)`,
    }))
    const itensEquip: Solicitacao[] = (re ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'equipamento',
      recursoNome: r.equipamentos?.nome ?? 'Equipamento',
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      detalhe: r.observacao ?? undefined,
    }))

    setItens([...itensSalas, ...itensEquip].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()))
    setLoading(false)
    setNovaSolicitacao(false)
  }

  useEffect(() => {
    carregar()

    // Realtime: avisa visualmente quando novas solicitações pendentes chegam
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
    const { error } = await supabase.from(tabela).update({ status: 'confirmada', id_adm: meuIdAdm }).eq('id', item.id)
    setProcessando(null)
    if (error) alert('Erro: ' + error.message)
    else carregar()
  }

  async function confirmarRejeicao() {
    if (!rejeitando) return
    setProcessando(rejeitando.id)
    const tabela = rejeitando.tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'
    const payload: Record<string, unknown> = { status: 'rejeitada', id_adm: meuIdAdm }
    if (justificativa.trim()) payload.observacao = `Rejeitada: ${justificativa.trim()}`
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
        <h1 className="font-display text-3xl font-bold">Fila de aprovações</h1>
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
      <p className="mb-8 text-(--color-ink-soft)">{itens.length} solicitação(ões) pendente(s) no momento.</p>

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : itens.length === 0 ? (
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
                  rejeitar
                </button>
                <button onClick={() => aprovar(item)} disabled={processando === item.id} className="btn-primary">
                  {processando === item.id ? 'processando…' : 'aprovar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejeitando && (
        <Modal title="Rejeitar solicitação" onClose={() => setRejeitando(null)}>
          <div className="space-y-4">
            <p className="text-sm text-(--color-ink-soft)">
              {rejeitando.recursoNome} · {new Date(rejeitando.inicio).toLocaleString('pt-BR')}
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Justificativa (opcional)</span>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className="input" rows={3} placeholder="Explique o motivo da rejeição…" />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setRejeitando(null)}>
                cancelar
              </button>
              <button className="btn-primary bg-(--color-coral) hover:bg-(--color-coral)" onClick={confirmarRejeicao}>
                confirmar rejeição
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
