import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../contexts/AuthContext'
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
  canceladaPorAdministracao: boolean
  justificativaCancelamento?: string
  acessorios?: Array<{
    nome: string
    quantidade: number
    status: StatusReserva
  }>
}

// Filtros alinhados com o tipo 'StatusReserva' ('pendente', 'aprovada', 'cancelada')
const FILTROS: { value: 'todas' | StatusReserva; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovada', label: 'Aprovadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

export function AdminReservas() {
  const { role } = useAuth()
  const [itens, setItens] = useState<Item[]>([])
  const [filtroStatus, setFiltroStatus] = useState<'todas' | StatusReserva>('todas')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoRecurso>('todos')
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)

    let idUsuarioLogado: number | null = null

    // Se o usuário não for admin, obtém o id_usuario numérico correspondente
    if (role !== 'admin') {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: uBD } = await supabase
          .from('usuarios')
          .select('id_usuario')
          .or(`uuid.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle()

        if (uBD) idUsuarioLogado = uBD.id_usuario
      }
    }

    // Prepara as consultas
    let querySalas = supabase
      .from('reservas_salas')
      .select('id, id_sala, inicio, fim, status, motivo, quantidade_pessoas, id_usuario, cancelada_por_administracao, justificativa_cancelamento, usuarios(nome)')
      .order('inicio', { ascending: false })

    let queryEquip = supabase
      .from('reservas_equipamentos')
      .select('id, id_equipamento, id_reserva_sala, inicio, fim, status, quantidade, observacao, id_usuario, cancelada_por_administracao, justificativa_cancelamento, usuarios(nome)')
      .order('inicio', { ascending: false })

    // Aplica o filtro se for usuário comum (aluno) e tivermos encontrado o idUsuarioLogado
    if (role !== 'admin' && idUsuarioLogado) {
      querySalas = querySalas.eq('id_usuario', idUsuarioLogado)
      queryEquip = queryEquip.eq('id_usuario', idUsuarioLogado)
    }

    // Busca as reservas e as listas com os nomes dos recursos
    const [resSalas, resEquip, resListaSalas, resListaEquip] = await Promise.all([
      querySalas,
      queryEquip,
      supabase.from('salas').select('id_sala, nome'),
      supabase.from('equipamentos').select('id, nome'),
    ])

    // Mapeamento dos nomes de salas e equipamentos
    const mapaSalas = new Map<number, string>(
      (resListaSalas.data ?? []).map((s: any) => [s.id_sala, s.nome])
    )
    const mapaEquip = new Map<number, string>(
      (resListaEquip.data ?? []).map((e: any) => [e.id, e.nome])
    )

    const acessoriosPorReservaSala = new Map<number, NonNullable<Item['acessorios']>>()
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
      tipo: 'sala',
      recursoNome: mapaSalas.get(r.id_sala) ?? `Sala #${r.id_sala}`,
      usuarioNome: r.usuarios?.nome ?? 'Usuário',
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      detalhe: r.motivo ? `${r.motivo} · ${r.quantidade_pessoas ?? '—'} pessoa(s)` : undefined,
      canceladaPorAdministracao: r.cancelada_por_administracao ?? false,
      justificativaCancelamento: r.justificativa_cancelamento ?? undefined,
      acessorios: acessoriosPorReservaSala.get(r.id) ?? [],
    }))

    const itensEquip: Item[] = (resEquip.data ?? [])
      .filter((r: any) => r.id_reserva_sala === null || r.id_reserva_sala === undefined)
      .map((r: any) => ({
        id: r.id,
        tipo: 'equipamento',
        recursoNome: mapaEquip.get(r.id_equipamento) ?? `Equipamento #${r.id_equipamento}`,
        usuarioNome: r.usuarios?.nome ?? 'Usuário',
        inicio: r.inicio,
        fim: r.fim,
        status: r.status,
        detalhe: `Quantidade: ${r.quantidade ?? 1}${r.observacao ? ` · ${r.observacao}` : ''}`,
        canceladaPorAdministracao: r.cancelada_por_administracao ?? false,
        justificativaCancelamento: r.justificativa_cancelamento ?? undefined,
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
  }, [role])

  const filtrados = itens
    .filter((i) => filtroStatus === 'todas' || i.status === filtroStatus)
    .filter((i) => filtroTipo === 'todos' || i.tipo === filtroTipo)

    //funcao de exportacao
  function exportarParaCSV() {
    if (filtrados.length === 0) {
      alert('Não há dados para exportar.')
      return
    }

    // 1. Montar o cabeçalho dinâmico (Admin vê o solicitante, o aluno não)
    const cabecalho = role === 'admin'
      ? 'Recurso,Tipo,Solicitante,Data Inicio,Data Fim,Status,Detalhes\n'
      : 'Recurso,Tipo,Data Inicio,Data Fim,Status,Detalhes\n'

    let csv = cabecalho

    // 2. Preencher as linhas formatando as datas
    filtrados.forEach((item) => {
      const recurso = `"${item.recursoNome}"`
      const tipo = `"${item.tipo}"`
      const solicitante = `"${item.usuarioNome}"`
      const inicio = `"${new Date(item.inicio).toLocaleString('pt-BR')}"`
      const fim = `"${new Date(item.fim).toLocaleString('pt-BR')}"`
      const status = `"${item.canceladaPorAdministracao ? 'Cancelada pela Administração' : item.status}"`
      const detalhes = [
        item.detalhe,
        item.acessorios && item.acessorios.length > 0
          ? `Acessórios: ${item.acessorios.map((acessorio) => (
              `${acessorio.nome} x ${acessorio.quantidade}${acessorio.status === 'cancelada' ? ' (cancelado)' : ''}`
            )).join(', ')}`
          : undefined,
        item.justificativaCancelamento
          ? `Justificativa da Administração: ${item.justificativaCancelamento}`
          : undefined,
      ].filter(Boolean).join(' · ')
      const detalhe = `"${detalhes.replace(/"/g, '""')}"` // Evita quebra se tiver aspas no texto

      if (role === 'admin') {
        csv += `${recurso},${tipo},${solicitante},${inicio},${fim},${status},${detalhe}\n`
      } else {
        csv += `${recurso},${tipo},${inicio},${fim},${status},${detalhe}\n`
      }
    })

    // 3. Gerar o download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'historico_reservas.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }  

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <p className="kicker">
        {role === 'admin' ? 'painel administrativo' : 'minhas reservas'}
      </p>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">
        {role === 'admin' ? 'Todas as reservas' : 'Histórico de reservas'}
      </h1>

      <button
          onClick={exportarParaCSV}
          className="btn-secondary text-xs"
          disabled={filtrados.length === 0}
        >
          ↓ baixar histórico (csv)
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltroStatus(f.value)}
            className={`chip ${filtroStatus === f.value ? 'chip-on' : ''}`}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-(--color-border)" />
        {(['todos', 'sala', 'equipamento'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t)}
            className={`chip capitalize ${filtroTipo === t ? 'chip-on' : ''}`}
          >
            {t === 'todos' ? 'todos os tipos' : t === 'sala' ? 'salas' : 'equipamentos'}
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recurso</th>
                {role === 'admin' && <th>Solicitante</th>}
                <th>Período</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <tr key={`${item.tipo}-${item.id}`} className="align-top">
                  <td>
                    <p className="font-medium">{item.recursoNome}</p>
                    <p className="text-xs uppercase tracking-[0.12em] text-(--color-ink-soft)">{item.tipo}</p>
                    {item.detalhe && <p className="mt-1 text-xs text-(--color-ink-soft)">{item.detalhe}</p>}
                    {item.acessorios && item.acessorios.length > 0 && (
                      <p className="mt-1 text-xs text-(--color-ink-soft)">
                        <span className="font-medium text-(--color-ink)">Acessórios: </span>
                        {item.acessorios.map((acessorio) => (
                          `${acessorio.nome} × ${acessorio.quantidade}${acessorio.status === 'cancelada' ? ' (cancelado)' : ''}`
                        )).join(', ')}
                      </p>
                    )}
                    {item.justificativaCancelamento && (
                      <p className="mt-1 text-xs text-(--color-coral)">
                        Justificativa da Administração: {item.justificativaCancelamento}
                      </p>
                    )}
                  </td>
                  {role === 'admin' && <td>{item.usuarioNome}</td>}
                  <td className="text-xs">
                    {new Date(item.inicio).toLocaleDateString('pt-BR')}
                    <br />
                    {new Date(item.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(item.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <StatusBadge status={item.canceladaPorAdministracao ? 'cancelada_administracao' : item.status} />
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
