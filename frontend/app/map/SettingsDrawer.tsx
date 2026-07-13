// Settings drawer: layout mode plus informational notes.
import { LayoutGrid, PanelLeft, X } from 'lucide-react'

export function SettingsDrawer({ isVertical, setLayoutMode, onClose }: {
  isVertical: boolean
  setLayoutMode: (mode: 'horizontal' | 'vertical') => void
  onClose: () => void
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
                <p className="text-xs text-slate-500 leading-relaxed">
                  The climatology baseline is chosen automatically to match the map&rsquo;s
                  temporal resolution. The map title always shows the source actually used.
                </p>
              </section>
            </div>
          </div>
        </>
    </>
  )
}
