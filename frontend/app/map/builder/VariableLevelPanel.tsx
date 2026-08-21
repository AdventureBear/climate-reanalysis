// Variable & Level card, including per-variable display controls (units,
// shaded/contoured fill, humidity type) driven by the variable registry.
import type { FillMode, PrecipWindow, WindUnit } from '../../../mapRecipe'
import {
  SURFACE_LEVELS,
  VARIABLES,
  apiVariableForSelection,
  levelForVariableChange,
  shouldDefaultWindOverlay,
} from '../../../variableConfig'
import { CardRow, Section, SelectField, TabStrip, VariableDisplayControl } from '../../../ui/controls'
import type { CompositeRecipeState, TemperatureUnit } from './useCompositeRecipe'
import { WaterUnitToggle } from './WaterUnitToggle'

export function VariableLevelPanel({ recipe }: { recipe: CompositeRecipeState }) {
  const {
    variable, setVariable,
    humidityType, setHumidityType,
    level, setLevel,
    levelOptions,
    windUnit, setWindUnit,
    pwatUnit, setPwatUnit,
    precipUnit, setPrecipUnit,
    precipWindowSelection, setPrecipWindow,
    temperatureUnit, setTemperatureUnit,
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
                    if (shouldDefaultWindOverlay(apiVariableForSelection(nextVariable, nextLevel, humidityType))) {
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
                  if (shouldDefaultWindOverlay(apiVariableForSelection(variable, nextLevel, humidityType))) {
                    setWindOn(true)
                    setWindType('barbs')
                  }
                }}
                className="input w-full min-w-0"
                wrapperClassName="flex min-w-0 flex-col gap-1"
              />

            </div>
            </CardRow>
            {(variable === 'wind_speed' || variable === 'temp' || variable === 'pressure' || variable === 'height' || variable === 'humidity' || variable === 'precipitable_water' || variable === 'precip_rate' || variable === 'precip_total') && (
            <CardRow>
                {variable === 'wind_speed' && (
                  <VariableDisplayControl label="Wind Units">
                    <TabStrip
                      options={[
                        { value: 'kt', label: 'Knots' },
                        { value: 'm/s', label: 'm/s' },
                      ]}
                      value={windUnit}
                      onChange={v => setWindUnit(v as WindUnit)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'temp' && (
                  <VariableDisplayControl label="Temperature Units">
                    <TabStrip
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'F', label: '°F' },
                        { value: 'C', label: '°C' },
                      ]}
                      value={temperatureUnit}
                      onChange={v => setTemperatureUnit(v as TemperatureUnit)}
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
                {variable === 'precipitable_water' && (
                  <WaterUnitToggle label="PWAT Units" value={pwatUnit} onChange={setPwatUnit} />
                )}
                {(variable === 'precip_rate' || variable === 'precip_total') && (
                  <WaterUnitToggle label="Precip Units" value={precipUnit} onChange={setPrecipUnit} />
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
