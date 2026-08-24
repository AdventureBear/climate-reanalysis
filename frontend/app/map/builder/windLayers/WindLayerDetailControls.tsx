// Detailed wind-layer controls for the compact Overlays modal.
import { Switch, TabStrip } from '../../../../ui/controls'
import { AUTO_DENSITY, ISOTACH_INTERVALS, type IsotachInterval } from '../../../../mapRecipe'
import {
  LAST_WIND_LAYER_NOTICE,
  WindLayerGuardNotice,
  useWindLayerGuardNotice,
} from './guardNotice'
import type { WindLayerProps } from './types'

export function WindLayerDetailControls({ recipe, densityOptions }: WindLayerProps) {
  const {
    windOn, setWindOn,
    windStep, setWindStep,
    windType, setWindType,
    windShading, setWindShading,
    isotachsOn, setIsotachsOn,
    isotachInterval, setIsotachInterval,
    isWindVariable, isWindControlActive, displayMode,
    isLastWindLayer,
  } = recipe
  const { notice, showNotice } = useWindLayerGuardNotice()

  return (
    <div className={`relative flex flex-col gap-1.5 transition-opacity ${isWindControlActive ? '' : 'opacity-30 pointer-events-none'}`}>
      <WindLayerGuardNotice notice={notice} />

      <div className="flex items-center gap-2">
        <Switch
          checked={isWindVariable && windShading}
          disabled={!isWindVariable || displayMode !== 'raw'}
          label="Wind speed shading"
          onChange={() => {
            if (isLastWindLayer('shading')) {
              showNotice(LAST_WIND_LAYER_NOTICE)
              return
            }
            setWindShading(o => !o)
          }}
        />
        <span className={`text-xs ${isWindVariable && displayMode === 'raw' ? 'text-slate-300' : 'text-slate-600'}`}>
          Shading
        </span>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Switch
          checked={windOn}
          label="Wind glyphs"
          onChange={() => {
            if (isLastWindLayer('glyphs')) {
              showNotice(LAST_WIND_LAYER_NOTICE)
              return
            }
            setWindOn(o => !o)
          }}
        />
        <TabStrip
          options={[{ value: 'barbs', label: 'Barbs' }, { value: 'vectors', label: 'Vectors' }]}
          value={windType}
          disabled={!windOn}
          onChange={v => setWindType(v as typeof windType)}
        />
        <select
          value={windStep}
          disabled={!windOn}
          aria-label="Glyph density"
          onChange={e => setWindStep(e.target.value)}
          className="input ml-auto w-16 min-w-0 px-1 py-1 text-xs disabled:opacity-45"
        >
          <option value={AUTO_DENSITY}>Auto</option>
          {densityOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Switch
          checked={isotachsOn && displayMode === 'raw'}
          disabled={displayMode !== 'raw'}
          label="Isotach contours"
          onChange={() => {
            if (isLastWindLayer('isotachs')) {
              showNotice(LAST_WIND_LAYER_NOTICE)
              return
            }
            setIsotachsOn(o => !o)
          }}
        />
        <span className={`text-xs ${displayMode === 'raw' ? 'text-slate-300' : 'text-slate-600'}`}>
          Isotachs
        </span>
        <select
          value={isotachInterval}
          disabled={!(isotachsOn && displayMode === 'raw')}
          aria-label="Isotach interval"
          onChange={e => setIsotachInterval(Number(e.target.value) as IsotachInterval | 0)}
          className="input ml-auto w-20 min-w-0 px-1 py-1 text-xs disabled:opacity-45"
        >
          <option value={0}>Auto</option>
          {ISOTACH_INTERVALS.map(kt => <option key={kt} value={kt}>{kt} kt</option>)}
        </select>
      </div>
    </div>
  )
}
