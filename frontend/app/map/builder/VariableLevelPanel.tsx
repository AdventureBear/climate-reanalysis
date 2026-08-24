// Variable & Level card, including per-variable display controls
// (shaded/contoured fill, humidity type) driven by the variable registry.
import type { FillMode, PrecipWindow } from '../../../mapRecipe'
import {
  SURFACE_LEVELS,
  VARIABLES,
  apiVariableForSelection,
  levelForVariableChange,
  shouldDefaultWindOverlay,
  type RadiationDirection,
  type RadiationWaveband,
  type VorticityType,
} from '../../../variableConfig'
import { CardRow, Section, SelectField, TabStrip, VariableDisplayControl } from '../../../ui/controls'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function VariableLevelPanel({ recipe }: { recipe: CompositeRecipeState }) {
  const {
    variable, setVariable,
    humidityType, setHumidityType,
    vorticityType, setVorticityType,
    radiationWaveband, setRadiationWaveband,
    radiationDirection, setRadiationDirection,
    level, setLevel,
    levelOptions,
    precipWindowSelection, setPrecipWindow,
    fillMode, setFillMode,
    setWindOn, setWindType,
  } = recipe

  return (
          <Section className="w-full">
            <CardRow>
            <div className="grid w-full grid-cols-[minmax(0,1fr)_8rem] items-end gap-2">
              <SelectField
                label="Variable"
                value={variable}
                options={VARIABLES}
                onChange={nextVariable => {
                    setVariable(nextVariable)
                    const nextLevel = levelForVariableChange(nextVariable, level, humidityType)
                    setLevel(nextLevel)
                    if (shouldDefaultWindOverlay(apiVariableForSelection(nextVariable, nextLevel, humidityType, radiationWaveband, radiationDirection, vorticityType))) {
                      setWindOn(true)
                      setWindType('barbs')
                    }
                }}
                className="input w-full min-w-0"
                wrapperClassName="flex min-w-0 flex-col gap-1"
              />
              <SelectField
                label={levelOptions.every(opt => SURFACE_LEVELS.has(opt.value)) ? 'Level' : 'Level (mb)'}
                value={level}
                options={levelOptions}
                onChange={nextLevel => {
                  setLevel(nextLevel)
                  if (shouldDefaultWindOverlay(apiVariableForSelection(variable, nextLevel, humidityType, radiationWaveband, radiationDirection, vorticityType))) {
                    setWindOn(true)
                    setWindType('barbs')
                  }
                }}
                className="input w-full min-w-0"
                wrapperClassName="flex min-w-0 flex-col gap-1"
              />

            </div>
            </CardRow>
            {(variable === 'pressure' || variable === 'height' || variable === 'humidity' || variable === 'vorticity' || variable === 'precip_total' || variable === 'radiation') && (
            <CardRow>
                {variable === 'vorticity' && (
                  <VariableDisplayControl label="Vorticity Type">
                    <TabStrip
                      options={[
                        { value: 'relative', label: 'Relative' },
                        { value: 'absolute', label: 'Absolute' },
                      ]}
                      value={vorticityType}
                      onChange={v => setVorticityType(v as VorticityType)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'pressure' && (
                  <VariableDisplayControl label="Pressure Display">
                    <TabStrip
                      options={[
                        { value: 'contours', label: 'Contoured' },
                        { value: 'shaded', label: 'Shaded' },
                      ]}
                      value={fillMode}
                      onChange={v => setFillMode(v as FillMode)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'precip_total' && (
                  <VariableDisplayControl label="Accumulation">
                    <TabStrip
                      options={[
                        { value: '3', label: '3 hr' },
                        { value: '6', label: '6 hr' },
                        { value: '12', label: '12 hr' },
                        { value: '24', label: '24 hr' },
                      ]}
                      value={precipWindowSelection}
                      onChange={v => setPrecipWindow(v as PrecipWindow)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'radiation' && (
                  <>
                    <VariableDisplayControl label="Waveband">
                      <TabStrip
                        options={[
                          { value: 'shortwave', label: 'Shortwave' },
                          { value: 'longwave', label: 'Longwave' },
                        ]}
                        value={radiationWaveband}
                        onChange={v => setRadiationWaveband(v as RadiationWaveband)}
                        fullWidth
                      />
                    </VariableDisplayControl>
                    <VariableDisplayControl label="Direction">
                      <TabStrip
                        options={[
                          { value: 'down', label: 'Down', disabled: level === 'toa_radiation' && radiationWaveband === 'longwave' },
                          { value: 'up', label: 'Up' },
                        ]}
                        value={radiationDirection}
                        onChange={v => setRadiationDirection(v as RadiationDirection)}
                        fullWidth
                      />
                    </VariableDisplayControl>
                  </>
                )}
                {variable === 'height' && (
                  <VariableDisplayControl label="Height Display">
                    <TabStrip
                      options={[
                        { value: 'contours', label: 'Contoured' },
                        { value: 'shaded', label: 'Shaded' },
                      ]}
                      value={fillMode}
                      onChange={v => setFillMode(v as FillMode)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'humidity' && (
                  <VariableDisplayControl label="Humidity Type">
                    <TabStrip
                      options={[
                        { value: 'relative', label: 'Relative' },
                        { value: 'specific', label: 'Specific', disabled: level === 'surface_2m_rh' },
                      ]}
                      value={humidityType}
                      onChange={v => setHumidityType(v as typeof humidityType)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
              </CardRow>
            )}
          </Section>
  )
}
