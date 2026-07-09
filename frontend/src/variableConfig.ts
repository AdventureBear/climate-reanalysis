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

// CORe publishes VVEL on 100–1000 mb only — mirrors config.py VARIABLES["omega"]["levels"].
const OMEGA_PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100] as const

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
  omega: {
    label: 'Omega (Vertical Velocity)',
    levels: OMEGA_PRESSURE_LEVELS.map(level => ({
      value: String(level),
      label: String(level),
      apiVariable: 'omega',
      apiLevel: String(level),
    })),
  },
  precip_rate: {
    label: 'Precipitation Rate',
    levels: [
      { value: 'surface_prate', label: 'Surface', apiVariable: 'precip_rate', apiLevel: '1000' },
    ],
  },
  olr: {
    label: 'Outgoing Longwave Radiation',
    levels: [
      { value: 'toa_olr', label: 'Top of atmosphere', apiVariable: 'olr', apiLevel: '1000' },
    ],
  },
  cape: {
    label: 'CAPE',
    levels: [
      { value: 'surface_cape', label: 'Surface-based', apiVariable: 'cape', apiLevel: '1000' },
    ],
  },
  cin: {
    label: 'CIN',
    levels: [
      { value: 'surface_cin', label: 'Surface-based', apiVariable: 'cin', apiLevel: '1000' },
    ],
  },
  dewpoint_2m: {
    label: '2m Dewpoint',
    levels: [
      { value: 'surface_2m_dpt', label: 'Surface (2m)', apiVariable: 'dewpoint_2m', apiLevel: '1000' },
    ],
  },
  absv: {
    label: 'Absolute Vorticity',
    levels: pressureLevels('absv'),
  },
  snow_depth: {
    label: 'Snow Depth',
    levels: [
      { value: 'surface_snod', label: 'Surface', apiVariable: 'snow_depth', apiLevel: '1000' },
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
  { value: 'omega', label: 'Omega (Vertical Velocity)' },
  { value: 'precip_rate', label: 'Precipitation Rate' },
  { value: 'olr', label: 'Outgoing Longwave Radiation' },
  { value: 'cape', label: 'CAPE' },
  { value: 'cin', label: 'CIN' },
  { value: 'dewpoint_2m', label: '2m Dewpoint' },
  { value: 'absv', label: 'Absolute Vorticity' },
  { value: 'snow_depth', label: 'Snow Depth' },
]

export const SURFACE_LEVELS = new Set([
  'surface_10m', 'surface_2m', 'surface_mslp', 'total_column', 'surface_prate', 'toa_olr',
  'surface_cape', 'surface_cin', 'surface_2m_dpt', 'surface_snod',
])
// Surface/named-level API variables: no monthly obs composites (backend gate),
// and wind overlays use 10m winds.
export const FLX_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water', 'precip_rate', 'olr',
  'cape', 'cin', 'dewpoint_2m', 'snow_depth',
])
export const COLOR_LAB_SINGLE_LEVEL_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water', 'precip_rate', 'olr',
  'cape', 'cin', 'dewpoint_2m', 'snow_depth',
])

// API variables with no wired climatology baseline — raw display mode only.
// Mirrors backend config.py VARIABLES[*].climo_sources (served at GET / as
// variable_modes); update both together when a baseline is wired.
// (humidity: no daily R2 shum file; cape/cin/dewpoint/absv/snow_depth: no
// R2 source, or derivation deferred — see config.py comments.)
export const RAW_ONLY_API_VARIABLES = new Set(['humidity', 'cape', 'cin', 'dewpoint_2m', 'absv', 'snow_depth'])

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
