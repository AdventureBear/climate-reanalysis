// Overlays card: the wind controls, H/L centers, and contour overlays. On a
// wind-variable map the wind controls style the map's own wind; the map mode
// picks the glyph quantity (raw → actual wind, anomaly → anomaly wind, #47).
//
// Compact overlay controls. Wind's detailed layer options live in a small
// modal so this card stays scan-friendly across desktop, tablet, and mobile.
import { Settings, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { AUTO_DENSITY, WIND_DENSITIES } from '../../../mapRecipe'
import { Label, Section, Switch } from '../../../ui/controls'
import {
  WIND_MASTER_NOTICE,
  WindLayerGuardNotice,
  useWindLayerGuardNotice,
} from './windLayers/guardNotice'
import { WindLayerDetailControls } from './windLayers/WindLayerDetailControls'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function OverlaysPanel({ recipe }: { recipe: CompositeRecipeState }) {
  const {
    setWindMaster,
    hlCenters, setHlCenters,
    contourOverlays, setContourOverlays,
    apiVariable,
    isWindVariable, isWindControlActive, isBlankMap,
  } = recipe
  const { notice, showNotice } = useWindLayerGuardNotice()
  const [windSettingsOpen, setWindSettingsOpen] = useState(false)
  const step = Number(recipe.windStep)
  const densityOptions = WIND_DENSITIES.includes(step) || recipe.windStep === AUTO_DENSITY
    ? WIND_DENSITIES
    : [...WIND_DENSITIES, step].sort((a, b) => a - b)

  const overlayRows = [
    {
      key: 'wind',
      label: 'Wind',
      checked: isBlankMap ? false : isWindControlActive,
      disabled: isBlankMap,
      onChange: () => {
        if (isBlankMap) return
        if (isWindVariable) {
          showNotice(WIND_MASTER_NOTICE)
          return
        }
        setWindMaster(o => !o)
      },
      extra: (
        <button
          type="button"
          onClick={() => setWindSettingsOpen(true)}
          disabled={isBlankMap}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            isBlankMap
              ? 'cursor-not-allowed text-slate-700'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
          aria-label="Wind overlay settings"
          title="Wind overlay settings"
        >
          <Settings size={14} />
        </button>
      ),
    },
    {
      key: 'centers',
      label: 'H/L Centers',
      checked: isBlankMap ? false : hlCenters,
      disabled: isBlankMap,
      onChange: () => {
        if (!isBlankMap) setHlCenters(o => !o)
      },
    },
    // When the map's own variable draws a layer, its toggle shows ON and
    // explains itself on click — never off-and-grayed, which reads as
    // "this layer is missing" (same pattern as the Wind row above).
    {
      key: 'pressure',
      label: 'Pressure',
      checked: !isBlankMap && (apiVariable === 'surface_pressure' || contourOverlays.includes('pressure')),
      disabled: isBlankMap,
      onChange: () => {
        if (isBlankMap) return
        if (apiVariable === 'surface_pressure') {
          showNotice('This map already draws isobars — they are the map itself and cannot be turned off.')
          return
        }
        setContourOverlays(prev =>
          prev.includes('pressure') ? prev.filter(c => c !== 'pressure') : [...prev, 'pressure'])
      },
    },
    {
      key: 'height',
      label: 'Height',
      checked: !isBlankMap && (apiVariable === 'height' || contourOverlays.includes('height')),
      disabled: isBlankMap,
      onChange: () => {
        if (isBlankMap) return
        if (apiVariable === 'height') {
          showNotice('This map already draws height contours — they are the map itself and cannot be turned off.')
          return
        }
        setContourOverlays(prev =>
          prev.includes('height') ? prev.filter(c => c !== 'height') : [...prev, 'height'])
      },
    },
    {
      key: 'temp',
      label: 'Temp',
      checked: !isBlankMap && (apiVariable === 'temp' || apiVariable === 'temp_2m' || contourOverlays.includes('temp')),
      disabled: isBlankMap,
      onChange: () => {
        if (isBlankMap) return
        if (apiVariable === 'temp' || apiVariable === 'temp_2m') {
          showNotice('This map already shades temperature — it is the map itself and cannot be turned off.')
          return
        }
        setContourOverlays(prev =>
          prev.includes('temp') ? prev.filter(c => c !== 'temp') : [...prev, 'temp'])
      },
    },
  ] as const

  return (
          <Section>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-sky-400" />
              <Label>Overlays</Label>
            </div>
            <div className="relative grid grid-cols-2 gap-x-3 gap-y-1.5">
              <WindLayerGuardNotice notice={notice} />
              {overlayRows.map(row => (
                <div key={row.key} className="grid min-h-6 grid-cols-[minmax(4.75rem,1fr)_1.75rem_1.75rem] items-center gap-1.5">
                  <span className={`truncate text-xs font-semibold ${row.disabled ? 'text-slate-600' : 'text-slate-300'}`}>{row.label}</span>
                  <Switch checked={row.checked} disabled={row.disabled} onChange={row.onChange} label={row.label} />
                  <div className="flex min-w-0 items-center justify-start">
                    {'extra' in row ? row.extra : null}
                  </div>
                </div>
              ))}
            </div>

            {windSettingsOpen && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" onClick={() => setWindSettingsOpen(false)}>
                <div
                  className="w-[min(440px,92vw)] rounded-xl border border-slate-600 bg-slate-950 p-4 shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={15} className="text-sky-400" />
                      <Label>Wind</Label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWindSettingsOpen(false)}
                      className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white"
                      aria-label="Close wind settings"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <WindLayerDetailControls recipe={recipe} densityOptions={densityOptions} />
                </div>
              </div>
            )}
          </Section>
  )
}
