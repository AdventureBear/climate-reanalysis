// Wind layers, button-strip layout (#45 variant "buttons").
//
// The three layers are toggle buttons on one row, the glyph style appears on
// its own row when glyphs are on, and the two spacing dropdowns share a row
// underneath. Keeps the app's existing ToggleButton vocabulary; costs more
// width per control and moves one row as glyphs turn on and off.
import { Label, ToggleButton } from '../../../../ui/controls'
import { AUTO_DENSITY, ISOTACH_INTERVALS, type IsotachInterval } from '../../../../mapRecipe'
import type { WindLayerProps } from './types'

export function WindLayerButtons({ recipe, densityOptions }: WindLayerProps) {
  const {
    windMaster, setWindMaster,
    windOn, setWindOn,
    windStep, setWindStep,
    windType, setWindType,
    windShading, setWindShading,
    isotachsOn, setIsotachsOn,
    isotachInterval, setIsotachInterval,
    isWindVariable, displayMode,
    isLastWindLayer,
  } = recipe

  return (
    <div className="flex flex-col gap-1 pt-2 border-t border-slate-700/40">
      <div className="flex items-center gap-2">
        <Label>Wind</Label>
        <button type="button" role="switch" aria-checked={windMaster}
          onClick={() => setWindMaster(o => !o)}
          className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors cursor-pointer ${windMaster ? 'bg-sky-600' : 'bg-slate-600'}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${windMaster ? 'translate-x-3' : 'translate-x-0'}`} />
        </button>
      </div>
      <div className={`flex flex-col gap-1 transition-opacity ${windMaster ? '' : 'opacity-30 pointer-events-none'}`}>
        <div className="grid grid-cols-3 gap-1">
          <ToggleButton
            active={isWindVariable && windShading}
            disabled={!isWindVariable || displayMode !== 'raw'}
            onClick={() => {
              if (isLastWindLayer('shading')) return
              setWindShading(o => !o)
            }}
          >
            Shading
          </ToggleButton>
          <ToggleButton
            active={windOn}
            onClick={() => {
              if (isLastWindLayer('glyphs')) return
              setWindOn(o => !o)
            }}
          >
            Glyphs
          </ToggleButton>
          {/* Isotachs contour the raw wind field, so they are not offered on
              anomaly maps: those show anomaly quantities only (#45). */}
          <ToggleButton
            active={isotachsOn && displayMode === 'raw'}
            disabled={displayMode !== 'raw'}
            onClick={() => {
              if (isLastWindLayer('isotachs')) return
              setIsotachsOn(o => !o)
            }}
          >
            Isotachs
          </ToggleButton>
        </div>

        {windOn && (
          <div className="grid grid-cols-2 gap-1">
            {(['barbs', 'vectors'] as const).map(t => (
              <ToggleButton key={t} active={windType === t} onClick={() => setWindType(t)}>
                {t === 'barbs' ? 'Barbs' : 'Vectors'}
              </ToggleButton>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* Glyph spacing. Auto uses the calibrated default, which the backend
              rescales per region so one number means one on-page spacing
              everywhere (#45). */}
          <div className={`flex items-center gap-1.5 min-w-0 ${windOn ? '' : 'opacity-40'}`}>
            <Label>Density</Label>
            <select
              value={windStep}
              disabled={!windOn}
              onChange={e => setWindStep(e.target.value)}
              className="input flex-1 min-w-0 px-1"
            >
              <option value={AUTO_DENSITY}>Auto</option>
              {densityOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {/* Contour spacing. Auto comes from the level's wind scale range:
              5 kt at the surface, 20 kt at jet level. */}
          <div className={`flex items-center gap-1.5 min-w-0 ${isotachsOn && displayMode === 'raw' ? '' : 'opacity-40'}`}>
            <Label>Interval</Label>
            <select
              value={isotachInterval}
              disabled={!(isotachsOn && displayMode === 'raw')}
              onChange={e => setIsotachInterval(Number(e.target.value) as IsotachInterval | 0)}
              className="input flex-1 min-w-0 px-1"
            >
              <option value={0}>Auto</option>
              {ISOTACH_INTERVALS.map(kt => <option key={kt} value={kt}>{kt} kt</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
