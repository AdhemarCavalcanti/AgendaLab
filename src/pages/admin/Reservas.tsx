import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/StatusBadge'
import type { StatusReserva, TipoRecurso } from '../../lib/types'

interface Item {
  id: number
  tipo: TipoRecurso
  recursoNome: string
  usuarioNome: string
  inicio: string
  fim: string
  status: StatusReserva
  detalhe?: string
}

const FILTROS: { value: 'todas' | StatusReserva; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'confirmada', label: 'Confirmadas' },
  { value: 'rejeitada', label: 'Rejeitadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

export function AdminReservas() {
  const [itens, setItens] = useState<Item[]>([])
  const [filtroStatus, setFiltroStatus] = useState<'todas' | StatusReserva>('todas')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoRecurso>('todos')
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const [{ data: rs }, { data: re }] = await Promise.all([
      supabase
        .from('reservas_salas')
        .select('id, inicio, fim, status, motivo, quantidade_pessoas, salas(nome), usuarios(nome)')
        .order('inicio', { ascending: false }),
      supabase
        .from('reservas_equipamentos')
        .select('id, inicio, fim, status, observacao, equipamentos(nome), usuarios(nome)')
        .order('inicio', { ascending: false }),
    ])

    const itensSalas: Item[] = (rs ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'sala',
      recursoNome: r.salas?.nome ?? 'Sala',
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      detalhe: r.motivo ? `${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : undefined,
    }))
    const itensEquip: Item[] = (re ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'equipamento',
      recursoNome: r.equipamentos?.nome ?? 'Equipamento',
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      detalhe: r.observacao ?? undefined,
    }))

    setItens([...itensSalas, ...itensEquip].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()))
    setLoading(false)
  }

  useEffect(() => {
    carregar()

    const channel = supabase
      .channel('admin-todas-reservas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_salas' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_equipamentos' }, carregar)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrados = itens
    .filter((i) => filtroStatus === 'todas' || i.status === filtroStatus)
    .filter((i) => filtroTipo === 'todos' || i.tipo === filtroTipo)

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
      <h1 className="mb-6 font-display text-3xl font-bold">Todas as reservas</h1>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltroStatus(f.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtroStatus === f.value
                ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
                : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-(--color-border)" />
        {(['todos', 'sala', 'equipamento'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
              filtroTipo === t
                ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
                : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
            }`}
          >
            {t === 'todos' ? 'todos os tipos' : t === 'sala' ? 'salas' : 'equipamentos'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="font-mono text-sm text-(--color-ink-soft)">carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-(--color-border) p-10 text-center text-(--color-ink-soft)">
          Nenhuma reserva encontrada para esse filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--color-border)">
          <table className="w-full text-left text-sm">
            <thead className="bg-(--color-paper) font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">
              <tr>
                <th className="px-4 py-3">Recurso</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Período</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <tr key={`${item.tipo}-${item.id}`} className="border-t border-(--color-border) align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.recursoNome}</p>
                    <p className="font-mono text-xs uppercase text-(--color-ink-soft)">{item.tipo}</p>
                    {item.detalhe && <p className="mt-1 text-xs text-(--color-ink-soft)">{item.detalhe}</p>}
                  </td>
                  <td className="px-4 py-3">{item.usuarioNome}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')}
                    <br />
                    {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
