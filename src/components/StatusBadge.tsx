const RECURSO_MAP: Record<string, { label: string; cls: string }> = {
  livre: { label: 'Disponível', cls: 'bg-(--color-green-soft) text-(--color-green) border-(--color-green)/30' },
  ocupado: { label: 'Ocupado', cls: 'bg-(--color-amber-soft) text-(--color-amber) border-(--color-amber)/30' },
  manutencao: { label: 'Em manutenção', cls: 'bg-(--color-coral-soft) text-(--color-coral) border-(--color-coral)/30' },
}

const RESERVA_MAP: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-(--color-amber-soft) text-(--color-amber) border-(--color-amber)/30' },
  confirmada: { label: 'Confirmada', cls: 'bg-(--color-green-soft) text-(--color-green) border-(--color-green)/30' },
  rejeitada: { label: 'Rejeitada', cls: 'bg-(--color-coral-soft) text-(--color-coral) border-(--color-coral)/30' },
  cancelada: { label: 'Cancelada', cls: 'bg-black/5 text-(--color-ink-soft) border-black/10' },
}

export function StatusBadge({ status, tipo = 'reserva' }: { status: string; tipo?: 'reserva' | 'recurso' }) {
  const map = tipo === 'reserva' ? RESERVA_MAP : RECURSO_MAP
  const info = map[status] ?? { label: status, cls: 'bg-black/5 text-(--color-ink-soft) border-black/10' }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono font-medium ${info.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {info.label}
    </span>
  )
}
