// Rendered-map display: error banner, loading state, or the streamed PNG —
// with Save and Share actions attached to the artifact itself (#38 Option A:
// you act on the map you just made, not on distant chrome).
import { useState } from 'react'
import { Check, Link as LinkIcon, Save } from 'lucide-react'

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
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
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

export function MapPanel({ mapSrc, error, loading, isVertical, onSave, saving = false, retry = null, notice = null, onDismissNotice }: {
  mapSrc: string | null
  error: string | null
  loading: boolean
  isVertical: boolean
  onSave?: () => void
  saving?: boolean
  // One-click informed retry when a composite has missing data (#95).
  retry?: { label: string; onClick: () => void } | null
  // Dismissible note when the builder changed the request (#72).
  notice?: string | null
  onDismissNotice?: () => void
}) {
  const noticeEl = notice && onDismissNotice
    ? <Notice text={notice} onDismiss={onDismissNotice} />
    : null
  return (
    <>
        {isVertical ? (
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {(mapSrc || error || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex flex-col items-center justify-center w-full h-full">
                {noticeEl}
                {error && (
                  <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
                    {error}
                    {retry && (
                      <button type="button" onClick={retry.onClick}
                        className="mt-3 block w-full cursor-pointer rounded border border-red-500 bg-red-900/60 px-3 py-1.5 font-medium text-red-100 hover:bg-red-900">
                        {retry.label}
                      </button>
                    )}
                  </div>
                )}
                {loading && !error && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && !error && (
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
            {(mapSrc || error || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex flex-col items-center justify-center min-h-48">
                {noticeEl}
                {error && (
                  <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
                    {error}
                    {retry && (
                      <button type="button" onClick={retry.onClick}
                        className="mt-3 block w-full cursor-pointer rounded border border-red-500 bg-red-900/60 px-3 py-1.5 font-medium text-red-100 hover:bg-red-900">
                        {retry.label}
                      </button>
                    )}
                  </div>
                )}
                {loading && !error && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && !error && (
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
