import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import type { Equipamento, ReservaEquipamento, ReservaSala, Sala } from '../../lib/types'

function inicioDaSemana(d: Date) {
  const date = new Date(d)
  const dia = date.getDay()
  const diff = date.getDate() - dia + (dia === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function AdminDashboard() {
  const [reservasSalas, setReservasSalas] = useState<ReservaSala[]>([])
  const [reservasEquip, setReservasEquip] = useState<ReservaEquipamento[]>([])
  const [salas, setSalas] = useState<Sala[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [rs, re, s, e] = await Promise.all([
        supabase.from('reservas_salas').select('*'),
        supabase.from('reservas_equipamentos').select('*'),
        supabase.from('salas').select('*'),
        supabase.from('equipamentos').select('*'),
      ])
      setReservasSalas((rs.data as ReservaSala[]) ?? [])
      setReservasEquip((re.data as ReservaEquipamento[]) ?? [])
      setSalas((s.data as Sala[]) ?? [])
      setEquipamentos((e.data as Equipamento[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const todasReservas = useMemo(
    () => [
      ...reservasSalas.map((r) => ({ ...r, tipo: 'sala' as const, recursoId: r.id_sala })),
      ...reservasEquip.map((r) => ({ ...r, tipo: 'equipamento' as const, recursoId: r.id_equipamento })),
    ],
    [reservasSalas, reservasEquip]
  )

  const concluidas = todasReservas.filter((r) => r.status === 'aprovada')

  const porSemana = useMemo(() => {
    const map = new Map<string, number>()
    const hoje = new Date()
    for (let i = 7; i >= 0; i--) {
      const semana = inicioDaSemana(new Date(hoje.getTime() - i * 7 * 24 * 3600 * 1000))
      const key = semana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map.set(key, 0)
    }
    for (const r of concluidas) {
      const semana = inicioDaSemana(new Date(r.inicio))
      const key = semana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([semana, total]) => ({ semana, total }))
  }, [concluidas])

  const ocupacaoPorRecurso = useMemo(() => {
    const totalHorasJanela = 15 * 15 // 15 dias * 15h úteis (7h-22h) como referência de janela analisada
    const horasPorRecurso = new Map<number, { nome: string; tipo: string; horas: number }>()

    for (const s of salas) horasPorRecurso.set(-s.id_sala, { nome: s.nome, tipo: 'sala', horas: 0 })
    for (const e of equipamentos) horasPorRecurso.set(e.id, { nome: e.nome, tipo: 'equipamento', horas: 0 })

    for (const r of concluidas) {
      const chave = r.tipo === 'sala' ? -r.recursoId : r.recursoId
      const atual = horasPorRecurso.get(chave)
      if (!atual) continue
      const horas = (new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 3600000
      atual.horas += horas
    }

    return Array.from(horasPorRecurso.values())
      .map((r) => ({ ...r, pct: Math.min(100, Math.round((r.horas / totalHorasJanela) * 100)) }))
      .sort((a, b) => b.pct - a.pct)
  }, [salas, equipamentos, concluidas])

  const pendentesCount = todasReservas.filter((r) => r.status === 'pendente').length

  if (loading) return <p className="mx-auto max-w-6xl px-4 py-10 font-mono text-sm text-(--color-ink-soft)">carregando métricas…</p>

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-(--color-cyan)">painel administrativo</p>
      <h1 className="mb-8 font-display text-3xl font-bold">Dashboard &amp; métricas</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Reservas concluídas" value={concluidas.length} />
        <StatCard label="Solicitações pendentes" value={pendentesCount} accent="amber" />
        <StatCard label="Salas cadastradas" value={salas.length} />
        <StatCard label="Equipamentos cadastrados" value={equipamentos.length} />
      </div>

      <div className="mb-8 card p-5">
        <h2 className="mb-1 text-lg font-semibold">Reservas concluídas por semana</h2>
        <p className="mb-4 text-sm text-(--color-ink-soft)">Últimas 8 semanas</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porSemana}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE7E6" />
              <XAxis dataKey="semana" tick={{ fontSize: 12, fontFamily: 'IBM Plex Mono' }} stroke="#48586B" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fontFamily: 'IBM Plex Mono' }} stroke="#48586B" />
              <Tooltip contentStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="total" fill="#0E7C86" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-1 text-lg font-semibold">Taxa de ocupação por recurso</h2>
        <p className="mb-4 text-sm text-(--color-ink-soft)">Baseado em reservas confirmadas nos últimos 15 dias</p>
        {ocupacaoPorRecurso.length === 0 ? (
          <p className="text-sm text-(--color-ink-soft)">Sem dados suficientes ainda.</p>
        ) : (
          <div className="space-y-3">
            {ocupacaoPorRecurso.map((r) => (
              <div key={`${r.tipo}-${r.nome}`}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{r.nome} <span className="font-mono text-xs text-(--color-ink-soft)">· {r.tipo}</span></span>
                  <span className="font-mono text-(--color-ink-soft)">{r.pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-paper)">
                  <div className="h-full rounded-full bg-(--color-cyan)" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: 'amber' }) {
  return (
    <div className="reg-mark card p-4">
      <p className={`font-display text-3xl font-bold ${accent === 'amber' ? 'text-(--color-amber)' : 'text-(--color-cyan)'}`}>{value}</p>
      <p className="mt-1 font-mono text-xs uppercase tracking-wide text-(--color-ink-soft)">{label}</p>
    </div>
  )
}
