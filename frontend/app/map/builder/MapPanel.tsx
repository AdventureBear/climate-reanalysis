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
    <div className="mt-3 flex items-center justify-center gap-2">
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

export function MapPanel({ mapSrc, error, loading, isVertical, onSave, saving = false }: {
  mapSrc: string | null
  error: string | null
  loading: boolean
  isVertical: boolean
  onSave?: () => void
  saving?: boolean
}) {
  return (
    <>
        {isVertical ? (
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {(mapSrc || error || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex flex-col items-center justify-center w-full h-full">
                {error && (
                  <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
                    {error}
                  </div>
                )}
                {loading && !error && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && !error && (
                  <>
                    <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map"
                      className="max-w-full max-h-full rounded shadow-xl object-contain" />
                    <MapActions onSave={onSave} saving={saving} />
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
                {error && (
                  <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
                    {error}
                  </div>
                )}
                {loading && !error && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && !error && (
                  <>
                    <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map" className="max-w-full xl:max-w-[75%] rounded shadow-xl" />
                    <MapActions onSave={onSave} saving={saving} />
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
