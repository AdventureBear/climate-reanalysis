// Settings drawer: layout mode, unit preferences, and anomaly baseline notes.
import { X } from 'lucide-react'
import type { PrecipUnit, TempUnit, WindUnit } from '../../mapRecipe'

export function SettingsDrawer({
  isVertical,
  setLayoutMode,
  windUnit,
  onWindUnit,
  surfaceTemperatureUnit,
  onSurfaceTemperatureUnit,
  elevatedTemperatureUnit,
  onElevatedTemperatureUnit,
  precipitationUnit,
  onPrecipitationUnit,
  onClose,
}: {
  isVertical: boolean
  setLayoutMode: (mode: 'horizontal' | 'vertical') => void
  windUnit: WindUnit
  onWindUnit: (unit: WindUnit) => void
  surfaceTemperatureUnit: TempUnit
  onSurfaceTemperatureUnit: (unit: TempUnit) => void
  elevatedTemperatureUnit: TempUnit
  onElevatedTemperatureUnit: (unit: TempUnit) => void
  precipitationUnit: PrecipUnit
  onPrecipitationUnit: (unit: PrecipUnit) => void
  onClose: () => void
}) {
  const selectClassName = 'input h-8 w-32 shrink-0 text-sm font-semibold'
  return (
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
            <div className="flex items-center justify-between gap-4 border-t border-slate-700/60 py-3">
              <div className="text-sm font-semibold text-slate-100">Layout</div>
              <select
                value={isVertical ? 'vertical' : 'horizontal'}
                onChange={e => setLayoutMode(e.target.value as 'horizontal' | 'vertical')}
                className={selectClassName}
              >
                <option value="horizontal">Grid</option>
                <option value="vertical">Side-by-side</option>
              </select>
            </div>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Units</h3>
            <div className="border-t border-slate-700/60 pt-2">
              <div className="flex items-center justify-between gap-4 py-2">
                <div className="text-sm font-semibold text-slate-100">Wind</div>
                <select
                  value={windUnit}
                  onChange={e => onWindUnit(e.target.value as WindUnit)}
                  className={selectClassName}
                >
                  <option value="kt">Knots</option>
                  <option value="m/s">m/s</option>
                  <option value="mph" disabled>mph</option>
                </select>
              </div>
              <div className="py-2">
                <div className="text-sm font-semibold text-slate-100">Temperature</div>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4 pl-4">
                    <div className="text-sm text-slate-300">Surface</div>
                    <select
                      value={surfaceTemperatureUnit}
                      onChange={e => onSurfaceTemperatureUnit(e.target.value as TempUnit)}
                      className={selectClassName}
                    >
                      <option value="F">F</option>
                      <option value="C">C</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-4 pl-4">
                    <div className="text-sm text-slate-300">Elevated</div>
                    <select
                      value={elevatedTemperatureUnit}
                      onChange={e => onElevatedTemperatureUnit(e.target.value as TempUnit)}
                      className={selectClassName}
                    >
                      <option value="C">C</option>
                      <option value="F">F</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <div className="text-sm font-semibold text-slate-100">Precipitation</div>
                <select
                  value={precipitationUnit}
                  onChange={e => onPrecipitationUnit(e.target.value as PrecipUnit)}
                  className={selectClassName}
                >
                  <option value="in">Inches</option>
                  <option value="mm">mm</option>
                </select>
              </div>
            </div>
          </section>
          <section>
            <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Anomalies</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              The 1991&ndash;2020 baseline is chosen automatically to match each map&rsquo;s
              time scale: R2 monthly normals for monthly maps, R2 daily normals for daily
              maps, and R1 per-hour normals for single 3-hourly times. The map title always
              names the source actually used.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
