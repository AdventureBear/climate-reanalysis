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
  group?: 'multi' | 'single'
}

export type HumidityType = 'relative' | 'specific'
export type RadiationWaveband = 'shortwave' | 'longwave'
export type RadiationDirection = 'down' | 'up'

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
  humidity: {
    label: 'Humidity',
    levels: [
      { value: 'surface_2m_rh', label: 'Surface (2m)', apiVariable: 'rel_humidity_2m', apiLevel: '1000', levelKind: 'surface' },
      ...pressureLevels('rel_humidity'),
    ],
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
  precip_total: {
    label: 'Precipitation Total',
    levels: [
      { value: 'surface_ptotal', label: 'Surface', apiVariable: 'precip_total', apiLevel: '1000', levelKind: 'surface' },
    ],
  },
  cloud_cover: {
    label: 'Cloud Cover',
    group: 'multi',
    levels: [
      { value: 'atmos_col_cloud', label: 'Total column', apiVariable: 'cloud_cover_total', apiLevel: '1000', levelKind: 'column' },
      { value: 'low_cloud', label: 'Low cloud layer', apiVariable: 'cloud_cover_low', apiLevel: '1000', levelKind: 'layer' },
      { value: 'middle_cloud', label: 'Middle cloud layer', apiVariable: 'cloud_cover_middle', apiLevel: '1000', levelKind: 'layer' },
      { value: 'high_cloud', label: 'High cloud layer', apiVariable: 'cloud_cover_high', apiLevel: '1000', levelKind: 'layer' },
      { value: 'boundary_cloud', label: 'Boundary layer cloud', apiVariable: 'cloud_cover_boundary', apiLevel: '1000', levelKind: 'layer' },
      { value: 'convective_cloud', label: 'Convective cloud', apiVariable: 'cloud_cover_convective', apiLevel: '1000', levelKind: 'layer' },
    ],
  },
  radiation: {
    label: 'Radiation',
    group: 'multi',
    levels: [
      { value: 'surface_radiation', label: 'Surface', apiVariable: 'radiation_sw_down_surface', apiLevel: '1000', levelKind: 'surface' },
      { value: 'toa_radiation', label: 'Top of atmosphere', apiVariable: 'radiation_sw_down_toa', apiLevel: '1000', levelKind: 'toa' },
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

const BUILDER_VARIABLE_OPTIONS: SelectOption[] = Object.entries(VARIABLE_CONFIG).map(([value, config]) => {
  const explicitGroup = 'group' in config ? config.group : undefined
  const group = explicitGroup
    ? BUILDER_VARIABLE_GROUPS[explicitGroup]
    : config.levels.some(level => level.levelKind === 'pressure')
      ? BUILDER_VARIABLE_GROUPS.multi
      : BUILDER_VARIABLE_GROUPS.single
  return {
    value,
    label: config.label,
    group,
  }
})

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
  { value: 'rel_humidity_2m', label: '2m Relative Humidity' },
  { value: 'humidity', label: 'Specific Humidity' },
  { value: 'precipitable_water', label: 'Precipitable Water' },
  { value: 'omega', label: 'Omega (Vertical Velocity)' },
  { value: 'precip_rate', label: 'Precipitation Rate' },
  { value: 'precip_total', label: 'Precipitation Total' },
  { value: 'cloud_cover_total', label: 'Total Cloud Cover' },
  { value: 'cloud_cover_low', label: 'Low Cloud Cover' },
  { value: 'cloud_cover_middle', label: 'Middle Cloud Cover' },
  { value: 'cloud_cover_high', label: 'High Cloud Cover' },
  { value: 'cloud_cover_boundary', label: 'Boundary-Layer Cloud Cover' },
  { value: 'cloud_cover_convective', label: 'Convective Cloud Cover' },
  { value: 'radiation_sw_down_surface', label: 'Surface Downward Shortwave Radiation' },
  { value: 'radiation_sw_up_surface', label: 'Surface Upward Shortwave Radiation' },
  { value: 'radiation_lw_down_surface', label: 'Surface Downward Longwave Radiation' },
  { value: 'radiation_lw_up_surface', label: 'Surface Upward Longwave Radiation' },
  { value: 'radiation_sw_down_toa', label: 'TOA Downward Shortwave Radiation' },
  { value: 'radiation_sw_up_toa', label: 'TOA Upward Shortwave Radiation' },
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
  'surface_10m', 'surface_2m', 'surface_mslp', 'total_column', 'surface_prate', 'surface_ptotal',
  'atmos_col_cloud', 'low_cloud', 'middle_cloud', 'high_cloud', 'boundary_cloud', 'convective_cloud',
  'surface_radiation', 'toa_radiation',
  'surface_cape', 'ml_cape', 'mu_cape', 'surface_cin', 'ml_cin', 'mu_cin',
  'surface_2m_dpt', 'surface_2m_rh', 'surface_snod',
])
// Surface/named-level API variables whose monthly obs composites are NOT
// wired (MSLP has a monthly archive record and is exempt). Mirrors the
// backend gate keyed on monthly_grib_name in config.py.
export const MONTHLY_UNAVAILABLE_API_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'precipitable_water', 'precip_rate', 'precip_total',
  'cloud_cover_total', 'cloud_cover_low', 'cloud_cover_middle', 'cloud_cover_high', 'cloud_cover_boundary', 'cloud_cover_convective', 'olr',
  'radiation_sw_down_surface', 'radiation_sw_up_surface', 'radiation_lw_down_surface', 'radiation_lw_up_surface',
  'radiation_sw_down_toa', 'radiation_sw_up_toa',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu', 'dewpoint_2m', 'rel_humidity_2m', 'snow_depth',
])
// Surface/named-level API variables: wind overlays use 10m winds.
export const FLX_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water', 'precip_rate', 'precip_total',
  'cloud_cover_total', 'cloud_cover_low', 'cloud_cover_middle', 'cloud_cover_high', 'cloud_cover_boundary', 'cloud_cover_convective', 'olr',
  'radiation_sw_down_surface', 'radiation_sw_up_surface', 'radiation_lw_down_surface', 'radiation_lw_up_surface',
  'radiation_sw_down_toa', 'radiation_sw_up_toa',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu', 'dewpoint_2m', 'rel_humidity_2m', 'snow_depth',
])
export const COLOR_LAB_SINGLE_LEVEL_VARIABLES = new Set([
  'temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water', 'precip_rate', 'precip_total',
  'cloud_cover_total', 'cloud_cover_low', 'cloud_cover_middle', 'cloud_cover_high', 'cloud_cover_boundary', 'cloud_cover_convective', 'olr',
  'radiation_sw_down_surface', 'radiation_sw_up_surface', 'radiation_lw_down_surface', 'radiation_lw_up_surface',
  'radiation_sw_down_toa', 'radiation_sw_up_toa',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu', 'dewpoint_2m', 'rel_humidity_2m', 'snow_depth',
])

// API variables with no wired climatology baseline — raw display mode only.
// Mirrors backend config.py VARIABLES[*].climo_sources (served at GET / as
// variable_modes); update both together when a baseline is wired.
// (humidity: no daily R2 shum file; rel_humidity: derived baseline deferred;
// precip_rate/precip_total: precip anomaly product design deferred;
// cloud_cover_*: TCDC baseline/product design deferred;
// radiation_*: radiation flux baseline/product design deferred; olr remains
// climatology-capable because it was wired before the grouped Radiation UI.
// cape/cin/dewpoint/absv/snow_depth: no R2 source, or derivation deferred —
// see config.py comments.)
export const RAW_ONLY_API_VARIABLES = new Set([
  'humidity', 'rel_humidity', 'precip_rate', 'precip_total',
  'cloud_cover_total', 'cloud_cover_low', 'cloud_cover_middle', 'cloud_cover_high', 'cloud_cover_boundary', 'cloud_cover_convective',
  'radiation_sw_down_surface', 'radiation_sw_up_surface', 'radiation_lw_down_surface', 'radiation_lw_up_surface',
  'radiation_sw_down_toa', 'radiation_sw_up_toa',
  'cape', 'cape_ml', 'cape_mu', 'cin', 'cin_ml', 'cin_mu',
  'dewpoint_2m', 'rel_humidity_2m', 'absv', 'snow_depth',
])

const RADIATION_API_VARIABLES: Record<string, string> = {
  'surface_radiation:shortwave:down': 'radiation_sw_down_surface',
  'surface_radiation:shortwave:up': 'radiation_sw_up_surface',
  'surface_radiation:longwave:down': 'radiation_lw_down_surface',
  'surface_radiation:longwave:up': 'radiation_lw_up_surface',
  'toa_radiation:shortwave:down': 'radiation_sw_down_toa',
  'toa_radiation:shortwave:up': 'radiation_sw_up_toa',
  'toa_radiation:longwave:up': 'olr',
}

const CLOUD_COVER_URL_LEVELS: Record<string, string> = {
  atmos_col_cloud: 'total_column',
  low_cloud: 'low',
  middle_cloud: 'middle',
  high_cloud: 'high',
  boundary_cloud: 'boundary',
  convective_cloud: 'convective',
}

const URL_CLOUD_COVER_LEVELS: Record<string, string> = {
  total: 'atmos_col_cloud',
  total_column: 'atmos_col_cloud',
  column: 'atmos_col_cloud',
  atmos_col: 'atmos_col_cloud',
  low: 'low_cloud',
  middle: 'middle_cloud',
  mid: 'middle_cloud',
  high: 'high_cloud',
  boundary: 'boundary_cloud',
  boundary_layer: 'boundary_cloud',
  convective: 'convective_cloud',
}

const RADIATION_URL_LEVELS: Record<string, string> = {
  surface_radiation: 'surface',
  toa_radiation: 'toa',
}

const URL_RADIATION_LEVELS: Record<string, string> = {
  surface: 'surface_radiation',
  sfc: 'surface_radiation',
  toa: 'toa_radiation',
  top_of_atmosphere: 'toa_radiation',
}

type UiSelection = {
  variable: string
  level: string
  radiationWaveband?: RadiationWaveband
  radiationDirection?: RadiationDirection
}

const API_TO_UI_SELECTION = new Map<string, UiSelection>()
for (const [variable, config] of Object.entries(VARIABLE_CONFIG)) {
  for (const level of config.levels) {
    API_TO_UI_SELECTION.set(`${level.apiVariable}:${level.apiLevel}`, { variable, level: level.value })
    API_TO_UI_SELECTION.set(level.apiVariable, { variable, level: level.value })
  }
}
for (const [key, apiVariable] of Object.entries(RADIATION_API_VARIABLES)) {
  const [level, waveband, direction] = key.split(':') as [string, RadiationWaveband, RadiationDirection]
  API_TO_UI_SELECTION.set(apiVariable, {
    variable: 'radiation',
    level,
    radiationWaveband: waveband,
    radiationDirection: direction,
  })
}

function normalizeUrlToken(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function urlRadiationWaveband(value: string | undefined | null): RadiationWaveband {
  const key = normalizeUrlToken(value)
  return key === 'longwave' || key === 'lw' ? 'longwave' : 'shortwave'
}

function urlRadiationDirection(value: string | undefined | null): RadiationDirection | undefined {
  const key = normalizeUrlToken(value)
  if (key === 'up' || key === 'upward' || key === 'outgoing' || key === 'out') return 'up'
  if (key === 'down' || key === 'downward' || key === 'incoming' || key === 'in') return 'down'
  return undefined
}

export function radiationDirectionForSelection(
  level: string,
  radiationWaveband: RadiationWaveband = 'shortwave',
  radiationDirection: RadiationDirection = 'down',
): RadiationDirection {
  return level === 'toa_radiation' && radiationWaveband === 'longwave' ? 'up' : radiationDirection
}

export function urlVariableForSelection(
  variable: string,
  level: string,
  humidityType: HumidityType = 'relative',
  radiationWaveband: RadiationWaveband = 'shortwave',
  radiationDirection: RadiationDirection = 'down',
): string {
  if (variable === 'cloud_cover') return 'cloud_cover'
  if (variable === 'radiation') return 'radiation'
  return apiVariableForSelection(variable, level, humidityType, radiationWaveband, radiationDirection)
}

export function urlLevelForSelection(variable: string, level: string): string {
  if (variable === 'cloud_cover') return CLOUD_COVER_URL_LEVELS[level] ?? 'total_column'
  if (variable === 'radiation') return RADIATION_URL_LEVELS[level] ?? 'surface'
  return apiLevelForSelection(variable, level)
}

export function uiSelectionForUrlVariable(
  apiVariable: string,
  apiLevel: string,
  waveband?: string | null,
  direction?: string | null,
): UiSelection {
  if (apiVariable === 'cloud_cover') {
    const level = URL_CLOUD_COVER_LEVELS[normalizeUrlToken(apiLevel)] ?? 'atmos_col_cloud'
    return { variable: 'cloud_cover', level }
  }
  if (apiVariable === 'radiation') {
    const level = URL_RADIATION_LEVELS[normalizeUrlToken(apiLevel)] ?? 'surface_radiation'
    const radiationWaveband = urlRadiationWaveband(waveband)
    const parsedDirection = urlRadiationDirection(direction)
    return {
      variable: 'radiation',
      level,
      radiationWaveband,
      radiationDirection: radiationDirectionForSelection(level, radiationWaveband, parsedDirection ?? 'down'),
    }
  }
  return uiSelectionForApiVariable(apiVariable, apiLevel)
}

export function levelOptionsForVariable(variable: string, humidityType: HumidityType = 'relative'): SelectOption[] {
  return levelConfigsForVariable(variable, humidityType).map(({ value, label }) => ({
    value,
    label,
  }))
}

function levelConfigsForVariable(variable: string, humidityType: HumidityType = 'relative'): VariableLevelConfig[] {
  const levels = [...(VARIABLE_CONFIG[variable as UiVariableKey]?.levels ?? pressureLevels(variable))]
  if (variable === 'humidity' && humidityType === 'specific') {
    return levels.filter(option => option.levelKind === 'pressure')
  }
  return levels
}

function defaultPressureLevel(options: VariableLevelConfig[]): string {
  return (
    options.find(option => option.value === '850') ??
    options.find(option => option.levelKind === 'pressure') ??
    options[0]
  )?.value ?? '850'
}

export function levelForVariableChange(nextVariable: string, currentLevel: string, humidityType: HumidityType = 'relative'): string {
  const options = levelConfigsForVariable(nextVariable, humidityType)
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

export function apiVariableForSelection(
  variable: string,
  level: string,
  humidityType: HumidityType = 'relative',
  radiationWaveband: RadiationWaveband = 'shortwave',
  radiationDirection: RadiationDirection = 'down',
): string {
  if (variable === 'humidity') {
    const levelConfig = VARIABLE_CONFIG.humidity.levels.find(option => option.value === level)
    return humidityType === 'specific' ? 'humidity' : levelConfig?.apiVariable ?? 'rel_humidity'
  }
  if (variable === 'radiation') {
    const safeDirection = radiationDirectionForSelection(level, radiationWaveband, radiationDirection)
    return RADIATION_API_VARIABLES[`${level}:${radiationWaveband}:${safeDirection}`] ?? 'radiation_sw_down_surface'
  }
  if (variable === 'olr') return 'olr'
  return VARIABLE_CONFIG[variable as UiVariableKey]?.levels.find(option => option.value === level)?.apiVariable ?? variable
}

export function apiLevelForSelection(variable: string, level: string): string {
  return VARIABLE_CONFIG[variable as UiVariableKey]?.levels.find(option => option.value === level)?.apiLevel ?? level
}

export function uiSelectionForApiVariable(apiVariable: string, apiLevel: string): UiSelection {
  if (apiVariable === 'rel_humidity' || apiVariable === 'humidity') {
    return { variable: 'humidity', level: apiLevel }
  }
  return API_TO_UI_SELECTION.get(`${apiVariable}:${apiLevel}`) ?? API_TO_UI_SELECTION.get(apiVariable) ?? {
    variable: apiVariable,
    level: apiLevel,
  }
}

export function shouldDefaultWindOverlay(apiVariable: string): boolean {
  return apiVariable === 'wind_speed' || apiVariable === 'wind_10m' || apiVariable === 'temp_2m' || apiVariable === 'surface_pressure'
}
