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
  canceladaPorAdministracao: boolean
  justificativaCancelamento?: string
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
        .select('id, id_sala, inicio, fim, status, motivo, quantidade_pessoas, cancelada_por_administracao, justificativa_cancelamento')
        .eq('id_usuario', targetUserId)
        .order('inicio', { ascending: false }),
      supabase
        .from('reservas_equipamentos')
        .select('id, id_equipamento, inicio, fim, status, observacao, cancelada_por_administracao, justificativa_cancelamento')
        .eq('id_usuario', targetUserId)
        .order('inicio', { ascending: false }),
      supabase.from('salas').select('id_sala, nome'),
      supabase.from('equipamentos').select('id, nome'),
    ])

    const mapaSalas = new Map<number, string>(
      (resListaSalas.data ?? []).map((s: any) => [s.id_sala, s.nome])
    )
    const mapaEquip = new Map<number, string>(
      (resListaEquip.data ?? []).map((e: any) => [e.id, e.nome])
    )

    const itensSalas: Item[] = (resSalas.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'sala',
      recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      extra: r.motivo ? `${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : undefined,
      canceladaPorAdministracao: r.cancelada_por_administracao ?? false,
      justificativaCancelamento: r.justificativa_cancelamento ?? undefined,
    }))

    const itensEquip: Item[] = (resEquip.data ?? []).map((r: any) => ({
      id: r.id,
      tipo: 'equipamento',
      recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      extra: r.observacao ?? undefined,
      canceladaPorAdministracao: r.cancelada_por_administracao ?? false,
      justificativaCancelamento: r.justificativa_cancelamento ?? undefined,
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
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <p className="kicker">gestão de reservas</p>
      <h1 className="mb-2 font-display text-4xl font-extrabold tracking-tight">Minhas reservas</h1>
      {localStorage.getItem('agendalab_plano') !== 'premium' && (
        <p className="mb-6 text-sm text-(--color-ink-soft)">
          Plano gratuito: até 2 salas reservadas por vez e 50 reservas no mês.{' '}
          <a href="/planos" className="font-medium text-(--color-cyan) hover:underline">
            Ver planos
          </a>
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={`chip ${filtro === f.value ? 'chip-on' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-(--color-ink-soft)">carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="empty">
          Nenhuma reserva encontrada para esse filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {filtrados.map((item) => {
            const futura = new Date(item.inicio) > agora
            const podeCancelar = futura && (item.status === 'pendente' || item.status === 'aprovada')
            return (
              <div key={`${item.tipo}-${item.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">{item.tipo}</span>
                    <StatusBadge status={item.canceladaPorAdministracao ? 'cancelada_administracao' : item.status} />
                  </div>
                  <p className="font-semibold">{item.recursoNome}</p>
                  <p className="text-sm text-(--color-ink-soft)">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')} · {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {item.extra && <p className="mt-1 text-sm text-(--color-ink-soft)">{item.extra}</p>}
                  {item.justificativaCancelamento && (
                    <p className="alert-error mt-2">
                      Justificativa da Administração: {item.justificativaCancelamento}
                    </p>
                  )}
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
