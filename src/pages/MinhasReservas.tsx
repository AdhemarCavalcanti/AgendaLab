import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { StatusBadge } from '../components/StatusBadge'
import { Modal } from '../components/Modal'
import type { SeveridadeAvaria, StatusReserva } from '../lib/types'

interface Item {
  id: number
  idRecurso: number
  tipo: 'sala' | 'equipamento'
  recursoNome: string
  inicio: string
  fim: string
  status: StatusReserva
  extra?: string
  canceladaPorAdministracao: boolean
  justificativaCancelamento?: string
  acessorios?: Array<{
    nome: string
    quantidade: number
    status: StatusReserva
  }>
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

  // Estados para reporte de avaria
  const [modalAvariaItem, setModalAvariaItem] = useState<Item | null>(null)
  const [severidade, setSeveridade] = useState<SeveridadeAvaria>('media')
  const [descricaoAvaria, setDescricaoAvaria] = useState('')
  const [enviandoAvaria, setEnviandoAvaria] = useState(false)
  const [erroAvaria, setErroAvaria] = useState<string | null>(null)
  const [sucessoAvaria, setSucessoAvaria] = useState<string | null>(null)
  const [avariasEnviadas, setAvariasEnviadas] = useState<Set<string>>(new Set())

  function abrirModalAvaria(item: Item) {
    setModalAvariaItem(item)
    setSeveridade('media')
    setDescricaoAvaria('')
    setErroAvaria(null)
    setSucessoAvaria(null)
  }

  function fecharModalAvaria() {
    setModalAvariaItem(null)
    setErroAvaria(null)
    setSucessoAvaria(null)
  }

  async function submeterAvaria(e: React.FormEvent) {
    e.preventDefault()
    if (!modalAvariaItem) return
    if (!descricaoAvaria.trim()) {
      setErroAvaria('Descreva a ocorrência detalhadamente.')
      return
    }

    setEnviandoAvaria(true)
    setErroAvaria(null)

    const payload: any = {
      id_usuario: meuIdUsuario,
      tipo_recurso: modalAvariaItem.tipo,
      id_recurso: modalAvariaItem.idRecurso,
      recurso_nome: modalAvariaItem.recursoNome,
      id_reserva_sala: modalAvariaItem.tipo === 'sala' ? modalAvariaItem.id : null,
      id_reserva_equipamento: modalAvariaItem.tipo === 'equipamento' ? modalAvariaItem.id : null,
      severidade,
      descricao: descricaoAvaria.trim(),
      status: 'pendente',
    }

    const { error } = await supabase.from('relatos_avarias').insert(payload)

    setEnviandoAvaria(false)

    if (error) {
      setErroAvaria('Não foi possível registrar o relato. Tente novamente.')
    } else {
      setSucessoAvaria('Relato de avaria enviado com sucesso à administração.')
      setAvariasEnviadas((prev) => new Set(prev).add(`${modalAvariaItem.tipo}-${modalAvariaItem.id}`))
      setTimeout(() => {
        fecharModalAvaria()
      }, 1500)
    }
  }

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
        .select('id, id_equipamento, id_reserva_sala, inicio, fim, status, quantidade, observacao, cancelada_por_administracao, justificativa_cancelamento')
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

    const acessoriosPorReservaSala = new Map<number, Item['acessorios']>()
    for (const reserva of (resEquip.data ?? []) as any[]) {
      if (reserva.id_reserva_sala === null || reserva.id_reserva_sala === undefined) continue
      const idReservaSala = Number(reserva.id_reserva_sala)
      const atuais = acessoriosPorReservaSala.get(idReservaSala) ?? []
      atuais.push({
        nome: mapaEquip.get(reserva.id_equipamento) ?? `Equipamento #${reserva.id_equipamento}`,
        quantidade: Number(reserva.quantidade ?? 1),
        status: reserva.status,
      })
      acessoriosPorReservaSala.set(idReservaSala, atuais)
    }

    const itensSalas: Item[] = (resSalas.data ?? []).map((r: any) => ({
      id: r.id,
      idRecurso: r.id_sala,
      tipo: 'sala',
      recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      extra: r.motivo ? `${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : undefined,
      canceladaPorAdministracao: r.cancelada_por_administracao ?? false,
      justificativaCancelamento: r.justificativa_cancelamento ?? undefined,
      acessorios: acessoriosPorReservaSala.get(r.id) ?? [],
    }))

    const itensEquip: Item[] = (resEquip.data ?? [])
      .filter((r: any) => r.id_reserva_sala === null || r.id_reserva_sala === undefined)
      .map((r: any) => ({
        id: r.id,
        idRecurso: r.id_equipamento,
        tipo: 'equipamento',
        recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
        inicio: r.inicio,
        fim: r.fim,
        status: r.status,
        extra: `Quantidade: ${r.quantidade ?? 1}${r.observacao ? ` · ${r.observacao}` : ''}`,
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
            const concluida = item.status === 'aprovada' && new Date(item.inicio) <= agora
            const chaveAvaria = `${item.tipo}-${item.id}`
            const jaReportado = avariasEnviadas.has(chaveAvaria)

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
                  {item.acessorios && item.acessorios.length > 0 && (
                    <p className="mt-1 text-sm text-(--color-ink-soft)">
                      <span className="font-medium text-(--color-ink)">Acessórios: </span>
                      {item.acessorios.map((acessorio) => (
                        `${acessorio.nome} × ${acessorio.quantidade}${acessorio.status === 'cancelada' ? ' (cancelado)' : ''}`
                      )).join(', ')}
                    </p>
                  )}
                  {item.justificativaCancelamento && (
                    <p className="alert-error mt-2">
                      Justificativa da Administração: {item.justificativaCancelamento}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {concluida && (
                    <button
                      type="button"
                      onClick={() => abrirModalAvaria(item)}
                      className="btn-secondary border-(--color-amber)/50 text-(--color-amber) hover:bg-(--color-amber)/10"
                    >
                      {jaReportado ? 'Reportar outro problema' : 'Reportar problema/avaria'}
                    </button>
                  )}
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
              </div>
            )
          })}
        </div>
      )}

      {modalAvariaItem && (
        <Modal
          onClose={fecharModalAvaria}
          title={`Reportar problema/avaria: ${modalAvariaItem.recursoNome}`}
        >
          <form onSubmit={submeterAvaria} className="space-y-4">
            <p className="text-sm text-(--color-ink-soft)">
              Descreva o defeito ou avaria identificado após o uso deste recurso para que a administração seja notificada e tome as devidas providências.
            </p>

            {erroAvaria && <p className="alert-error text-sm">{erroAvaria}</p>}
            {sucessoAvaria && (
              <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                {sucessoAvaria}
              </p>
            )}

            <div>
              <label htmlFor="severidade-select" className="mb-1 block text-sm font-medium">
                Severidade <span className="text-(--color-coral)">*</span>
              </label>
              <select
                id="severidade-select"
                value={severidade}
                onChange={(e) => setSeveridade(e.target.value as SeveridadeAvaria)}
                className="input"
              >
                <option value="leve">Leve</option>
                <option value="media">Média</option>
                <option value="critica">Crítica</option>
              </select>
            </div>

            <div>
              <label htmlFor="descricao-avaria" className="mb-1 block text-sm font-medium">
                Detalhes da ocorrência <span className="text-(--color-coral)">*</span>
              </label>
              <textarea
                id="descricao-avaria"
                rows={4}
                value={descricaoAvaria}
                onChange={(e) => setDescricaoAvaria(e.target.value)}
                placeholder="Descreva detalhadamente o defeito ou avaria encontrado..."
                className="input"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={fecharModalAvaria}
                disabled={enviandoAvaria}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviandoAvaria || !descricaoAvaria.trim()}
                className="btn-primary"
              >
                {enviandoAvaria ? 'Enviando…' : 'Enviar relato'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
