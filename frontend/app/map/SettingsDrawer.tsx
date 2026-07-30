// Settings drawer: layout mode, the climatology baseline preference, and notes.
import { LayoutGrid, PanelLeft, X } from 'lucide-react'

export function SettingsDrawer({ isVertical, setLayoutMode, onClose, preferCoreClimo, onPreferCoreClimo }: {
  isVertical: boolean
  setLayoutMode: (mode: 'horizontal' | 'vertical') => void
  onClose: () => void
  // Prefer CORe's own monthly normals where they exist (#127).
  preferCoreClimo: boolean
  onPreferCoreClimo: (next: boolean) => void
}) {
  return (
    <>
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
          <div className="fixed right-0 top-0 h-full w-84 bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <span className="font-semibold text-sm tracking-wide">Settings</span>
              <button type="button" onClick={onClose}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-7">
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Layout</h3>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => setLayoutMode('horizontal')}
                    className={`flex items-center gap-2.5 rounded border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${!isVertical ? 'border-sky-500 bg-sky-950/40 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    <LayoutGrid size={15} className="shrink-0" />
                    <span>
                      Grid
                      <span className="block text-xs text-slate-400 font-normal">Controls above the map.</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setLayoutMode('vertical')}
                    className={`flex items-center gap-2.5 rounded border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${isVertical ? 'border-sky-500 bg-sky-950/40 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    <PanelLeft size={15} className="shrink-0" />
                    <span>
                      Side-by-side
                      <span className="block text-xs text-slate-400 font-normal">Controls in a column beside the map.</span>
                    </span>
                  </button>
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Anomalies</h3>
                <label className="flex cursor-pointer items-start gap-3">
                  <button type="button" role="switch" aria-checked={preferCoreClimo}
                    onClick={() => onPreferCoreClimo(!preferCoreClimo)}
                    className={`relative mt-0.5 inline-flex h-4 w-7 shrink-0 rounded-full transition-colors cursor-pointer ${preferCoreClimo ? 'bg-sky-600' : 'bg-slate-600'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${preferCoreClimo ? 'translate-x-3' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-sm text-slate-200">
                    Use CORe normals when available
                    <span className="mt-1 block text-xs font-normal leading-relaxed text-slate-400">
                      Compares monthly maps against CORe&rsquo;s own 30-year averages, the same
                      dataset the observations come from. Available for pressure-level variables
                      only. Everything else keeps using R2, because CORe publishes no daily or
                      hourly averages.
                    </span>
                  </span>
                </label>
                <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                  For daily and 3-hourly maps the baseline is chosen automatically to match the
                  map&rsquo;s time scale. The map title always names the source actually used.
                </p>
              </section>
            </div>
          </div>
        </>
    </>
  )
}
