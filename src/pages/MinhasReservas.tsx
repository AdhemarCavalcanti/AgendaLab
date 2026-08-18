import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import type { StatusReserva } from '../lib/types'

interface Item {
  id: number
  tipo: 'sala' | 'equipamento'
  recursoNome: string
  inicio: string
  fim: string
  status: StatusReserva
  extra?: string
}

const FILTROS: { value: 'todas' | StatusReserva; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovada', label: 'Aprovadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

export function MinhasReservas() {
  const { meuIdUsuario } = useAuth()
  const [itens, setItens] = useState<Item[]>([])
  const [filtro, setFiltro] = useState<'todas' | StatusReserva>('todas')
  const [loading, setLoading] = useState(true)
  const [cancelando, setCancelando] = useState<number | null>(null)

  async function carregar() {
    setLoading(true)

    let targetUserId = meuIdUsuario

    // Se meuIdUsuario não estiver no context, busca diretamente no banco via Auth
    if (!targetUserId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: uBD } = await supabase
          .from('usuarios')
          .select('id_usuario')
          .or(`uuid.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle()

        if (uBD) targetUserId = uBD.id_usuario
      }
    }

    // Se mesmo assim não encontrar o ID do usuário, encerra o carregamento
    if (!targetUserId) {
      setItens([])
      setLoading(false)
      return
    }

    // Busca as reservas do usuário e os nomes dos recursos em paralelo
    const [resSalas, resEquip, resListaSalas, resListaEquip] = await Promise.all([
      supabase
        .from('reservas_salas')
        .select('id, id_sala, inicio, fim, status, motivo, quantidade_pessoas')
        .eq('id_usuario', targetUserId)
        .order('inicio', { ascending: false }),
      supabase
        .from('reservas_equipamentos')
        .select('id, id_equipamento, inicio, fim, status, observacao')
        .eq('id_usuario', targetUserId)
        .order('inicio', { ascending: false }),
      supabase.from('salas').select('id_sala, nome'),
      supabase.from('equipamentos').select('id_equipamento, nome'),
    ])

    const mapaSalas = new Map<number, string>(
      (resListaSalas.data ?? []).map((s: any) => [s.id_sala, s.nome])
    )
    const mapaEquip = new Map<number, string>(
      (resListaEquip.data ?? []).map((e: any) => [e.id_equipamento, e.nome])
    )

    const itensSalas: Item[] = (resSalas.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'sala',
      recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      extra: r.motivo ? `${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : undefined,
    }))

    const itensEquip: Item[] = (resEquip.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'equipamento',
      recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      extra: r.observacao ?? undefined,
    }))

    setItens([...itensSalas, ...itensEquip].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()))
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [meuIdUsuario])

  async function cancelar(item: Item) {
    setCancelando(item.id)
    const tabela = item.tipo === 'sala' ? 'reservas_salas' : 'reservas_equipamentos'
    const { error } = await supabase.from(tabela).update({ status: 'cancelada' }).eq('id', item.id)
    setCancelando(null)
    if (!error) carregar()
  }

  const filtrados = itens.filter((i) => filtro === 'todas' || i.status === filtro)
  const agora = new Date()

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">gestão de reservas</p>
      <h1 className="mb-6 font-display text-3xl font-bold">Minhas reservas</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtro === f.value
                ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)'
                : 'border-(--color-border) text-(--color-ink-soft) hover:bg-black/5'
            }`}
          >
            {f.label}
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
        <div className="space-y-3">
          {filtrados.map((item) => {
            const futura = new Date(item.inicio) > agora
            const podeCancelar = futura && (item.status === 'pendente' || item.status === 'aprovada')
            return (
              <div key={`${item.tipo}-${item.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-(--color-ink-soft)">{item.tipo}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="font-medium">{item.recursoNome}</p>
                  <p className="font-mono text-sm text-(--color-ink-soft)">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')} · {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {item.extra && <p className="mt-1 text-sm text-(--color-ink-soft)">{item.extra}</p>}
                </div>
                {podeCancelar && (
                  <button
                    onClick={() => cancelar(item)}
                    disabled={cancelando === item.id}
                    className="btn-secondary hover:border-(--color-coral) hover:text-(--color-coral)"
                  >
                    {cancelando === item.id ? 'cancelando…' : 'cancelar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}