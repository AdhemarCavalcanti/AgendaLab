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
    <div className="fixed inset-0 z-50 grid place-items-center bg-(--color-ink)/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`reg-mark w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-lg border border-(--color-border) bg-(--color-surface) p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-(--color-ink-soft) hover:text-(--color-ink)" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
