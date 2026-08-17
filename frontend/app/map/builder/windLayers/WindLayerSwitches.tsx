// Wind layers, switch-row layout (#45 variant "switches").
//
// One row per layer: a switch turns the layer on, and the layer's own setting
// sits at the right of the same row. Every row is always present and disables
// in place, so nothing shifts. The glyph row uses the Barbs/Vectors strip as
// its label instead of a separate word.
import { Label, Switch, TabStrip } from '../../../../ui/controls'
import { AUTO_DENSITY, ISOTACH_INTERVALS, type IsotachInterval } from '../../../../mapRecipe'
import {
  LAST_WIND_LAYER_NOTICE,
  WIND_MASTER_NOTICE,
  WindLayerGuardNotice,
  useWindLayerGuardNotice,
} from './guardNotice'
import type { WindLayerProps } from './types'

export function WindLayerSwitches({ recipe, densityOptions }: WindLayerProps) {
  const {
    setWindMaster,
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
    <div className="flex flex-col gap-1 pt-2 border-t border-slate-700/40">
      <div className="relative flex items-center gap-2">
        <Label>Wind</Label>
        <Switch
          checked={isWindControlActive}
          onChange={() => {
            if (isWindVariable) {
              showNotice(WIND_MASTER_NOTICE)
              return
            }
            setWindMaster(o => !o)
          }}
          label="Wind overlays"
        />
        <WindLayerGuardNotice notice={notice} />
      </div>
      <div className={`flex flex-col gap-1.5 pt-1 transition-opacity ${isWindControlActive ? '' : 'opacity-30 pointer-events-none'}`}>

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
          {/* Glyph spacing. Auto uses the calibrated default, which the backend
              rescales per region so one number means one on-page spacing
              everywhere (#45). */}
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

        {/* Isotachs contour the raw wind field, so they are not offered on
            anomaly maps: those show anomaly quantities only (#45). */}
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
          {/* Contour spacing. Auto comes from the level's wind scale range:
              5 kt at the surface, 20 kt at jet level. */}
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
    </div>
  )
}
