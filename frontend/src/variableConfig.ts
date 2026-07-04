export type SelectOption = { value: string; label: string; disabled?: boolean }

export const PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10] as const

type VariableLevelConfig = {
  value: string
  label: string
  apiVariable: string
  apiLevel: string
}

type VariableConfig = {
  label: string
  levels: VariableLevelConfig[]
}

function pressureLevels(apiVariable: string): VariableLevelConfig[] {
  return PRESSURE_LEVELS.map(level => ({
    value: String(level),
    label: String(level),
    apiVariable,
    apiLevel: String(level),
  }))
}

const VARIABLE_CONFIG = {
  wind_speed: {
    label: 'Wind Speed',
    levels: [
      { value: 'surface_10m', label: 'Surface (10m)', apiVariable: 'wind_10m', apiLevel: '1000' },
      ...pressureLevels('wind_speed'),
    ],
  },
  temp: {
    label: 'Temperature',
    levels: [
      { value: 'surface_2m', label: 'Surface (2m)', apiVariable: 'temp_2m', apiLevel: '1000' },
      ...pressureLevels('temp'),
    ],
  },
  pressure: {
    label: 'Mean Sea Level Pressure',
    levels: [
      { value: 'surface_mslp', label: 'Surface (MSLP)', apiVariable: 'surface_pressure', apiLevel: '1000' },
    ],
  },
  height: {
    label: 'Geopotential Height',
    levels: pressureLevels('height'),
  },
  rel_humidity: {
    label: 'Relative Humidity',
    levels: pressureLevels('rel_humidity'),
  },
  humidity: {
    label: 'Specific Humidity',
    levels: pressureLevels('humidity'),
  },
  precipitable_water: {
    label: 'Precipitable Water',
    levels: [
      { value: 'total_column', label: 'Total column', apiVariable: 'precipitable_water', apiLevel: '1000' },
    ],
  },
} as const satisfies Record<string, VariableConfig>

export type UiVariableKey = keyof typeof VARIABLE_CONFIG

export const VARIABLES: SelectOption[] = Object.entries(VARIABLE_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}))

export const COLOR_LAB_VARIABLES: SelectOption[] = [
  { value: 'wind_speed', label: 'Wind Speed' },
  { value: 'wind_10m', label: '10m Wind Speed' },
  { value: 'temp', label: 'Temperature' },
  { value: 'temp_2m', label: '2m Temperature' },
  { value: 'surface_pressure', label: 'Mean Sea Level Pressure' },
  { value: 'height', label: 'Geopotential Height' },
  { value: 'rel_humidity', label: 'Relative Humidity' },
  { value: 'humidity', label: 'Specific Humidity' },
  { value: 'precipitable_water', label: 'Precipitable Water' },
]

export const SURFACE_LEVELS = new Set(['surface_10m', 'surface_2m', 'surface_mslp', 'total_column'])
export const FLX_VARIABLES = new Set(['temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water'])
export const COLOR_LAB_SINGLE_LEVEL_VARIABLES = new Set(['temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water'])

const API_TO_UI_SELECTION = new Map<string, { variable: string; level: string }>()
for (const [variable, config] of Object.entries(VARIABLE_CONFIG)) {
  for (const level of config.levels) {
    API_TO_UI_SELECTION.set(`${level.apiVariable}:${level.apiLevel}`, { variable, level: level.value })
    API_TO_UI_SELECTION.set(level.apiVariable, { variable, level: level.value })
  }
}

export function levelOptionsForVariable(variable: string): SelectOption[] {
  return (VARIABLE_CONFIG[variable as UiVariableKey]?.levels ?? pressureLevels(variable)).map(({ value, label }) => ({
    value,
    label,
  }))
}

export function apiVariableForSelection(variable: string, level: string): string {
  return VARIABLE_CONFIG[variable as UiVariableKey]?.levels.find(option => option.value === level)?.apiVariable ?? variable
}

export function apiLevelForSelection(variable: string, level: string): string {
  return VARIABLE_CONFIG[variable as UiVariableKey]?.levels.find(option => option.value === level)?.apiLevel ?? level
}

export function uiSelectionForApiVariable(apiVariable: string, apiLevel: string): { variable: string; level: string } {
  return API_TO_UI_SELECTION.get(`${apiVariable}:${apiLevel}`) ?? API_TO_UI_SELECTION.get(apiVariable) ?? {
    variable: apiVariable,
    level: apiLevel,
  }
}

export function shouldDefaultWindOverlay(apiVariable: string): boolean {
  return apiVariable === 'wind_speed' || apiVariable === 'wind_10m' || apiVariable === 'temp_2m' || apiVariable === 'surface_pressure'
}
