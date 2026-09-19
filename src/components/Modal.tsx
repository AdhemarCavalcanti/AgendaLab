import type { ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  maxWidth = 'max-w-md',
  children,
}: {
  title: string
  onClose: () => void
  maxWidth?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-(--color-ink)/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 shadow-[0_24px_60px_color-mix(in_srgb,#0B1220_22%,transparent)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="font-display text-lg font-bold tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-(--color-ink-soft) transition-colors hover:bg-black/5 hover:text-(--color-ink)"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
