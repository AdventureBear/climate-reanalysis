import { HOURS, normalizeColorStep } from './sharedOptions'
import {
  RAW_ONLY_API_VARIABLES,
  apiVariableForSelection,
  isWindUnitApiVariable,
  radiationDirectionForSelection,
  type HumidityType,
  type RadiationDirection,
  type RadiationWaveband,
  type VorticityType,
  uiSelectionForUrlVariable,
  urlLevelForSelection,
  urlVariableForSelection,
} from './variableConfig'

// Mirror the backend request guards (MAX_COMPOSITE_DATES / MAX_COMPOSITE_MONTHS
// in backend/app/main.py) so users get instant feedback instead of a 422.
export const MAX_COMPOSITE_DATES = 93
export const MAX_COMPOSITE_MONTHS = 60

export type TimeScale = '3-hourly' | 'daily' | 'monthly' | 'climatology'
export type SubMode = 'single' | 'range' | 'list'
export type DisplayMode = 'raw' | 'anomaly' | 'normalized'
export type ClimoSource = 'monthly-pgb' | 'r2-daily' | 'r2-monthly' | 'cfsr-daily'
export type WindUnit = 'kt' | 'm/s'
export type WindOverlayType = 'vectors' | 'barbs' | 'isotachs'
export type WindAnomalyOverlay = 'none' | WindOverlayType
export type PwatUnit = 'mm' | 'in'
export type PrecipUnit = 'mm' | 'in'
export type PrecipWindow = string
export type FillMode = 'contours' | 'shaded'
export type TempUnit = 'F' | 'C'

export type ApiDate = { api: string; iso: string; year: string; month: string; day: string }
export type ApiMonth = { api: string; iso: string; year: string; month: string }

export type TimeRecipe =
  | { scale: 'climatology'; climoMonth: string }
  | { scale: 'monthly'; subMode: 'single'; month: string }
  | { scale: 'monthly'; subMode: 'range'; monthStart: string; monthEnd: string }
  | { scale: 'monthly'; subMode: 'list'; customMonths: string[] }
  | { scale: '3-hourly'; subMode: 'single'; date: string; hour: string }
  | { scale: '3-hourly'; subMode: 'range'; startDate: string; endDate: string; startHour?: string; hour: string }
  | { scale: '3-hourly'; subMode: 'list'; customDates: string[]; hour: string }
  | { scale: 'daily'; subMode: 'single'; date: string; hour?: string }
  | { scale: 'daily'; subMode: 'range'; startDate: string; endDate: string; startHour?: string; hour?: string }
  | { scale: 'daily'; subMode: 'list'; customDates: string[]; hour?: string }

export type MapRecipe = {
  variable?: string
  level?: string
  humidityType?: HumidityType
  vorticityType?: VorticityType
  radiationWaveband?: RadiationWaveband
  radiationDirection?: RadiationDirection
  region?: string
  displayMode?: DisplayMode
  climoSource?: ClimoSource
  time?: TimeRecipe
  wind?: {
    on: boolean
    step: string
    type: WindOverlayType
    // Legacy (pre-#47): saved recipes stored the anomaly glyph choice in a
    // separate field. New recipes never set it — the map mode decides the
    // glyph quantity (raw → actual wind, anomaly → anomaly wind).
    anomalyOverlay?: WindAnomalyOverlay
    isotachs?: boolean
    // Isotach spacing in knots: 5, 10 or 20. Undefined = let the backend
    // derive it from the level's wind scale range (#45).
    isotachInterval?: IsotachInterval
    // Wind-variable maps only: false renders isotachs/glyphs without the
    // shaded speed field (fill_mode=none).
    shading?: boolean
  }
  windUnit?: WindUnit
  pwatUnit?: PwatUnit
  precipUnit?: PrecipUnit
  precipWindow?: PrecipWindow
  fillMode?: FillMode
  tempUnit?: TempUnit
  // Stamp detected H/L MSLP centers on the map.
  centers?: boolean
  // Contour overlays: subset of 'pressure' | 'height' | 'temp'.
  contours?: string[]
  colorStep?: string
}

export type MapRecipeParamsResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: string }

// Glyph density. The stride is rescaled per region on the backend, so one
// number means one on-page spacing everywhere (#45). AUTO sends the backend
// sentinel and lets it apply the calibrated default.
export const WIND_DENSITIES = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20]
export const AUTO_DENSITY = '-1'

export const ISOTACH_INTERVALS = [5, 10, 20] as const
export type IsotachInterval = (typeof ISOTACH_INTERVALS)[number]

function isotachInterval(value: string | null): IsotachInterval | undefined {
  const n = Number(value)
  return (ISOTACH_INTERVALS as readonly number[]).includes(n) ? (n as IsotachInterval) : undefined
}

export function toApiDate(s: string) {
  return s.replace(/-/g, '')
}

export function toApiMonth(s: string) {
  return s.replace('-', '')
}

export function parseApiDate(value: string): ApiDate | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  return { api: value, iso: `${year}-${month}-${day}`, year, month, day }
}

export function parseApiMonth(value: string): ApiMonth | null {
  const match = value.match(/^(\d{4})(\d{2})$/)
  if (!match) return null
  const [, year, month] = match
  return { api: value, iso: `${year}-${month}`, year, month }
}

function apiDateToIso(value: string) {
  return parseApiDate(value)?.iso ?? value
}

function apiMonthToIso(value: string) {
  return parseApiMonth(value)?.iso ?? value
}

export function monthRange(startYM: string, endYM: string): string[] {
  const result: string[] = []
  const [sy, sm] = startYM.split('-').map(Number)
  const [ey, em] = endYM.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
}

export function dateRange(startISO: string, endISO: string): string[] {
  const result: string[] = []
  const cur = new Date(startISO + 'T00:00:00Z')
  const end = new Date(endISO  + 'T00:00:00Z')
  while (cur <= end) {
    result.push(cur.toISOString().slice(0, 10).replace(/-/g, ''))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return result
}

function isConsecutiveMonths(months: string[]) {
  if (months.length < 2) return true
  return monthRange(apiMonthToIso(months[0]), apiMonthToIso(months[months.length - 1])).join(',') === months.join(',')
}

function isConsecutiveDates(dates: string[]) {
  if (dates.length < 2) return true
  return dateRange(apiDateToIso(dates[0]), apiDateToIso(dates[dates.length - 1])).join(',') === dates.join(',')
}

/** True when a URL asks for normalized on a single-hour map.
 *
 * Normalized needs a standard deviation. A 3-hourly map is compared against
 * the normal for that one hour, which is published as a mean only (#72), so
 * there is nothing to divide by. Links saved before that change load as
 * anomaly instead of failing, and the builder tells the reader it swapped. */
export function normalizedUnavailableInUrl(params: URLSearchParams): boolean {
  return params.get('mode') === 'normalized' && !params.get('hours') && !params.get('months')
}

function displayMode(value: string | null, params?: URLSearchParams): DisplayMode | undefined {
  const mode = value === 'raw' || value === 'anomaly' || value === 'normalized' ? value : undefined
  if (mode === 'normalized' && params && normalizedUnavailableInUrl(params)) {
    return 'anomaly'
  }
  return mode
}

function climoSource(value: string | null): ClimoSource | undefined {
  return value === 'monthly-pgb' || value === 'r2-daily' || value === 'r2-monthly' || value === 'cfsr-daily' ? value : undefined
}

function windType(value: string | null): WindOverlayType | undefined {
  return value === 'barbs' || value === 'vectors' || value === 'isotachs' ? value : undefined
}

function windUnit(value: string | null): WindUnit | undefined {
  return value === 'kt' || value === 'm/s' ? value : undefined
}

function pwatUnit(value: string | null): PwatUnit | undefined {
  return value === 'mm' || value === 'in' ? value : undefined
}

function precipUnit(value: string | null): PrecipUnit | undefined {
  return value === 'mm' || value === 'in' ? value : undefined
}

function precipWindow(value: string | null): PrecipWindow | undefined {
  if (!value) return undefined
  const hours = Number(value)
  return Number.isInteger(hours) && hours > 0 && hours % 3 === 0 ? String(hours) : undefined
}

function dateHourToUtc(date: string, hour: string): Date | null {
  const parsed = new Date(`${date}T${hour}:00:00Z`)
  return Number.isNaN(parsed.valueOf()) ? null : parsed
}

function hoursBetween(startDate: string, startHour: string, endDate: string, endHour: string): number | null {
  const start = dateHourToUtc(startDate, startHour)
  const end = dateHourToUtc(endDate, endHour)
  if (!start || !end) return null
  const hours = (end.valueOf() - start.valueOf()) / 3_600_000
  return Number.isInteger(hours) ? hours : null
}

function timeRecipeToParams(time: TimeRecipe): MapRecipeParamsResult {
  if (time.scale === 'climatology') {
    // The year is arbitrary — climatology mode never fetches observations.
    return {
      ok: true,
      params: {
        months: `2000${time.climoMonth}`,
        mode: 'climatology',
      },
    }
  }

  if (time.scale === 'monthly') {
    if (time.subMode === 'single') {
      return { ok: true, params: { months: toApiMonth(time.month) } }
    }
    if (time.subMode === 'range') {
      const months = monthRange(time.monthStart, time.monthEnd)
      if (!months.length) return { ok: false, error: 'End month must be on or after start month.' }
      if (months.length > MAX_COMPOSITE_MONTHS) {
        return { ok: false, error: `Month ranges are limited to ${MAX_COMPOSITE_MONTHS} months per map.` }
      }
      return { ok: true, params: { months: months.join(',') } }
    }
    const months = time.customMonths.filter(Boolean).map(toApiMonth)
    if (!months.length) return { ok: false, error: 'Add at least one month.' }
    if (months.length > MAX_COMPOSITE_MONTHS) {
      return { ok: false, error: `Month lists are limited to ${MAX_COMPOSITE_MONTHS} months per map.` }
    }
    return { ok: true, params: { months: months.join(',') } }
  }

  const params: Record<string, string> = {}
  if (time.scale === '3-hourly') {
    params.hour = time.hour
  } else {
    params.hours = '00,06,12,18'
  }

  if (time.subMode === 'single') {
    params.date = toApiDate(time.date)
    params.date_mode = 'single'
    return { ok: true, params }
  }
  if (time.subMode === 'range') {
    const dates = time.startDate && time.endDate && time.startDate <= time.endDate
      ? dateRange(time.startDate, time.endDate)
      : []
    if (!dates.length) return { ok: false, error: 'End date must be on or after start date.' }
    if (dates.length > MAX_COMPOSITE_DATES) {
      return { ok: false, error: `Date ranges are limited to ${MAX_COMPOSITE_DATES} days per map.` }
    }
    params.dates = dates.join(',')
    params.date_mode = 'range'
    return { ok: true, params }
  }

  const dates = time.customDates.filter(Boolean).map(toApiDate)
  if (!dates.length) return { ok: false, error: 'Add at least one date.' }
  if (dates.length > MAX_COMPOSITE_DATES) {
    return { ok: false, error: `Date lists are limited to ${MAX_COMPOSITE_DATES} dates per map.` }
  }
  params.date_mode = 'list'
  if (dates.length === 1) {
    params.date = dates[0]
  } else {
    params.dates = dates.join(',')
  }
  return { ok: true, params }
}

function precipTotalTimeRecipeToParams(time: TimeRecipe): MapRecipeParamsResult {
  if (time.scale !== '3-hourly' && time.scale !== 'daily') {
    return {
      ok: false,
      error: 'Precipitation totals use date/hour selections.',
    }
  }
  const endHour = 'hour' in time && time.hour && HOURS.includes(time.hour) ? time.hour : '00'
  if (time.subMode === 'single') {
    return {
      ok: true,
      params: {
        date: toApiDate(time.date),
        date_mode: 'single',
        [time.scale === 'daily' ? 'hours' : 'hour']: endHour,
      },
    }
  }
  if (time.subMode !== 'range') {
    const dates = time.customDates.filter(Boolean).map(toApiDate)
    if (!dates.length) return { ok: false, error: 'Add at least one date.' }
    if (dates.length > MAX_COMPOSITE_DATES) {
      return { ok: false, error: `Date lists are limited to ${MAX_COMPOSITE_DATES} dates per map.` }
    }
    return {
      ok: true,
      params: {
        date_mode: 'list',
        [time.scale === 'daily' ? 'hours' : 'hour']: endHour,
        ...(dates.length === 1 ? { date: dates[0] } : { dates: dates.join(',') }),
      },
    }
  }
  const startHour = time.startHour && HOURS.includes(time.startHour) ? time.startHour : '00'
  const windowHours = hoursBetween(time.startDate, startHour, time.endDate, endHour)
  if (!windowHours || windowHours <= 0 || windowHours % 3 !== 0) {
    return { ok: false, error: 'Precipitation total ranges must end after the start time in 3-hour increments.' }
  }
  return {
    ok: true,
    params: {
      date: toApiDate(time.endDate),
      date_mode: 'range',
      hour: endHour,
      start_date: toApiDate(time.startDate),
      start_hour: startHour,
      precip_window: String(windowHours),
    },
  }
}

export function mapRecipeToParams(recipe: MapRecipe): MapRecipeParamsResult {
  if (!recipe.variable || !recipe.level || !recipe.region) {
    return { ok: false, error: 'Choose a variable, level, and region.' }
  }
  if (!recipe.time) {
    return { ok: false, error: 'Choose a time period.' }
  }

  const variable = apiVariableForSelection(
    recipe.variable,
    recipe.level,
    recipe.humidityType,
    recipe.radiationWaveband,
    recipe.radiationDirection,
    recipe.vorticityType,
  )
  const urlVariable = urlVariableForSelection(
    recipe.variable,
    recipe.level,
    recipe.humidityType,
    recipe.radiationWaveband,
    recipe.radiationDirection,
    recipe.vorticityType,
  )
  const level = urlLevelForSelection(recipe.variable, recipe.level)
  const params: Record<string, string> = { variable: urlVariable, level, region: recipe.region }
  if (recipe.variable === 'radiation') {
    const waveband = recipe.radiationWaveband ?? 'shortwave'
    params.waveband = waveband
    params.direction = radiationDirectionForSelection(recipe.level, waveband, recipe.radiationDirection ?? 'down')
  }

  const rawOnlyVariable = RAW_ONLY_API_VARIABLES.has(variable)
  const renderMode = rawOnlyVariable ? 'raw' : recipe.displayMode
  if (renderMode && renderMode !== 'raw') params.mode = renderMode

  const timeParams = variable === 'precip_total'
    ? precipTotalTimeRecipeToParams(recipe.time)
    : timeRecipeToParams(recipe.time)
  if (!timeParams.ok) return timeParams
  Object.assign(params, timeParams.params)

  if (recipe.wind) {
    // The backend decides the glyph quantity from the map mode (#47) — no
    // wind_overlay_mode param. Legacy recipes' anomalyOverlay folds into the
    // single glyph on/type model.
    const legacyAnomalyGlyph =
      recipe.wind.anomalyOverlay && recipe.wind.anomalyOverlay !== 'none'
        ? recipe.wind.anomalyOverlay
        : null
    if (legacyAnomalyGlyph) {
      params.wind_step = recipe.wind.step
      params.wind_type = legacyAnomalyGlyph
    } else if (recipe.wind.on) {
      params.wind_step = recipe.wind.step
      params.wind_type = recipe.wind.type
    }
    if (recipe.wind.isotachs && !legacyAnomalyGlyph) {
      params.isotachs = '1'
      // Omitted = backend default for the level; only an explicit choice
      // rides in the URL.
      if (recipe.wind.isotachInterval) {
        params.isotach_interval = String(recipe.wind.isotachInterval)
      }
    }
    if (recipe.wind.shading === false && (variable === 'wind_speed' || variable === 'wind_10m')) {
      params.fill_mode = 'none'
    }
  }

  const safeColorStep = normalizeColorStep(recipe.colorStep ?? '1')
  if (safeColorStep !== 1) params.color_step = String(safeColorStep)
  if (recipe.windUnit && isWindUnitApiVariable(variable)) {
    params.wind_unit = recipe.windUnit
  }
  if (recipe.pwatUnit && variable === 'precipitable_water') {
    params.pwat_unit = recipe.pwatUnit
  }
  if (recipe.precipUnit && (variable === 'precip_rate' || variable === 'precip_total')) {
    params.precip_unit = recipe.precipUnit
  }
  if (variable === 'precip_total' && !params.precip_window) {
    params.precip_window = recipe.precipWindow ?? '3'
  }
  // Only contour-first variables have a shaded option; default stays contours.
  if (recipe.fillMode === 'shaded' && (variable === 'surface_pressure' || variable === 'height')) {
    params.fill_mode = 'shaded'
  }
  // Absent temp_unit = auto (each level's native scale unit).
  if (recipe.tempUnit && (variable === 'temp' || variable === 'temp_2m')) {
    params.temp_unit = recipe.tempUnit
  }
  if (recipe.centers) {
    params.centers = '1'
  }
  if (recipe.contours?.length) {
    params.contours = recipe.contours.join(',')
  }
  if (recipe.climoSource && params.mode && params.mode !== 'raw') {
    params.climo_source = recipe.climoSource
  }

  return { ok: true, params }
}

// Build a shareable deep-link that regenerates this map for anyone who opens it.
// This is the ONLY sharing path for a saved map — the recipe travels as URL text;
// the rendered image itself is private and never gets a public link.
export function recipeShareUrl(recipe: MapRecipe, base?: string): string | null {
  const result = mapRecipeToParams(recipe)
  if (!result.ok) return null
  const root = base ?? `${window.location.origin}${window.location.pathname}`
  const qs = new URLSearchParams(result.params).toString()
  return qs ? `${root}?${qs}` : root
}

function timeRecipeFromUrl(params: URLSearchParams): TimeRecipe | undefined {
  const mode = params.get('mode')
  const months = params.get('months')
  const dates = params.get('dates')
  const date = params.get('date')
  const hours = params.get('hours')
  const hour = params.get('hour')
  const dateMode = params.get('date_mode')

  if (mode === 'climatology') {
    // Current URLs carry months=YYYYMM; legacy shared URLs carried date=YYYYMM01.
    const parsedMonth = months ? parseApiMonth(months.split(',')[0].trim()) : null
    const parsedDate = date ? parseApiDate(date) : null
    return {
      scale: 'climatology',
      climoMonth: parsedMonth?.month ?? parsedDate?.month ?? '01',
    }
  }

  if (months) {
    const parsedMonths = months.split(',').map(s => s.trim()).filter(Boolean)
    if (parsedMonths.length === 1) {
      return { scale: 'monthly', subMode: 'single', month: apiMonthToIso(parsedMonths[0]) }
    }
    if (parsedMonths.length > 1 && isConsecutiveMonths(parsedMonths)) {
      return {
        scale: 'monthly',
        subMode: 'range',
        monthStart: apiMonthToIso(parsedMonths[0]),
        monthEnd: apiMonthToIso(parsedMonths[parsedMonths.length - 1]),
      }
    }
    if (parsedMonths.length > 1) {
      return { scale: 'monthly', subMode: 'list', customMonths: parsedMonths.map(apiMonthToIso) }
    }
  }

  const parsedDates = dates
    ? dates.split(',').map(s => s.trim()).filter(Boolean)
    : date
      ? [date]
      : []
  const scale = hours ? 'daily' : '3-hourly'
  const validHour = hour && HOURS.includes(hour) ? hour : '00'

  if (parsedDates.length === 1) {
    const isoDate = apiDateToIso(parsedDates[0])
    return scale === 'daily'
      ? { scale, subMode: 'single', date: isoDate }
      : { scale, subMode: 'single', date: isoDate, hour: validHour }
  }
  if (parsedDates.length > 1 && (dateMode === 'range' || isConsecutiveDates(parsedDates))) {
    const startDate = apiDateToIso(parsedDates[0])
    const endDate = apiDateToIso(parsedDates[parsedDates.length - 1])
    if (scale === 'daily') {
      return { scale, subMode: 'range', startDate, endDate }
    }
    return {
      scale,
      subMode: 'range',
      startDate,
      endDate,
      hour: validHour,
    }
  }
  if (parsedDates.length > 1) {
    const customDates = parsedDates.map(apiDateToIso)
    return scale === 'daily'
      ? { scale, subMode: 'list', customDates }
      : { scale, subMode: 'list', customDates, hour: validHour }
  }

  return undefined
}

function firstDateFromTimeRecipe(time: TimeRecipe): string | undefined {
  if (time.scale !== '3-hourly' && time.scale !== 'daily') return undefined
  if (time.subMode === 'single') return time.date
  if (time.subMode === 'range') return time.startDate
  return time.customDates[0]
}

function precipTotalTimeRecipeFromUrl(params: URLSearchParams): TimeRecipe | undefined {
  const parsed = timeRecipeFromUrl(params)
  const explicitStartDate = params.get('start_date')
  const explicitStartHour = params.get('start_hour')
  const hour = params.get('hour')
  const dailyHour = params.get('hours')?.split(',').map(s => s.trim()).find(h => HOURS.includes(h))
  const validHour = hour && HOURS.includes(hour) ? hour : dailyHour ?? '00'
  if (!parsed) return undefined
  const date = firstDateFromTimeRecipe(parsed)
  if (!date) return undefined
  if (explicitStartDate) {
    return {
      scale: params.get('precip_window') === '24' ? 'daily' : '3-hourly',
      subMode: 'range',
      startDate: apiDateToIso(explicitStartDate),
      endDate: date,
      startHour: explicitStartHour && HOURS.includes(explicitStartHour) ? explicitStartHour : '00',
      hour: validHour,
    }
  }
  if (parsed.scale === 'daily' && parsed.subMode === 'single') {
    return { ...parsed, hour: validHour }
  }
  if (parsed.scale === 'daily' && parsed.subMode === 'list') {
    return { ...parsed, hour: validHour }
  }
  return parsed
}

export function mapRecipeFromUrl(params: URLSearchParams): MapRecipe | null {
  if (!params.toString()) return null

  const apiVariable = params.get('variable')
  const apiLevel = params.get('level') ?? '850'
  const uiSelection = apiVariable ? uiSelectionForUrlVariable(apiVariable, apiLevel, params.get('waveband'), params.get('direction')) : undefined
  const parsedHumidityType: HumidityType | undefined = apiVariable === 'humidity'
    ? 'specific'
    : apiVariable === 'rel_humidity' || apiVariable === 'rel_humidity_2m'
      ? 'relative'
      : undefined
  const resolvedApiVariable = uiSelection?.variable && uiSelection.level
    ? apiVariableForSelection(
        uiSelection.variable,
        uiSelection.level,
        parsedHumidityType,
        uiSelection.radiationWaveband,
        uiSelection.radiationDirection,
        uiSelection.vorticityType,
      )
    : apiVariable
  const parsedWindType = windType(params.get('wind_type')) ?? 'barbs'
  const windStep = params.get('wind_step')
  // wind_step=0 (or junk) in a URL means "no glyph overlay", never "density
  // zero" — builder state must not hold a sub-minimum density (#57).
  // -1 is the auto sentinel: glyphs on, backend picks the density (#45).
  const windStepUsable = Number(windStep) > 0 || windStep === AUTO_DENSITY
  const parsedColorStep = params.get('color_step')
  const isWindApiVariable = resolvedApiVariable === 'wind_speed' || resolvedApiVariable === 'wind_10m'
  const parsedDisplayMode = displayMode(params.get('mode'), params)
  const parsedTime = resolvedApiVariable === 'precip_total'
    ? precipTotalTimeRecipeFromUrl(params)
    : timeRecipeFromUrl(params)

  return {
    ...(uiSelection ?? {}),
    humidityType: parsedHumidityType,
    region: params.get('region') ?? undefined,
    displayMode: resolvedApiVariable && RAW_ONLY_API_VARIABLES.has(resolvedApiVariable) ? 'raw' : parsedDisplayMode,
    climoSource: climoSource(params.get('climo_source')),
    time: parsedTime,
    // Old links may carry wind_overlay_mode; the glyph quantity now follows
    // the map mode (#47), so glyphs-on is all the URL needs to express.
    wind: windStep === null && params.get('isotachs') !== '1' && !isWindApiVariable ? undefined : {
      on: windStepUsable,
      step: windStepUsable ? windStep! : AUTO_DENSITY,
      type: parsedWindType,
      isotachs: params.get('isotachs') === '1',
      isotachInterval: isotachInterval(params.get('isotach_interval')),
      shading: params.get('fill_mode') !== 'none',
    },
    windUnit: windUnit(params.get('wind_unit')),
    pwatUnit: pwatUnit(params.get('pwat_unit')),
    precipUnit: precipUnit(params.get('precip_unit')),
    precipWindow: precipWindow(params.get('precip_window')),
    fillMode: params.get('fill_mode') === 'shaded' ? 'shaded' : undefined,
    tempUnit: params.get('temp_unit') === 'F' || params.get('temp_unit') === 'C' ? (params.get('temp_unit') as TempUnit) : undefined,
    centers: params.get('centers') === '1' ? true : undefined,
    contours: params.get('contours') ? params.get('contours')!.split(',').filter(c => ['pressure', 'height', 'temp'].includes(c)) : undefined,
    colorStep: parsedColorStep ? String(normalizeColorStep(parsedColorStep)) : undefined,
  }
}
