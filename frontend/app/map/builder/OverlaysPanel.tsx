// Overlays card: the WIND master switch with its layer buttons and density,
// plus H/L center and contour-overlay toggles.
import { SlidersHorizontal } from 'lucide-react'
import { Label, Section, ToggleButton, VariableDisplayControl } from '../../../ui/controls'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function OverlaysPanel({ recipe }: { recipe: CompositeRecipeState }) {
  const {
    canUseWindAnomalyOverlay, windAnomalyOverlay,
    windMaster, setWindMaster,
    windOn, setWindOn,
    windStep, setWindStep,
    windType, setWindType,
    windShading, setWindShading,
    isotachsOn, setIsotachsOn,
    isWindVariable, displayMode,
    hlCenters, setHlCenters,
    contourOverlays, setContourOverlays,
    apiVariable, setWindAnomalyOverlay,
  } = recipe

  return (
          <Section>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-sky-400" />
              <Label>Overlays</Label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
            {/* WIND master switch gates all wind layers (off = no wind fetches;
                wind-variable maps keep their intrinsic shading). */}
            <div className={`flex flex-col gap-1 pt-2 border-t border-slate-700/40 transition-opacity ${canUseWindAnomalyOverlay && windAnomalyOverlay !== 'none' ? 'opacity-30 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2">
                <Label>Wind</Label>
                <button type="button" role="switch" aria-checked={windMaster}
                  onClick={() => setWindMaster(o => !o)}
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors cursor-pointer ${windMaster ? 'bg-sky-600' : 'bg-slate-600'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${windMaster ? 'translate-x-3' : 'translate-x-0'}`} />
                </button>
                <div className={`ml-auto flex items-center gap-1.5 transition-opacity ${windMaster && windOn ? '' : 'opacity-30 pointer-events-none'}`}>
                  <Label>Density</Label>
                  <input type="number" min={1} max={20} value={windStep}
                    onChange={e => setWindStep(e.target.value)}
                    className="input w-14 text-center px-1" />
                </div>
              </div>
              <div className={`flex flex-col gap-1 transition-opacity ${windMaster ? '' : 'opacity-30 pointer-events-none'}`}>
                <div className="grid grid-cols-3 gap-1">
                  <ToggleButton
                    active={isWindVariable && windShading}
                    disabled={!isWindVariable || displayMode !== 'raw'}
                    onClick={() => {
                      if (windShading && !isotachsOn && !windOn) return
                      setWindShading(o => !o)
                    }}
                  >
                    Shading
                  </ToggleButton>
                  {(['barbs', 'vectors'] as const).map(t => (
                    <ToggleButton
                      key={t}
                      active={windOn && windType === t}
                      onClick={() => {
                        if (windOn && windType === t) {
                          if (isWindVariable && displayMode === 'raw' && !windShading && !isotachsOn) return
                          setWindOn(false)
                          return
                        }
                        setWindOn(true)
                        setWindType(t)
                        setWindAnomalyOverlay('none')
                      }}
                    >
                      {t === 'barbs' ? 'Barbs' : 'Vectors'}
                    </ToggleButton>
                  ))}
                </div>
                <div className="grid grid-cols-1">
                  <ToggleButton
                    active={isotachsOn}
                    onClick={() => {
                      if (isotachsOn && isWindVariable && displayMode === 'raw' && !windShading && !windOn) return
                      setIsotachsOn(o => !o)
                    }}
                  >
                    Isotachs
                  </ToggleButton>
                </div>
              </div>
            </div>
              <VariableDisplayControl label="Contours">
                <div className="grid grid-cols-2 gap-1">
                  <ToggleButton active={hlCenters} onClick={() => setHlCenters(o => !o)}>H/L Centers</ToggleButton>
                  {([
                    { key: 'pressure', label: 'Pressure', redundant: apiVariable === 'surface_pressure' },
                    { key: 'height', label: 'Height', redundant: apiVariable === 'height' },
                    { key: 'temp', label: 'Temp', redundant: apiVariable === 'temp' || apiVariable === 'temp_2m' },
                  ] as const).map(({ key, label, redundant }) => (
                    <ToggleButton
                      key={key}
                      active={contourOverlays.includes(key)}
                      disabled={redundant}
                      onClick={() => setContourOverlays(prev =>
                        prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])}
                    >
                      {label}
                    </ToggleButton>
                  ))}
                </div>
              </VariableDisplayControl>
            </div>
          </Section>
  )
}
