import { useEffect, useMemo, useState } from 'react'
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/StatusBadge'
import type {
  BloqueioManutencao,
  Equipamento,
  ReservaEquipamento,
  ReservaSala,
  Sala,
} from '../../lib/types'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function agora() {
  return new Date().toISOString()
}

function ativo(inicio: string, fim: string) {
  const n = new Date()
  return new Date(inicio) <= n && new Date(fim) >= n
}

// ---------------------------------------------------------------------------
// tipos internos
// ---------------------------------------------------------------------------
interface RecursoRow {
  tipo: 'sala' | 'equipamento'
  id: number
  nome: string
  status: string
  capacidade: number
  emManutencao: number
  reservasAtivas: number
  reservasHoje: number
  proximoBloqueio: BloqueioManutencao | null
  bloqueioAtivo: BloqueioManutencao | null
}

// ---------------------------------------------------------------------------
// componentes pequenos
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  accent = 'cyan',
}: {
  label: string
  value: number | string
  accent?: 'cyan' | 'amber' | 'coral' | 'green'
}) {
  const colorMap = {
    cyan: 'text-(--color-cyan)',
    amber: 'text-(--color-amber)',
    coral: 'text-(--color-coral)',
    green: 'text-(--color-green)',
  }
  return (
    <div className="reg-mark card p-4 flex flex-col gap-1">
      <p className={`font-display text-3xl font-bold ${colorMap[accent]}`}>{value}</p>
      <p className="font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">{label}</p>
    </div>
  )
}

function Barra({ pct, color = 'cyan' }: { pct: number; color?: 'cyan' | 'amber' | 'coral' | 'green' }) {
  const bgMap = {
    cyan: 'bg-(--color-cyan)',
    amber: 'bg-(--color-amber)',
    coral: 'bg-(--color-coral)',
    green: 'bg-(--color-green)',
  }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-paper)">
      <div
        className={`h-full rounded-full ${bgMap[color]} transition-all duration-500`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  )
}

type IconName = 'sala' | 'equip' | 'block' | 'clock' | 'check' | 'warn' | 'refresh'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    sala: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z M9 21V12h6v9" />
    ),
    equip: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.5 2.121m-1.5-2.121c.25.023.5.05.75.082M15 14.5l-1.5-1.5M15 14.5V21m-9 0h9" />
    ),
    block: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    ),
    clock: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    check: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    warn: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    ),
    refresh: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    ),
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" className="w-4 h-4">
      {paths[name]}
    </svg>
  )
}

const PIE_COLORS = {
  livre: '#2E7D53',
  ocupado: '#C97227',
  manutencao: '#C4463D',
}

// ---------------------------------------------------------------------------
// página principal
// ---------------------------------------------------------------------------
export function AdminAcompanhamentoRecursos() {
  const [salas, setSalas] = useState<(Sala & { quantidade_manutencao?: number })[]>([])
  const [equipamentos, setEquipamentos] = useState<
    (Equipamento & { quantidade_manutencao?: number })[]
  >([])
  const [reservasSalas, setReservasSalas] = useState<ReservaSala[]>([])
  const [reservasEquip, setReservasEquip] = useState<ReservaEquipamento[]>([])
  const [bloqueios, setBloqueios] = useState<BloqueioManutencao[]>([])
  const [loading, setLoading] = useState(true)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date>(new Date())

  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'sala' | 'equipamento'>('todos')
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'livre' | 'ocupado' | 'manutencao'>('todos')
  const [busca, setBusca] = useState('')
  const [recursoDetalhe, setRecursoDetalhe] = useState<RecursoRow | null>(null)

  async function carregarDados() {
    setLoading(true)
    const [s, e, rs, re, bl] = await Promise.all([
      supabase.from('salas').select('*'),
      supabase.from('equipamentos').select('*'),
      supabase.from('reservas_salas').select('*'),
      supabase.from('reservas_equipamentos').select('*'),
      supabase.from('bloqueios_manutencao').select('*').order('inicio', { ascending: true }),
    ])
    setSalas((s.data as typeof salas) ?? [])
    setEquipamentos((e.data as typeof equipamentos) ?? [])
    setReservasSalas((rs.data as ReservaSala[]) ?? [])
    setReservasEquip((re.data as ReservaEquipamento[]) ?? [])
    setBloqueios((bl.data as BloqueioManutencao[]) ?? [])
    setUltimaAtualizacao(new Date())
    setLoading(false)
  }

  useEffect(() => { carregarDados() }, [])

  // montar linhas consolidadas
  const rows = useMemo<RecursoRow[]>(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const amanha = new Date(hoje)
    amanha.setDate(amanha.getDate() + 1)
    const now = agora()
    const resultado: RecursoRow[] = []

    for (const sala of salas) {
      const reservasAtivas = reservasSalas.filter(
        (r) => r.id_sala === sala.id_sala && ['pendente', 'aprovada'].includes(r.status) && ativo(r.inicio, r.fim)
      )
      const reservasHoje = reservasSalas.filter(
        (r) => r.id_sala === sala.id_sala && ['pendente', 'aprovada'].includes(r.status)
          && new Date(r.inicio) >= hoje && new Date(r.inicio) < amanha
      )
      const bloqueiosSala = bloqueios.filter((b) => b.id_sala === sala.id_sala)
      const bloqueioAtivo = bloqueiosSala.find((b) => ativo(b.inicio, b.fim)) ?? null
      const proximoBloqueio = bloqueiosSala.find((b) => new Date(b.inicio) > new Date(now)) ?? null
      resultado.push({
        tipo: 'sala', id: sala.id_sala, nome: sala.nome, status: sala.status,
        capacidade: sala.lotacao, emManutencao: 0,
        reservasAtivas: reservasAtivas.length, reservasHoje: reservasHoje.length,
        proximoBloqueio, bloqueioAtivo,
      })
    }

    for (const eq of equipamentos) {
      const reservasAtivas = reservasEquip.filter(
        (r) => r.id_equipamento === eq.id && ['pendente', 'aprovada'].includes(r.status) && ativo(r.inicio, r.fim)
      )
      const reservasHoje = reservasEquip.filter(
        (r) => r.id_equipamento === eq.id && ['pendente', 'aprovada'].includes(r.status)
          && new Date(r.inicio) >= hoje && new Date(r.inicio) < amanha
      )
      const bloqueiosEq = bloqueios.filter((b) => b.id_equipamento === eq.id)
      const bloqueioAtivo = bloqueiosEq.find((b) => ativo(b.inicio, b.fim)) ?? null
      const proximoBloqueio = bloqueiosEq.find((b) => new Date(b.inicio) > new Date(now)) ?? null
      resultado.push({
        tipo: 'equipamento', id: eq.id, nome: eq.nome, status: eq.status,
        capacidade: eq.quantidade, emManutencao: eq.quantidade_manutencao ?? 0,
        reservasAtivas: reservasAtivas.length, reservasHoje: reservasHoje.length,
        proximoBloqueio, bloqueioAtivo,
      })
    }
    return resultado
  }, [salas, equipamentos, reservasSalas, reservasEquip, bloqueios])

  // métricas globais
  const totalLivres    = rows.filter((r) => r.status === 'livre').length
  const totalOcupados  = rows.filter((r) => r.status === 'ocupado').length
  const totalManutencao = rows.filter((r) => r.status === 'manutencao').length
  const totalAtivos    = rows.filter((r) => r.reservasAtivas > 0).length
  const totalBloqueiosAtivos = bloqueios.filter((b) => ativo(b.inicio, b.fim)).length

  const pizzaData = [
    { name: 'Disponível', value: totalLivres,     color: PIE_COLORS.livre },
    { name: 'Ocupado',    value: totalOcupados,   color: PIE_COLORS.ocupado },
    { name: 'Manutenção', value: totalManutencao, color: PIE_COLORS.manutencao },
  ].filter((d) => d.value > 0)

  // filtro
  const rowsFiltradas = useMemo(() => rows.filter((r) => {
    if (tipoFiltro !== 'todos' && r.tipo !== tipoFiltro) return false
    if (statusFiltro !== 'todos' && r.status !== statusFiltro) return false
    if (busca && !r.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  }), [rows, tipoFiltro, statusFiltro, busca])

  // reservas futuras para painel de detalhe
  const reservasAtivasDetalhe = useMemo(() => {
    if (!recursoDetalhe) return []
    const now = agora()
    if (recursoDetalhe.tipo === 'sala') {
      return reservasSalas
        .filter((r) => r.id_sala === recursoDetalhe.id && ['pendente', 'aprovada'].includes(r.status) && new Date(r.fim) >= new Date(now))
        .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()).slice(0, 10)
    }
    return reservasEquip
      .filter((r) => r.id_equipamento === recursoDetalhe.id && ['pendente', 'aprovada'].includes(r.status) && new Date(r.fim) >= new Date(now))
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()).slice(0, 10)
  }, [recursoDetalhe, reservasSalas, reservasEquip])

  const bloqueiosDetalhe = useMemo(() => {
    if (!recursoDetalhe) return []
    return bloqueios
      .filter((b) => recursoDetalhe.tipo === 'sala' ? b.id_sala === recursoDetalhe.id : b.id_equipamento === recursoDetalhe.id)
      .filter((b) => new Date(b.fim) >= new Date())
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()).slice(0, 5)
  }, [recursoDetalhe, bloqueios])

  if (loading)
    return <p className="mx-auto max-w-6xl px-4 py-10 font-mono text-sm text-(--color-ink-soft)">carregando dados…</p>

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      {/* cabeçalho */}
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold">Acompanhamento de recursos</h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-(--color-ink-soft)">
            atualizado às {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button onClick={carregarDados} className="btn-secondary text-xs flex items-center gap-1.5">
            <Icon name="refresh" /> atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Disponíveis agora"  value={totalLivres}           accent="green" />
        <StatCard label="Ocupados"           value={totalOcupados}         accent="amber" />
        <StatCard label="Em manutenção"      value={totalManutencao}       accent="coral" />
        <StatCard label="C/ reserva ativa"   value={totalAtivos}           accent="cyan"  />
        <StatCard label="Bloqueios em vigor" value={totalBloqueiosAtivos}  accent="coral" />
      </div>

      {/* gráfico + filtros */}
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <div className="card p-5 flex flex-col">
          <h2 className="mb-1 text-base font-semibold">Distribuição de status</h2>
          <p className="mb-4 text-sm text-(--color-ink-soft)">Todos os recursos ({rows.length} total)</p>
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pizzaData} cx="50%" cy="50%" innerRadius={52} outerRadius={80}
                  paddingAngle={3} dataKey="value" stroke="none">
                  {pizzaData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 12, borderRadius: 8, border: '1px solid #D2DEDD' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5 md:col-span-2 flex flex-col gap-4">
          <h2 className="text-base font-semibold">Filtrar recursos</h2>
          <input id="busca-recurso" type="text" className="input" placeholder="Buscar por nome…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div>
            <p className="mb-1.5 font-mono text-xs uppercase text-(--color-ink-soft)">Tipo</p>
            <div className="flex gap-2 flex-wrap">
              {(['todos', 'sala', 'equipamento'] as const).map((t) => (
                <button key={t} onClick={() => setTipoFiltro(t)}
                  className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${tipoFiltro === t ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)' : 'border-(--color-border) text-(--color-ink-soft) hover:border-(--color-cyan)/50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-mono text-xs uppercase text-(--color-ink-soft)">Status</p>
            <div className="flex gap-2 flex-wrap">
              {(['todos', 'livre', 'ocupado', 'manutencao'] as const).map((s) => (
                <button key={s} onClick={() => setStatusFiltro(s)}
                  className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${statusFiltro === s ? 'border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan)' : 'border-(--color-border) text-(--color-ink-soft) hover:border-(--color-cyan)/50'}`}>
                  {s === 'manutencao' ? 'manutenção' : s}
                </button>
              ))}
            </div>
          </div>
          <p className="font-mono text-xs text-(--color-ink-soft) mt-auto">
            {rowsFiltradas.length} de {rows.length} recursos
          </p>
        </div>
      </div>

      {/* grade de cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rowsFiltradas.length === 0 && (
          <p className="col-span-full text-sm text-(--color-ink-soft) font-mono">Nenhum recurso encontrado.</p>
        )}
        {rowsFiltradas.map((r) => {
          const pctOcupacao = r.status === 'ocupado' ? 100 : r.reservasAtivas > 0 ? 55 : 0
          const corBarra = r.status === 'manutencao' ? 'coral' : r.status === 'ocupado' ? 'amber' : 'green'
          const isSelected = recursoDetalhe?.id === r.id && recursoDetalhe.tipo === r.tipo
          return (
            <button
              key={`${r.tipo}-${r.id}`}
              id={`recurso-card-${r.tipo}-${r.id}`}
              onClick={() => setRecursoDetalhe(isSelected ? null : r)}
              className={`card p-4 text-left transition-all hover:shadow-md hover:border-(--color-cyan)/40 ${isSelected ? 'border-(--color-cyan) ring-1 ring-(--color-cyan)/30 shadow-md' : ''}`}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${r.tipo === 'sala' ? 'bg-(--color-cyan-soft) text-(--color-cyan)' : 'bg-(--color-amber-soft) text-(--color-amber)'}`}>
                    <Icon name={r.tipo === 'sala' ? 'sala' : 'equip'} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{r.nome}</p>
                    <p className="font-mono text-[10px] text-(--color-ink-soft) uppercase tracking-wide">{r.tipo}</p>
                  </div>
                </div>
                <StatusBadge status={r.status} tipo="recurso" />
              </div>

              <div className="mb-3">
                <div className="mb-1 flex justify-between font-mono text-[10px] text-(--color-ink-soft)">
                  <span>ocupação</span>
                  <span>{r.reservasAtivas} ativa{r.reservasAtivas !== 1 ? 's' : ''}</span>
                </div>
                <Barra pct={pctOcupacao} color={corBarra} />
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-(--color-ink-soft)">
                <span className="flex items-center gap-1">
                  <Icon name="check" />
                  {r.tipo === 'sala' ? `${r.capacidade} lug.` : `${r.capacidade - r.emManutencao}/${r.capacidade} un.`}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="clock" />
                  {r.reservasHoje} hoje
                </span>
                {r.bloqueioAtivo && (
                  <span className="col-span-2 flex items-center gap-1 text-(--color-coral)">
                    <Icon name="block" /> Bloqueio ativo
                  </span>
                )}
                {!r.bloqueioAtivo && r.proximoBloqueio && (
                  <span className="col-span-2 flex items-center gap-1 text-(--color-amber)">
                    <Icon name="warn" /> Próx.: {formatarDataHora(r.proximoBloqueio.inicio)}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* painel de detalhe */}
      {recursoDetalhe && (
        <div className="mt-8 card p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-(--color-cyan) mb-1">detalhes · {recursoDetalhe.tipo}</p>
              <h2 className="font-display text-xl font-bold">{recursoDetalhe.nome}</h2>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={recursoDetalhe.status} tipo="recurso" />
              <button onClick={() => setRecursoDetalhe(null)} className="btn-secondary text-xs">fechar</button>
            </div>
          </div>

          {/* métricas rápidas */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="reg-mark rounded-lg border border-(--color-border) p-3">
              <p className="font-display text-2xl font-bold text-(--color-cyan)">{recursoDetalhe.reservasAtivas}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-(--color-ink-soft)">reservas ativas</p>
            </div>
            <div className="reg-mark rounded-lg border border-(--color-border) p-3">
              <p className="font-display text-2xl font-bold text-(--color-amber)">{recursoDetalhe.reservasHoje}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-(--color-ink-soft)">reservas hoje</p>
            </div>
            <div className="reg-mark rounded-lg border border-(--color-border) p-3">
              <p className="font-display text-2xl font-bold text-(--color-ink)">
                {recursoDetalhe.tipo === 'sala' ? recursoDetalhe.capacidade : `${recursoDetalhe.capacidade - recursoDetalhe.emManutencao}`}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-(--color-ink-soft)">
                {recursoDetalhe.tipo === 'sala' ? 'capacidade (lug.)' : 'unidades disponíveis'}
              </p>
            </div>
            <div className="reg-mark rounded-lg border border-(--color-border) p-3">
              <p className="font-display text-2xl font-bold text-(--color-coral)">{bloqueiosDetalhe.length}</p>
              <p className="font-mono text-[10px] uppercase tracking-wide text-(--color-ink-soft)">bloqueios futuros</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* próximas reservas */}
            <div>
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">Próximas reservas</h3>
              {reservasAtivasDetalhe.length === 0 ? (
                <p className="font-mono text-sm text-(--color-ink-soft)">Sem reservas futuras.</p>
              ) : (
                <div className="space-y-2">
                  {reservasAtivasDetalhe.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--color-border) bg-(--color-paper) px-3 py-2">
                      <div className="font-mono text-xs">
                        <p className="font-medium text-(--color-ink)">{formatarDataHora(r.inicio)} → {formatarDataHora(r.fim)}</p>
                        {'quantidade_pessoas' in r && (r as ReservaSala).quantidade_pessoas != null && (
                          <p className="text-(--color-ink-soft)">{(r as ReservaSala).quantidade_pessoas} pessoa(s)</p>
                        )}
                      </div>
                      <StatusBadge status={r.status} tipo="reserva" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* bloqueios */}
            <div>
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">Bloqueios / manutenções</h3>
              {bloqueiosDetalhe.length === 0 ? (
                <p className="font-mono text-sm text-(--color-ink-soft)">Sem bloqueios registrados.</p>
              ) : (
                <div className="space-y-2">
                  {bloqueiosDetalhe.map((b) => (
                    <div key={b.id} className={`rounded-lg border px-3 py-2 font-mono text-xs ${ativo(b.inicio, b.fim) ? 'border-(--color-coral)/40 bg-(--color-coral-soft) text-(--color-coral)' : 'border-(--color-amber)/40 bg-(--color-amber-soft) text-(--color-amber)'}`}>
                      <p className="font-medium">{formatarDataHora(b.inicio)} → {formatarDataHora(b.fim)}</p>
                      <p className="mt-0.5 text-[10px] opacity-80">{b.motivo}</p>
                      {ativo(b.inicio, b.fim) && (
                        <span className="mt-1 inline-flex items-center gap-1"><Icon name="block" /> Em vigor agora</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
