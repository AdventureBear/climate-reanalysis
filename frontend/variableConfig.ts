export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string }

export const PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10] as const

type VariableLevelConfig = {
  value: string
  label: string
  apiVariable: string
  apiLevel: string
  levelKind?: 'pressure' | 'surface' | 'column' | 'layer' | 'toa'
  pressureMb?: number
}

type VariableConfig = {
  label: string
  levels: readonly VariableLevelConfig[]
}

function pressureLevels(apiVariable: string): VariableLevelConfig[] {
  return PRESSURE_LEVELS.map(level => ({
    value: String(level),
    label: String(level),
    apiVariable,
    apiLevel: String(level),
    levelKind: 'pressure',
    pressureMb: level,
  }))
}

// CORe publishes VVEL on 100–1000 mb only — mirrors config.py VARIABLES["omega"]["levels"].
const OMEGA_PRESSURE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100] as const

const VARIABLE_CONFIG = {
  wind_speed: {
    label: 'Wind Speed',
    levels: [
      { value: 'surface_10m', label: 'Surface (10m)', apiVariable: 'wind_10m', apiLevel: '1000', levelKind: 'surface' },
      ...pressureLevels('wind_speed'),
    ],
  },
  temp: {
    label: 'Temperature',
    levels: [
      { value: 'surface_2m', label: 'Surface (2m)', apiVariable: 'temp_2m', apiLevel: '1000', levelKind: 'surface' },
      ...pressureLevels('temp'),
    ],
  },
  pressure: {
    label: 'Mean Sea Level Pressure',
    levels: [
      { value: 'surface_mslp', label: 'Surface (MSLP)', apiVariable: 'surface_pressure', apiLevel: '1000', levelKind: 'surface' },
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
      { value: 'total_column', label: 'Total column', apiVariable: 'precipitable_water', apiLevel: '1000', levelKind: 'column' },
    ],
  },
  omega: {
    label: 'Omega (Vertical Velocity)',
    levels: OMEGA_PRESSURE_LEVELS.map(level => ({
      value: String(level),
      label: String(level),
      apiVariable: 'omega',
      apiLevel: String(level),
      levelKind: 'pressure',
      pressureMb: level,
    })),
  },
  precip_rate: {
    label: 'Precipitation Rate',
    levels: [
      { value: 'surface_prate', label: 'Surface', apiVariable: 'precip_rate', apiLevel: '1000', levelKind: 'surface' },
    ],
  },
  olr: {
    label: 'Outgoing Longwave Radiation',
    levels: [
      { value: 'toa_olr', label: 'Top of atmosphere', apiVariable: 'olr', apiLevel: '1000', levelKind: 'toa' },
    ],
  },
  cape: {
    label: 'CAPE',
    levels: [
      { value: 'surface_cape', label: 'Surface-based', apiVariable: 'cape', apiLevel: '1000', levelKind: 'surface' },
      { value: 'ml_cape', label: 'Mixed-layer (180-0 mb)', apiVariable: 'cape_ml', apiLevel: '1000', levelKind: 'layer' },
      { value: 'mu_cape', label: 'Most-unstable (255-0 mb)', apiVariable: 'cape_mu', apiLevel: '1000', levelKind: 'layer' },
    ],
  },
  cin: {
    label: 'CIN',
    levels: [
      { value: 'surface_cin', label: 'Surface-based', apiVariable: 'cin', apiLevel: '1000', levelKind: 'surface' },
      { value: 'ml_cin', label: 'Mixed-layer (180-0 mb)', apiVariable: 'cin_ml', apiLevel: '1000', levelKind: 'layer' },
      { value: 'mu_cin', label: 'Most-unstable (255-0 mb)', apiVariable: 'cin_mu', apiLevel: '1000', levelKind: 'layer' },
    ],
  },
  dewpoint_2m: {
    label: '2m Dewpoint',
    levels: [
      { value: 'surface_2m_dpt', label: 'Surface (2m)', apiVariable: 'dewpoint_2m', apiLevel: '1000', levelKind: 'surface' },
    ],
  },
  absv: {
    label: 'Absolute Vorticity',
    levels: pressureLevels('absv'),
  },
  snow_depth: {
    label: 'Snow Depth',
    levels: [
      { value: 'surface_snod', label: 'Surface', apiVariable: 'snow_depth', apiLevel: '1000', levelKind: 'surface' },
    ],
  },
} as const satisfies Record<string, VariableConfig>

export type UiVariableKey = keyof typeof VARIABLE_CONFIG

const BUILDER_VARIABLE_GROUPS = {
  multi: 'Multi-level variables',
  single: 'Surface / single-level variables',
} as const

const BUILDER_VARIABLE_OPTIONS: SelectOption[] = Object.entries(VARIABLE_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
  group: config.levels.some(level => level.levelKind === 'pressure')
    ? BUILDER_VARIABLE_GROUPS.multi
    : BUILDER_VARIABLE_GROUPS.single,
}))

export const VARIABLES: SelectOption[] = [
  ...BUILDER_VARIABLE_OPTIONS.filter(option => option.group === BUILDER_VARIABLE_GROUPS.multi),
  ...BUILDER_VARIABLE_OPTIONS.filter(option => option.group === BUILDER_VARIABLE_GROUPS.single),
]

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
  { value: 'cape', label: 'CAPE (Surface-Based)' },
  { value: 'cape_ml', label: 'CAPE (Mixed-Layer)' },
  { value: 'cape_mu', label: 'CAPE (Most-Unstable)' },
  { value: 'cin', label: 'CIN (Surface-Based)' },
  { value: 'cin_ml', label: 'CIN (Mixed-Layer)' },
  { value: 'cin_mu', label: 'CIN (Most-Unstable)' },
  { value: 'dewpoint_2m', label: '2m Dewpoint' },
  { value: 'absv', label: 'Absolute Vorticity' },
  { value: 'snow_depth', label: 'Snow Depth' },
]

export const SURFACE_LEVELS = new Set([
  'surface_10m', 'surface_2m', 'surface_mslp', 'total_column', 'surface_prate', 'toa_olr',
  'surface_cape', 'ml_cape', 'mu_cape', 'surface_cin', 'ml_cin', 'mu_cin',
  'surface_2m_dpt', 'surface_snod',
])
// Surface/named-level API variables whose monthly obs composites are NOT
// wired (MSLP has a monthly archive record and is exempt). Mirrors the
// backend gate keyed on monthly_grib_name in config.py.
export const MONTHLY_UNAVAILABLE_API_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'precipitable_water', 'precip_rate', 'olr',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu', 'dewpoint_2m', 'snow_depth',
])
// Surface/named-level API variables: wind overlays use 10m winds.
export const FLX_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water', 'precip_rate', 'olr',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu', 'dewpoint_2m', 'snow_depth',
])
export const COLOR_LAB_SINGLE_LEVEL_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water', 'precip_rate', 'olr',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu', 'dewpoint_2m', 'snow_depth',
])

// API variables with no wired climatology baseline — raw display mode only.
// Mirrors backend config.py VARIABLES[*].climo_sources (served at GET / as
// variable_modes); update both together when a baseline is wired.
// (humidity: no daily R2 shum file; cape/cin/dewpoint/absv/snow_depth: no
// R2 source, or derivation deferred — see config.py comments.)
export const RAW_ONLY_API_VARIABLES = new Set([
  'humidity', 'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu',
  'dewpoint_2m', 'absv', 'snow_depth',
])

const API_TO_UI_SELECTION = new Map<string, { variable: string; level: string }>()
for (const [variable, config] of Object.entries(VARIABLE_CONFIG)) {
  for (const level of config.levels) {
    API_TO_UI_SELECTION.set(`${level.apiVariable}:${level.apiLevel}`, { variable, level: level.value })
    API_TO_UI_SELECTION.set(level.apiVariable, { variable, level: level.value })
  }
}

export function levelOptionsForVariable(variable: string): SelectOption[] {
  return levelConfigsForVariable(variable).map(({ value, label }) => ({
    value,
    label,
  }))
}

function levelConfigsForVariable(variable: string): VariableLevelConfig[] {
  return [...(VARIABLE_CONFIG[variable as UiVariableKey]?.levels ?? pressureLevels(variable))]
}

function defaultPressureLevel(options: VariableLevelConfig[]): string {
  return (
    options.find(option => option.value === '850') ??
    options.find(option => option.levelKind === 'pressure') ??
    options[0]
  )?.value ?? '850'
}

export function levelForVariableChange(nextVariable: string, currentLevel: string): string {
  const options = levelConfigsForVariable(nextVariable)
  const exact = options.find(option => option.value === currentLevel)
  if (exact) return exact.value

  const currentPressure = Number(currentLevel)
  if (Number.isFinite(currentPressure)) {
    const pressureOptions = options.filter(option => option.levelKind === 'pressure' && typeof option.pressureMb === 'number')
    const closest = pressureOptions.reduce<VariableLevelConfig | null>((best, option) => {
      if (!best) return option
      return Math.abs(option.pressureMb! - currentPressure) < Math.abs(best.pressureMb! - currentPressure)
        ? option
        : best
    }, null)
    return closest?.value ?? options[0]?.value ?? '850'
  }

  return (
    options.find(option => option.levelKind && option.levelKind !== 'pressure') ??
    { value: defaultPressureLevel(options) }
  )?.value ?? '850'
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
