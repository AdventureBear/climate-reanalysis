// Shared "About this link" dialog: dimmed backdrop, info icon, dismiss X,
// action row. Used for link explanations (legacy slice hours, baseline
// substitution) — informational, never blocking the render underneath.
import { Info, X } from 'lucide-react'
import type { ReactNode } from 'react'

export function InfoModal({ title, onDismiss, actions, children }: {
  title: string
  onDismiss: () => void
  actions: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px]" onClick={onDismiss} />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="info-modal-title"
          className="pointer-events-auto w-[min(94vw,42rem)] rounded-xl border border-slate-700/60 bg-slate-900 text-white shadow-[0_20px_70px_rgba(0,0,0,0.58)] ring-1 ring-white/5"
        >
          <div className="flex items-start justify-between gap-5 rounded-t-xl bg-sky-950/35 px-8 py-6 sm:px-11 sm:py-7">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex shrink-0 items-center justify-center text-amber-400">
                <Info size={32} />
              </span>
              <span id="info-modal-title" className="text-base font-semibold text-slate-50">
                {title}
              </span>
            </div>
            <button type="button" onClick={onDismiss} aria-label="Dismiss"
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="px-8 pb-2 pt-8 sm:px-11 sm:pt-9">{children}</div>
          <div className="flex justify-end gap-3 px-8 pb-8 pt-6 sm:px-11 sm:pb-10">{actions}</div>
        </div>
      </div>
    </>
  )
}
