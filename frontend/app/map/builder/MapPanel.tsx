// Rendered-map display: error banner, loading state, or the streamed PNG —
// with Save and Share actions attached to the artifact itself (#38 Option A:
// you act on the map you just made, not on distant chrome).
import { useEffect, useState } from 'react'
import { Check, Link as LinkIcon, Save, TriangleAlert, X } from 'lucide-react'

function MapActions({ onSave, saving }: { onSave?: () => void; saving: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mb-3 flex items-center justify-center gap-2">
      {onSave && (
        <button type="button" onClick={onSave} disabled={saving}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-600 bg-slate-800 px-3 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors">
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      )}
      <button type="button" onClick={() => void copyShareLink()}
        className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-600 bg-slate-800 px-3 text-xs text-slate-200 hover:bg-slate-700 transition-colors">
        {copied ? <Check size={14} /> : <LinkIcon size={14} />} {copied ? 'Link copied' : 'Share link'}
      </button>
    </div>
  )
}

/** Dismissible explanation of something the builder changed on the user's
 *  behalf, e.g. a link asking for a mode that map cannot produce (#72). */
function Notice({ text, onDismiss }: { text: React.ReactNode; onDismiss: () => void }) {
  return (
    <div role="status"
      className="mb-3 flex w-full max-w-xl items-start gap-3 rounded border border-amber-600 bg-amber-950/60 px-4 py-3 text-sm text-amber-100">
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss"
        className="shrink-0 cursor-pointer rounded border border-amber-500 px-2 py-0.5 font-medium hover:bg-amber-900">
        Got it
      </button>
    </div>
  )
}

function ErrorModal({
  message,
  retry,
  onDismiss,
}: {
  message: string
  retry?: { label: string; question?: string; onClick: () => void } | null
  onDismiss: () => void
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  function retryQuestion(label: string, question?: string) {
    if (question) return question
    if (label.startsWith('Generate through ')) {
      return `Generate the map through ${label.replace('Generate through ', '')} instead?`
    }
    if (label.startsWith('Generate without ')) {
      return `Generate the map without ${label.replace('Generate without ', '')}?`
    }
    if (label.startsWith('Generate ') && label.endsWith(' only')) {
      return `${label}?`
    }
    return 'Generate an adjusted map using the available data?'
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[2px]" onClick={onDismiss} />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="map-error-title"
          className="pointer-events-auto w-[min(94vw,42rem)] rounded-xl border border-slate-700/60 bg-slate-900 text-white shadow-[0_20px_70px_rgba(0,0,0,0.58)] ring-1 ring-white/5"
        >
          <div className="flex items-start justify-between gap-5 rounded-t-xl bg-sky-950/35 px-8 py-6 sm:px-11 sm:py-7">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex shrink-0 items-center justify-center text-red-500">
                <TriangleAlert size={32} />
              </span>
              <span id="map-error-title" className="text-base font-semibold text-slate-50">
                Map unavailable
              </span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-8 pb-8 pt-8 sm:px-11 sm:pb-9 sm:pt-9">
            <p className="text-sm leading-7 text-white">{message}</p>
            {retry && (
              <div className="mt-8 flex flex-col items-start gap-3">
                <p className="text-sm leading-6 text-slate-100">{retryQuestion(retry.label, retry.question)}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 px-8 pb-8 sm:px-11 sm:pb-10">
            {retry && (
              <button
                type="button"
                onClick={retry.onClick}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-700/65 px-5 text-sm font-medium text-white transition-colors hover:bg-sky-600/75"
              >
                Generate
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function MapPanel({ mapSrc, error, loading, isVertical, onSave, saving = false, retry = null, notice = null, onDismissNotice, onDismissError }: {
  mapSrc: string | null
  error: string | null
  loading: boolean
  isVertical: boolean
  onSave?: () => void
  saving?: boolean
  // One-click informed retry when a composite has missing data (#95).
  retry?: { label: string; question?: string; onClick: () => void } | null
  // Dismissible note when the builder changed the request (#72).
  notice?: React.ReactNode
  onDismissNotice?: () => void
  onDismissError?: () => void
}) {
  const noticeEl = notice && onDismissNotice
    ? <Notice text={notice} onDismiss={onDismissNotice} />
    : null
  const errorModal = error && onDismissError
    ? <ErrorModal message={error} retry={retry} onDismiss={onDismissError} />
    : null
  return (
    <>
        {errorModal}
        {isVertical ? (
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {(mapSrc || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex flex-col items-center justify-center w-full h-full">
                {noticeEl}
                {loading && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && (
                  <>
                    <MapActions onSave={onSave} saving={saving} />
                    <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map"
                      className="max-w-full max-h-full rounded shadow-xl object-contain" />
                  </>
                )}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">Select parameters and click Generate Map.</p>
            )}
          </div>
        ) : (
          <>
            {(mapSrc || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex flex-col items-center justify-center min-h-48">
                {noticeEl}
                {loading && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && (
                  <>
                    <MapActions onSave={onSave} saving={saving} />
                    <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map" className="max-w-full xl:max-w-[75%] rounded shadow-xl" />
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-16">
                <p className="text-slate-600 text-sm">Select parameters above and click Generate Map.</p>
              </div>
            )}
          </>
        )}
    </>
  )
}
