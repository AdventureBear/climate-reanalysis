// Variable & Level card, including per-variable display controls (units,
// shaded/contoured fill, humidity type) driven by the variable registry.
import type { FillMode, PwatUnit, WindUnit } from '../mapRecipe'
import {
  SURFACE_LEVELS,
  VARIABLES,
  apiVariableForSelection,
  levelOptionsForVariable,
  shouldDefaultWindOverlay,
} from '../variableConfig'
import { CardRow, Section, SelectField, TabStrip, VariableDisplayControl } from '../ui/controls'
import type { CompositeRecipeState, TemperatureUnit } from './useCompositeRecipe'

export function VariableLevelPanel({ recipe }: { recipe: CompositeRecipeState }) {
  const {
    variable, setVariable,
    level, setLevel,
    levelOptions,
    windUnit, setWindUnit,
    pwatUnit, setPwatUnit,
    temperatureUnit, setTemperatureUnit,
    fillMode, setFillMode,
    setWindOn, setWindType, setWindAnomalyOverlay,
  } = recipe

  return (
          <Section>
            <CardRow>
            <div className="flex gap-2 items-end">
              <SelectField
                label="Variable"
                value={variable === 'humidity' ? 'rel_humidity' : variable}
                options={VARIABLES}
                onChange={nextVariable => {
                    setVariable(nextVariable)
                    const nextLevel = levelOptionsForVariable(nextVariable)[0]?.value ?? '850'
                    setLevel(nextLevel)
                    if (shouldDefaultWindOverlay(apiVariableForSelection(nextVariable, nextLevel))) {
                      setWindOn(true)
                      setWindType('barbs')
                      setWindAnomalyOverlay('none')
                    }
                }}
                wrapperClassName="flex flex-col gap-1 flex-1 min-w-0"
              />
              <SelectField
                label={levelOptions.every(opt => SURFACE_LEVELS.has(opt.value)) ? 'Level' : 'Level (mb)'}
                value={level}
                options={levelOptions}
                onChange={nextLevel => {
                  setLevel(nextLevel)
                  if (shouldDefaultWindOverlay(apiVariableForSelection(variable, nextLevel))) {
                    setWindOn(true)
                    setWindType('barbs')
                    setWindAnomalyOverlay('none')
                  }
                }}
                className="input"
                wrapperClassName="flex flex-col gap-1 shrink-0"
              />

            </div>
            </CardRow>
            {(variable === 'wind_speed' || variable === 'temp' || variable === 'pressure' || variable === 'height' || variable === 'rel_humidity' || variable === 'humidity' || variable === 'precipitable_water') && (
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
                  <VariableDisplayControl label="PWAT Units">
                    <TabStrip
                      options={[
                        { value: 'mm', label: 'mm' },
                        { value: 'in', label: 'inches' },
                      ]}
                      value={pwatUnit}
                      onChange={v => setPwatUnit(v as PwatUnit)}
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
                {(variable === 'rel_humidity' || variable === 'humidity') && (
                  <VariableDisplayControl label="Humidity Type">
                    <TabStrip
                      options={[
                        { value: 'rel_humidity', label: 'Relative' },
                        { value: 'humidity', label: 'Specific' },
                      ]}
                      value={variable}
                      onChange={setVariable}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
              </CardRow>
            )}
          </Section>
  )
}
