import { useEffect, useMemo, useState } from 'react'

export interface Ocupacao {
  inicio: string | Date
  fim: string | Date
  status: string
  mine?: boolean
  quantidade?: number
  motivo?: string
}

interface Props {
  date: Date
  ocupacoes: Ocupacao[]
  startHour?: number
  endHour?: number
  totalEstoque?: number
  isEquipamento?: boolean
  onConfirmSelection?: (inicio: Date, fim: Date) => void
  disabled?: boolean
}

function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

function sameSlot(date: Date, hour: number) {
  const d = new Date(date)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function AvailabilityGrid({
  date,
  ocupacoes,
  startHour = 7,
  endHour = 21,
  totalEstoque = 1,
  isEquipamento = false,
  onConfirmSelection,
  disabled,
}: Props) {
  const [selected, setSelected] = useState<number[]>([])
  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = startHour; h <= endHour; h++) arr.push(h)
    return arr
  }, [startHour, endHour])

  const now = new Date()

  useEffect(() => {
    setSelected([])
  }, [date, ocupacoes])

  function statusOfHour(hour: number): {
    kind: 'passado' | 'livre' | 'pendente' | 'aprovada' | 'esgotado' | 'manutencao'
    mine?: boolean
    qtdEmUso: number
    motivo?: string
  } {
    const slotStart = sameSlot(date, hour)
    const slotEnd = sameSlot(date, hour + 1)

    const manutencao = ocupacoes.find((o) => {
      if (o.status.toLowerCase() !== 'manutencao') return false
      const oStart = o.inicio instanceof Date ? o.inicio : new Date(o.inicio)
      const oEnd = o.fim instanceof Date ? o.fim : new Date(o.fim)
      return slotStart.getTime() < oEnd.getTime() && slotEnd.getTime() > oStart.getTime()
    })

    if (manutencao) {
      return { kind: 'manutencao', qtdEmUso: 0, motivo: manutencao.motivo }
    }

    if (slotStart.getTime() < now.getTime()) return { kind: 'passado', qtdEmUso: 0 }

    let qtdEmUso = 0
    let temMinhaOcupacao = false
    let statusPredominante = 'livre'

    for (const o of ocupacoes) {
      const oStart = o.inicio instanceof Date ? o.inicio : new Date(o.inicio)
      const oEnd = o.fim instanceof Date ? o.fim : new Date(o.fim)

      if (slotStart.getTime() < oEnd.getTime() && slotEnd.getTime() > oStart.getTime()) {
        const st = o.status.toLowerCase()
        if (st === 'pendente' || st === 'aprovada' || st === 'confirmada') {
          qtdEmUso += o.quantidade ? Number(o.quantidade) : 1
          if (o.mine) temMinhaOcupacao = true
          if (st === 'aprovada' || st === 'confirmada') statusPredominante = 'aprovada'
          else if (statusPredominante !== 'aprovada') statusPredominante = 'pendente'
        }
      }
    }

    // 1. Para SALAS (não equipamento): qualquer ocupação bloqueia o slot com o status da reserva
    if (!isEquipamento && qtdEmUso > 0) {
      return {
        kind: statusPredominante as 'pendente' | 'aprovada',
        mine: temMinhaOcupacao,
        qtdEmUso,
      }
    }

    // 2. Para EQUIPAMENTOS: se atingiu ou ultrapassou a capacidade total do estoque
    if (isEquipamento && qtdEmUso >= totalEstoque) {
      return { kind: 'esgotado', mine: temMinhaOcupacao, qtdEmUso }
    }

    // 3. Para EQUIPAMENTOS com estoque restante: o slot permanece LIVRE e Clicável
    return { kind: 'livre', mine: temMinhaOcupacao, qtdEmUso }
  }

  function toggleHour(hour: number) {
    if (disabled || !onConfirmSelection) return
    const st = statusOfHour(hour)
    if (st.kind !== 'livre') return

    setSelected((prev) => {
      if (prev.includes(hour)) return prev.filter((h) => h !== hour)
      const next = [...prev, hour].sort((a, b) => a - b)
      const idx = next.indexOf(hour)
      let lo = idx
      while (lo > 0 && next[lo - 1] === next[lo] - 1) lo--
      let hi = idx
      while (hi < next.length - 1 && next[hi + 1] === next[hi] + 1) hi++
      return next.slice(lo, hi + 1)
    })
  }

  const min = selected.length ? Math.min(...selected) : null
  const max = selected.length ? Math.max(...selected) : null

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-(--color-ink-soft)">
          grade de disponibilidade · {date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-(--color-ink-soft)">
          <Legend color="bg-white border border-dashed border-(--color-cyan)" label="livre" />
          <Legend color="bg-(--color-amber)" label="pendente" />
          <Legend color="bg-(--color-cyan)" label="aprovada" />
          <Legend color="bg-(--color-amber-soft) border border-(--color-amber)" label="manutenção" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {hours.map((h) => {
          const st = statusOfHour(h)
          const isSelected = selected.includes(h)
          const podeSelecionar = !!onConfirmSelection && !disabled && st.kind === 'livre'

          let cls =
            'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition-colors select-none'
          if (st.kind === 'passado') {
            cls += ' border-transparent bg-black/[0.03] text-(--color-ink-soft)/50 cursor-not-allowed'
          } else if (st.kind === 'manutencao') {
            cls += ' border-(--color-amber) bg-(--color-amber-soft) text-(--color-amber) cursor-not-allowed'
          } else if (st.kind === 'esgotado') {
            cls += ' border-(--color-coral)/30 bg-(--color-coral-soft) text-(--color-coral) cursor-not-allowed'
          } else if (st.kind === 'aprovada') {
            cls += ' border-(--color-cyan) bg-(--color-cyan) text-white cursor-not-allowed'
          } else if (st.kind === 'pendente') {
            cls += ' border-(--color-amber) bg-(--color-amber) text-white cursor-not-allowed'
          } else if (isSelected) {
            cls += ' border-(--color-cyan) bg-(--color-cyan-soft) text-(--color-cyan) ring-2 ring-(--color-cyan)/40 cursor-pointer'
          } else {
            const temUsoParcial = isEquipamento && st.qtdEmUso > 0
            cls += ` border-dashed border-(--color-cyan)/50 text-(--color-ink) ${
              temUsoParcial ? 'bg-(--color-amber-soft)/20' : ''
            } ${podeSelecionar ? 'hover:bg-(--color-cyan-soft)/60 cursor-pointer' : 'cursor-default'}`
          }

          return (
            <button
              type="button"
              key={h}
              disabled={!podeSelecionar}
              onClick={() => toggleHour(h)}
              className={cls}
            >
              <span>{hourLabel(h)} – {hourLabel(h + 1)}</span>
              <span className="text-[11px] opacity-80">
                {st.kind === 'passado' && 'indisponível'}
                {st.kind === 'manutencao' && `em manutenção · ${st.motivo}`}
                {st.kind === 'esgotado' && 'esgotado'}
                {st.kind === 'aprovada' && (st.mine ? 'sua reserva' : 'ocupado')}
                {st.kind === 'pendente' && (st.mine ? 'sua solicitação' : 'em análise')}
                {st.kind === 'livre' && (
                  isSelected
                    ? 'selecionado'
                    : isEquipamento && st.qtdEmUso > 0
                    ? `⚠️ ${st.qtdEmUso}/${totalEstoque} em uso`
                    : ''
                )}
              </span>
            </button>
          )
        })}
      </div>

      {selected.length > 0 && min !== null && max !== null && onConfirmSelection && (
        <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl bg-(--color-cyan-soft) p-3 sm:flex-row sm:items-center">
          <p className="text-sm font-semibold text-(--color-cyan)">
            selecionado: {hourLabel(min)} → {hourLabel(max + 1)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected([])}
              className="rounded-xl border border-(--color-border) bg-white px-3 py-1.5 text-xs font-medium text-(--color-ink-soft) hover:bg-black/5"
            >
              limpar
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmSelection(sameSlot(date, min), sameSlot(date, max + 1))
                setSelected([])
              }}
              className="rounded-xl bg-(--color-cyan) px-4 py-1.5 text-xs font-semibold text-white hover:bg-(--color-cyan-bright)"
            >
              solicitar reserva →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}
