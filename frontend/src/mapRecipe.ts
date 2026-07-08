import { HOURS, normalizeColorStep } from './sharedOptions'
import { apiLevelForSelection, apiVariableForSelection, uiSelectionForApiVariable } from './variableConfig'

// Mirror the backend request guards (MAX_COMPOSITE_DATES / MAX_COMPOSITE_MONTHS
// in backend/app/main.py) so users get instant feedback instead of a 422.
export const MAX_COMPOSITE_DATES = 93
export const MAX_COMPOSITE_MONTHS = 60

export type TimeScale = '3-hourly' | 'daily' | 'monthly' | 'climatology'
export type SubMode = 'single' | 'range' | 'list'
export type DisplayMode = 'raw' | 'anomaly' | 'normalized'
export type ClimoSource = 'monthly-pgb' | 'r2-daily' | 'r2-monthly' | 'cfsr-daily'
export type WindUnit = 'kt' | 'm/s'
export type WindOverlayType = 'vectors' | 'barbs'
export type WindAnomalyOverlay = 'none' | WindOverlayType
export type PwatUnit = 'mm' | 'in'

export type ApiDate = { api: string; iso: string; year: string; month: string; day: string }
export type ApiMonth = { api: string; iso: string; year: string; month: string }

export type TimeRecipe =
  | { scale: 'climatology'; climoMonth: string }
  | { scale: 'monthly'; subMode: 'single'; month: string }
  | { scale: 'monthly'; subMode: 'range'; monthStart: string; monthEnd: string }
  | { scale: 'monthly'; subMode: 'list'; customMonths: string[] }
  | { scale: '3-hourly'; subMode: 'single'; date: string; hour: string }
  | { scale: '3-hourly'; subMode: 'range'; startDate: string; endDate: string; hour: string }
  | { scale: '3-hourly'; subMode: 'list'; customDates: string[]; hour: string }
  | { scale: 'daily'; subMode: 'single'; date: string }
  | { scale: 'daily'; subMode: 'range'; startDate: string; endDate: string }
  | { scale: 'daily'; subMode: 'list'; customDates: string[] }

export type MapRecipe = {
  variable?: string
  level?: string
  region?: string
  displayMode?: DisplayMode
  climoSource?: ClimoSource
  time?: TimeRecipe
  wind?: {
    on: boolean
    step: string
    type: WindOverlayType
    anomalyOverlay: WindAnomalyOverlay
  }
  windUnit?: WindUnit
  pwatUnit?: PwatUnit
  colorStep?: string
}

export type MapRecipeParamsResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: string }

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

function displayMode(value: string | null): DisplayMode | undefined {
  return value === 'raw' || value === 'anomaly' || value === 'normalized' ? value : undefined
}

function climoSource(value: string | null): ClimoSource | undefined {
  return value === 'monthly-pgb' || value === 'r2-daily' || value === 'r2-monthly' || value === 'cfsr-daily' ? value : undefined
}

function windType(value: string | null): WindOverlayType | undefined {
  return value === 'barbs' || value === 'vectors' ? value : undefined
}

function windUnit(value: string | null): WindUnit | undefined {
  return value === 'kt' || value === 'm/s' ? value : undefined
}

function pwatUnit(value: string | null): PwatUnit | undefined {
  return value === 'mm' || value === 'in' ? value : undefined
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

export function mapRecipeToParams(recipe: MapRecipe): MapRecipeParamsResult {
  if (!recipe.variable || !recipe.level || !recipe.region) {
    return { ok: false, error: 'Choose a variable, level, and region.' }
  }
  if (!recipe.time) {
    return { ok: false, error: 'Choose a time period.' }
  }

  const variable = apiVariableForSelection(recipe.variable, recipe.level)
  const level = apiLevelForSelection(recipe.variable, recipe.level)
  const params: Record<string, string> = { variable, level, region: recipe.region }

  if (recipe.displayMode && recipe.displayMode !== 'raw') params.mode = recipe.displayMode

  const timeParams = timeRecipeToParams(recipe.time)
  if (!timeParams.ok) return timeParams
  Object.assign(params, timeParams.params)

  if (recipe.wind) {
    if (recipe.wind.anomalyOverlay !== 'none') {
      params.wind_step = recipe.wind.step
      params.wind_type = recipe.wind.anomalyOverlay
      params.wind_overlay_mode = 'anomaly'
    } else if (recipe.wind.on) {
      params.wind_step = recipe.wind.step
      params.wind_type = recipe.wind.type
      params.wind_overlay_mode = 'actual'
    }
  }

  const safeColorStep = normalizeColorStep(recipe.colorStep ?? '1')
  if (safeColorStep !== 1) params.color_step = String(safeColorStep)
  if (recipe.windUnit && (variable === 'wind_speed' || variable === 'wind_10m')) {
    params.wind_unit = recipe.windUnit
  }
  if (recipe.pwatUnit && variable === 'precipitable_water') {
    params.pwat_unit = recipe.pwatUnit
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

export function mapRecipeFromUrl(params: URLSearchParams): MapRecipe | null {
  if (!params.toString()) return null

  const apiVariable = params.get('variable')
  const apiLevel = params.get('level') ?? '850'
  const uiSelection = apiVariable ? uiSelectionForApiVariable(apiVariable, apiLevel) : {}
  const parsedWindType = windType(params.get('wind_type')) ?? 'barbs'
  const windStep = params.get('wind_step')
  const windOverlayMode = params.get('wind_overlay_mode')
  const parsedColorStep = params.get('color_step')

  return {
    ...uiSelection,
    region: params.get('region') ?? undefined,
    displayMode: displayMode(params.get('mode')),
    climoSource: climoSource(params.get('climo_source')),
    time: timeRecipeFromUrl(params),
    wind: windStep === null ? undefined : {
      on: windOverlayMode !== 'anomaly' && Number(windStep) > 0,
      step: windStep,
      type: parsedWindType,
      anomalyOverlay: windOverlayMode === 'anomaly' ? parsedWindType : 'none',
    },
    windUnit: windUnit(params.get('wind_unit')),
    pwatUnit: pwatUnit(params.get('pwat_unit')),
    colorStep: parsedColorStep ? String(normalizeColorStep(parsedColorStep)) : undefined,
  }
}
