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
export const CORE_ARCHIVE_START_DATE = '1950-01-01'
export const CORE_ARCHIVE_START_MONTH = '1950-01'
export const DATA_AVAILABILITY_NOTE = 'The data usually lag real time by 24-36 hours.'

// CONTRACT GUARD: adding a TimeScale/SubMode value or a new time param to
// timeRecipeToParams/timeRecipeFromUrl requires matching corpus cases in
// backend/tests/test_time_selection_corpus.py. See docs/TIME_SELECTION_PLAN.md.
export type TimeScale = '3-hourly' | 'daily' | 'monthly' | 'climatology'
// 'slice' (hours x dates) is valid for 3-hourly only; the UI offers the tab
// only there and the backend rejects it elsewhere.
export type SubMode = 'single' | 'range' | 'list' | 'slice'
export type DisplayMode = 'raw' | 'anomaly' | 'normalized'
export type ClimoSource = 'monthly-pgb' | 'r2-daily' | 'r2-daily-15day' | 'r2-monthly' | 'core-3hourly' | 'cfsr-daily'
export type WindUnit = 'kt' | 'm/s'
export type WindOverlayType = 'vectors' | 'barbs' | 'isotachs'
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
  // Range is a continuous span: start date+hour through end date+hour
  // inclusive ('hour' is the END hour, matching the precip_total shape).
  | { scale: '3-hourly'; subMode: 'range'; startDate: string; endDate: string; startHour: string; hour: string }
  // List rows each carry their own hour.
  | { scale: '3-hourly'; subMode: 'list'; customTimes: { date: string; hour: string }[] }
  | { scale: '3-hourly'; subMode: 'slice'; customDates: string[]; hours: string[] }
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

export type MapRecipeRetry = { label: string; question?: string; params: Record<string, string> }

export type MapRecipeParamsResult =
  | { ok: true; params: Record<string, string> }
  | { ok: false; error: string; retry?: MapRecipeRetry }

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

export function newestAllowedObservationDate(now = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function currentObservationDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function currentObservationMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

export function newestAllowedObservationMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

export function prettyDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return isoDate
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

export function prettyMonth(isoMonth: string): string {
  const parsed = new Date(`${isoMonth}-01T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return isoMonth
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

export function dateRangeAvailabilityMessage(now = new Date()): string {
  return (
    `The CORe reanalysis data starts on ${prettyDate(CORE_ARCHIVE_START_DATE)}. `
    + `Please choose a date between ${prettyDate(CORE_ARCHIVE_START_DATE)} and ${prettyDate(newestAllowedObservationDate(now))}.`
  )
}

export function futureObservationDateMessage(now = new Date()): string {
  return (
    `CORe reanalysis data is only available prior to today's date. ${DATA_AVAILABILITY_NOTE} `
    + `Please choose a date prior to ${prettyDate(currentObservationDate(now))}.`
  )
}

export function monthlyAvailabilityMessage(now = new Date()): string {
  return (
    `CORe monthly data is only available for ${prettyMonth(newestAllowedObservationMonth(now))} and earlier.`
  )
}

function monthlyAvailabilityRetry(params: Record<string, string>, now = new Date()): MapRecipeRetry | null {
  const months = requestedObservationMonths(params)
  if (!months.length) return null
  const latestAvailable = toApiMonth(newestAllowedObservationMonth(now))
  if (months.every(month => month <= latestAvailable)) return null

  const keep = months.filter(month => month <= latestAvailable)
  const nextMonths = keep.length ? keep : [latestAvailable]
  const latestKept = nextMonths[nextMonths.length - 1]
  const nextParams = { ...params, months: nextMonths.join(',') }
  const question = nextMonths.length === 1
    ? `Generate this map for ${prettyMonth(apiMonthToIso(latestKept))} instead?`
    : `Generate this map through ${prettyMonth(apiMonthToIso(latestKept))} instead?`

  return {
    label: nextMonths.length === 1 ? `Generate ${apiMonthToIso(latestKept)}` : `Generate through ${apiMonthToIso(latestKept)}`,
    question,
    params: nextParams,
  }
}

function latestRequestedObservationDate(params: Record<string, string>): string | null {
  const values = [
    ...(params.dates ?? '').split(','),
    params.date ?? '',
    params.start_date ?? '',
  ].map(s => s.trim()).filter(Boolean)
  if (!values.length) return null
  return values.reduce((latest, value) => value > latest ? value : latest, values[0])
}

function requestedObservationMonths(params: Record<string, string>): string[] {
  return (params.months ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export function observationDateAvailabilityError(params: Record<string, string>, now = new Date()): string | null {
  const months = requestedObservationMonths(params)
  if (months.length) {
    const latestMonth = months.reduce((latest, value) => value > latest ? value : latest, months[0])
    return latestMonth >= toApiMonth(currentObservationMonth(now)) ? monthlyAvailabilityMessage(now) : null
  }
  const requested = [
    ...(params.dates ?? '').split(','),
    params.date ?? '',
    params.start_date ?? '',
  ].map(s => s.trim()).filter(Boolean)
  if (!requested.length) return null
  const earliestRequested = requested.reduce((earliest, value) => value < earliest ? value : earliest, requested[0])
  if (earliestRequested < toApiDate(CORE_ARCHIVE_START_DATE)) return dateRangeAvailabilityMessage(now)
  const latestRequested = latestRequestedObservationDate(params)
  const today = toApiDate(currentObservationDate(now))
  return latestRequested && latestRequested >= today ? futureObservationDateMessage(now) : null
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

export function isConsecutiveDates(dates: string[]) {
  if (dates.length < 2) return true
  return dateRange(apiDateToIso(dates[0]), apiDateToIso(dates[dates.length - 1])).join(',') === dates.join(',')
}

/** True when a URL asks for normalized where no sigma path exists.
 *
 * Mirrors the backend gate in main.py: single-hour and 3-hourly selections
 * compare against a mean-only hourly baseline, so normalized is unavailable.
 * Daily and monthly selections — canonical (time_scale param) or legacy
 * (hours/months params, or a bare date, which is a daily composite now) —
 * carry sigma. PWAT is exempt via its R2 daily 15-day mean/std path. */
export function normalizedUnavailableInUrl(params: URLSearchParams): boolean {
  if (params.get('mode') !== 'normalized' || params.get('variable') === 'precipitable_water') {
    return false
  }
  const timeScale = params.get('time_scale')
  // Slices keep the daily r2 baseline (which has sigma), so they support
  // normalized; ranges and lists compare per-hour and do not.
  if (timeScale) return timeScale === '3-hourly' && params.get('date_mode') !== 'slice'
  return Boolean(params.get('hour')) && !params.get('hours') && !params.get('months')
}

function displayMode(value: string | null, params?: URLSearchParams): DisplayMode | undefined {
  const mode = value === 'raw' || value === 'anomaly' || value === 'normalized' ? value : undefined
  if (mode === 'normalized' && params && normalizedUnavailableInUrl(params)) {
    return 'anomaly'
  }
  return mode
}

function climoSource(value: string | null): ClimoSource | undefined {
  return value === 'monthly-pgb' || value === 'r2-daily' || value === 'r2-daily-15day' || value === 'r2-monthly' || value === 'core-3hourly' || value === 'cfsr-daily' ? value : undefined
}

function windType(value: string | null): WindOverlayType | undefined {
  return value === 'barbs' || value === 'vectors' || value === 'isotachs' ? value : undefined
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

export function hoursBetween(startDate: string, startHour: string, endDate: string, endHour: string): number | null {
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
    // Availability checks and their retries run on the expanded months list
    // (the helpers speak that shape); the emitted params are canonical.
    if (time.subMode === 'single') {
      const legacyShape = { months: toApiMonth(time.month) }
      const availabilityError = observationDateAvailabilityError(legacyShape)
      if (availabilityError) {
        return { ok: false, error: availabilityError, retry: monthlyAvailabilityRetry(legacyShape) ?? undefined }
      }
      return { ok: true, params: { time_scale: 'monthly', date_mode: 'single', month: toApiMonth(time.month) } }
    }
    if (time.subMode === 'range') {
      const months = monthRange(time.monthStart, time.monthEnd)
      if (!months.length) return { ok: false, error: 'End month must be on or after start month.' }
      if (months.length > MAX_COMPOSITE_MONTHS) {
        return { ok: false, error: `Month ranges are limited to ${MAX_COMPOSITE_MONTHS} months per map.` }
      }
      const legacyShape = { months: months.join(',') }
      const availabilityError = observationDateAvailabilityError(legacyShape)
      if (availabilityError) {
        return { ok: false, error: availabilityError, retry: monthlyAvailabilityRetry(legacyShape) ?? undefined }
      }
      return {
        ok: true,
        params: {
          time_scale: 'monthly',
          date_mode: 'range',
          start_month: months[0],
          end_month: months[months.length - 1],
        },
      }
    }
    const months = time.customMonths.filter(Boolean).map(toApiMonth)
    if (!months.length) return { ok: false, error: 'Add at least one month.' }
    if (months.length > MAX_COMPOSITE_MONTHS) {
      return { ok: false, error: `Month lists are limited to ${MAX_COMPOSITE_MONTHS} months per map.` }
    }
    const legacyShape = { months: months.join(',') }
    const availabilityError = observationDateAvailabilityError(legacyShape)
    if (availabilityError) {
      return { ok: false, error: availabilityError, retry: monthlyAvailabilityRetry(legacyShape) ?? undefined }
    }
    return { ok: true, params: { time_scale: 'monthly', date_mode: 'list', months: months.join(',') } }
  }

  if (time.scale === '3-hourly' && time.subMode === 'slice') {
    const dates = time.customDates.filter(Boolean).map(toApiDate)
    if (!dates.length) return { ok: false, error: 'Add at least one date.' }
    if (dates.length > MAX_COMPOSITE_DATES) {
      return { ok: false, error: `Date lists are limited to ${MAX_COMPOSITE_DATES} dates per map.` }
    }
    const sliceHours = time.hours.filter(h => HOURS.includes(h))
    if (!sliceHours.length) return { ok: false, error: 'Pick at least one hour.' }
    if (dates.length * sliceHours.length > MAX_COMPOSITE_DATES * 4) {
      return { ok: false, error: `Slices are limited to ${MAX_COMPOSITE_DATES * 4} date/hour combinations per map.` }
    }
    const params = {
      time_scale: '3-hourly',
      date_mode: 'slice',
      dates: dates.join(','),
      hours: sliceHours.join(','),
    }
    const availabilityError = observationDateAvailabilityError(params)
    if (availabilityError) return { ok: false, error: availabilityError }
    return { ok: true, params }
  }

  if (time.scale === '3-hourly' && time.subMode === 'range') {
    const startHour = HOURS.includes(time.startHour) ? time.startHour : '00'
    const endHour = HOURS.includes(time.hour) ? time.hour : '00'
    const span = hoursBetween(time.startDate, startHour, time.endDate, endHour)
    if (span === null || span < 0) return { ok: false, error: 'End time must be at or after the start time.' }
    if (span / 3 + 1 > MAX_COMPOSITE_DATES * 4) {
      return { ok: false, error: `Ranges are limited to ${MAX_COMPOSITE_DATES * 4} 3-hour steps per map.` }
    }
    const params = {
      time_scale: '3-hourly',
      date_mode: 'range',
      start_time: `${toApiDate(time.startDate)}${startHour}`,
      end_time: `${toApiDate(time.endDate)}${endHour}`,
    }
    const availabilityError = observationDateAvailabilityError({
      dates: `${toApiDate(time.startDate)},${toApiDate(time.endDate)}`,
    })
    if (availabilityError) return { ok: false, error: availabilityError }
    return { ok: true, params }
  }

  if (time.scale === '3-hourly' && time.subMode === 'list') {
    const rows = time.customTimes.filter(t => t.date && HOURS.includes(t.hour))
    if (!rows.length) return { ok: false, error: 'Add at least one date and hour.' }
    const tokens = rows.map(t => `${toApiDate(t.date)}${t.hour}`)
    if (new Set(tokens).size !== tokens.length) {
      return { ok: false, error: 'Each date and hour can appear once per list.' }
    }
    if (tokens.length > MAX_COMPOSITE_DATES * 4) {
      return { ok: false, error: `Time lists are limited to ${MAX_COMPOSITE_DATES * 4} entries per map.` }
    }
    const params = { time_scale: '3-hourly', date_mode: 'list', times: tokens.join(',') }
    const availabilityError = observationDateAvailabilityError({
      dates: rows.map(t => toApiDate(t.date)).join(','),
    })
    if (availabilityError) return { ok: false, error: availabilityError }
    return { ok: true, params }
  }

  if (time.scale === '3-hourly') {
    // range/list/slice returned above; only single remains.
    const params = {
      time_scale: '3-hourly',
      date_mode: 'single',
      date: toApiDate(time.date),
      hour: time.hour,
    }
    const availabilityError = observationDateAvailabilityError(params)
    if (availabilityError) return { ok: false, error: availabilityError }
    return { ok: true, params }
  }

  // Daily. Canonical daily implies the four synoptic times; no hours param.
  if (time.subMode === 'single') {
    const params = { time_scale: 'daily', date_mode: 'single', date: toApiDate(time.date) }
    const availabilityError = observationDateAvailabilityError(params)
    if (availabilityError) return { ok: false, error: availabilityError }
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
    const availabilityError = observationDateAvailabilityError({ dates: `${dates[0]},${dates[dates.length - 1]}` })
    if (availabilityError) return { ok: false, error: availabilityError }
    return {
      ok: true,
      params: {
        time_scale: 'daily',
        date_mode: 'range',
        start_date: dates[0],
        end_date: dates[dates.length - 1],
      },
    }
  }

  const dates = time.customDates.filter(Boolean).map(toApiDate)
  if (!dates.length) return { ok: false, error: 'Add at least one date.' }
  if (dates.length > MAX_COMPOSITE_DATES) {
    return { ok: false, error: `Date lists are limited to ${MAX_COMPOSITE_DATES} dates per map.` }
  }
  const availabilityError = observationDateAvailabilityError({ dates: dates.join(',') })
  if (availabilityError) return { ok: false, error: availabilityError }
  return { ok: true, params: { time_scale: 'daily', date_mode: 'list', dates: dates.join(',') } }
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
    const params = {
      date: toApiDate(time.date),
      date_mode: 'single',
      [time.scale === 'daily' ? 'hours' : 'hour']: endHour,
    }
    const availabilityError = observationDateAvailabilityError(params)
    return availabilityError ? { ok: false, error: availabilityError } : { ok: true, params }
  }
  if (time.subMode === 'slice') {
    // Summed windows ending at hours x dates; the backend rejects ending
    // times closer together than precip_window (double-counted rain).
    const dates = time.customDates.filter(Boolean).map(toApiDate)
    if (!dates.length) return { ok: false, error: 'Add at least one date.' }
    const sliceHours = time.hours.filter(h => HOURS.includes(h))
    if (!sliceHours.length) return { ok: false, error: 'Pick at least one hour.' }
    const params = {
      time_scale: '3-hourly',
      date_mode: 'slice',
      dates: dates.join(','),
      hours: sliceHours.join(','),
    }
    const availabilityError = observationDateAvailabilityError({ dates: dates.join(',') })
    return availabilityError ? { ok: false, error: availabilityError } : { ok: true, params }
  }
  if (time.subMode !== 'range') {
    if (time.scale === '3-hourly') {
      // Per-row ending hours: summed windows, one per (date, hour) row.
      const rows = time.customTimes.filter(t => t.date && HOURS.includes(t.hour))
      if (!rows.length) return { ok: false, error: 'Add at least one date and hour.' }
      const params = {
        time_scale: '3-hourly',
        date_mode: 'list',
        times: rows.map(t => `${toApiDate(t.date)}${t.hour}`).join(','),
      }
      const availabilityError = observationDateAvailabilityError({ dates: rows.map(t => toApiDate(t.date)).join(',') })
      return availabilityError ? { ok: false, error: availabilityError } : { ok: true, params }
    }
    const dates = time.customDates.filter(Boolean).map(toApiDate)
    if (!dates.length) return { ok: false, error: 'Add at least one date.' }
    if (dates.length > MAX_COMPOSITE_DATES) {
      return { ok: false, error: `Date lists are limited to ${MAX_COMPOSITE_DATES} dates per map.` }
    }
    const params = {
      date_mode: 'list',
      hours: endHour,
      ...(dates.length === 1 ? { date: dates[0] } : { dates: dates.join(',') }),
    }
    const availabilityError = observationDateAvailabilityError(params)
    return availabilityError ? { ok: false, error: availabilityError } : { ok: true, params }
  }
  const startHour = time.startHour && HOURS.includes(time.startHour) ? time.startHour : '00'
  const windowHours = hoursBetween(time.startDate, startHour, time.endDate, endHour)
  if (!windowHours || windowHours <= 0 || windowHours % 3 !== 0) {
    return { ok: false, error: 'Precipitation total ranges must end after the start time in 3-hour increments.' }
  }
  const params = {
    date: toApiDate(time.endDate),
    date_mode: 'range',
    hour: endHour,
    start_date: toApiDate(time.startDate),
    start_hour: startHour,
    precip_window: String(windowHours),
  }
  const availabilityError = observationDateAvailabilityError(params)
  return availabilityError ? { ok: false, error: availabilityError } : { ok: true, params }
}

export function mapRecipeToParams(recipe: MapRecipe): MapRecipeParamsResult {
  if (!recipe.variable || !recipe.level || !recipe.region) {
    return { ok: false, error: 'Choose a variable, level, and region.' }
  }
  const isBlankMap = recipe.variable === 'blank_map'
  if (!isBlankMap && !recipe.time) {
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
  const params: Record<string, string> = { variable: urlVariable, region: recipe.region }
  if (isBlankMap) return { ok: true, params }

  params.level = level
  if (recipe.variable === 'radiation') {
    const waveband = recipe.radiationWaveband ?? 'shortwave'
    params.waveband = waveband
    params.direction = radiationDirectionForSelection(recipe.level, waveband, recipe.radiationDirection ?? 'down')
  }

  const rawOnlyVariable = RAW_ONLY_API_VARIABLES.has(variable)
  const renderMode = rawOnlyVariable ? 'raw' : recipe.displayMode
  if (renderMode && renderMode !== 'raw') params.mode = renderMode

  if (!isBlankMap) {
    const timeParams = variable === 'precip_total'
      ? precipTotalTimeRecipeToParams(recipe.time!)
      : timeRecipeToParams(recipe.time!)
    if (!timeParams.ok) {
      const retry = timeParams.retry
        ? { ...timeParams.retry, params: { ...params, ...timeParams.retry.params } }
        : undefined
      return retry ? { ...timeParams, retry } : timeParams
    }
    Object.assign(params, timeParams.params)
  }

  if (recipe.wind) {
    // The backend decides the glyph quantity from the map mode (#47).
    if (recipe.wind.on) {
      params.wind_step = recipe.wind.step
      params.wind_type = recipe.wind.type
    }
    if (recipe.wind.isotachs) {
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

  // Canonical v2 shapes (time_scale gate, docs/TIME_SELECTION_PLAN.md).
  if (params.get('time_scale') === '3-hourly') {
    if (dateMode === 'slice') {
      const sliceDates = (dates ?? date ?? '').split(',').map(s => s.trim()).filter(Boolean)
      const sliceHours = (hours ?? hour ?? '').split(',').map(s => s.trim()).filter(h => HOURS.includes(h))
      if (sliceDates.length && sliceHours.length) {
        return { scale: '3-hourly', subMode: 'slice', customDates: sliceDates.map(apiDateToIso), hours: sliceHours }
      }
    }
    if (dateMode === 'range') {
      const st = params.get('start_time') ?? ''
      const et = params.get('end_time') ?? ''
      if (st.length === 10 && et.length === 10 && HOURS.includes(st.slice(8)) && HOURS.includes(et.slice(8))) {
        return {
          scale: '3-hourly',
          subMode: 'range',
          startDate: apiDateToIso(st.slice(0, 8)),
          endDate: apiDateToIso(et.slice(0, 8)),
          startHour: st.slice(8),
          hour: et.slice(8),
        }
      }
    }
    if (dateMode === 'list') {
      const rows = (params.get('times') ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(t => t.length === 10 && HOURS.includes(t.slice(8)))
        .map(t => ({ date: apiDateToIso(t.slice(0, 8)), hour: t.slice(8) }))
      if (rows.length) return { scale: '3-hourly', subMode: 'list', customTimes: rows }
    }
    if ((dateMode === 'single' || !dateMode) && date && hour && HOURS.includes(hour)) {
      return { scale: '3-hourly', subMode: 'single', date: apiDateToIso(date), hour }
    }
  }
  if (params.get('time_scale') === 'daily') {
    if (dateMode === 'range') {
      const start = params.get('start_date')
      const end = params.get('end_date')
      if (start && end) {
        return { scale: 'daily', subMode: 'range', startDate: apiDateToIso(start), endDate: apiDateToIso(end) }
      }
    }
    if (dateMode === 'list' && dates) {
      const list = dates.split(',').map(s => s.trim()).filter(Boolean)
      if (list.length) return { scale: 'daily', subMode: 'list', customDates: list.map(apiDateToIso) }
    }
    if ((dateMode === 'single' || !dateMode) && date) {
      return { scale: 'daily', subMode: 'single', date: apiDateToIso(date) }
    }
  }
  if (params.get('time_scale') === 'monthly') {
    if (dateMode === 'range') {
      const start = params.get('start_month')
      const end = params.get('end_month')
      if (start && end) {
        return { scale: 'monthly', subMode: 'range', monthStart: apiMonthToIso(start), monthEnd: apiMonthToIso(end) }
      }
    }
    if (dateMode === 'list' && months) {
      const list = months.split(',').map(s => s.trim()).filter(Boolean)
      if (list.length) return { scale: 'monthly', subMode: 'list', customMonths: list.map(apiMonthToIso) }
    }
    const monthParam = params.get('month')
    if ((dateMode === 'single' || !dateMode) && monthParam) {
      return { scale: 'monthly', subMode: 'single', month: apiMonthToIso(monthParam) }
    }
  }

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
  if (!parsedDates.length) return undefined

  // Legacy hours=<not the synoptic set> always computed hours x dates — a
  // slice. Only 00/06/12/18 (in any order) means a daily composite.
  const hoursList = hours ? hours.split(',').map(s => s.trim()).filter(h => HOURS.includes(h)) : []
  const isSynopticSet =
    hoursList.length === 4 && ['00', '06', '12', '18'].every(h => hoursList.includes(h))
  if (hoursList.length && !isSynopticSet) {
    return { scale: '3-hourly', subMode: 'slice', customDates: parsedDates.map(apiDateToIso), hours: hoursList }
  }

  // Decision 2 (docs/TIME_SELECTION_PLAN.md): a bare date with no hour param
  // at all is a daily composite, matching the backend's legacy parse.
  const scale = hours || !hour ? 'daily' : '3-hourly'
  const validHour = hour && HOURS.includes(hour) ? hour : '00'

  if (parsedDates.length === 1) {
    const isoDate = apiDateToIso(parsedDates[0])
    return scale === 'daily'
      ? { scale, subMode: 'single', date: isoDate }
      : { scale, subMode: 'single', date: isoDate, hour: validHour }
  }
  if (scale === '3-hourly') {
    // Legacy multi-date + one hour always computed a same-hour slice, no
    // matter whether the UI called it Range or List. Load it as what it is.
    return { scale: '3-hourly', subMode: 'slice', customDates: parsedDates.map(apiDateToIso), hours: [validHour] }
  }
  if (dateMode === 'range' || isConsecutiveDates(parsedDates)) {
    return {
      scale,
      subMode: 'range',
      startDate: apiDateToIso(parsedDates[0]),
      endDate: apiDateToIso(parsedDates[parsedDates.length - 1]),
    }
  }
  return { scale, subMode: 'list', customDates: parsedDates.map(apiDateToIso) }
}

function firstDateFromTimeRecipe(time: TimeRecipe): string | undefined {
  if (time.scale !== '3-hourly' && time.scale !== 'daily') return undefined
  if (time.subMode === 'single') return time.date
  if (time.subMode === 'range') return time.startDate
  if (time.scale === '3-hourly' && time.subMode === 'list') return time.customTimes[0]?.date
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
  // Legacy precip list links (dates + one ending hour) parse as a slice now;
  // those meant a shared-hour list — restore that shape. Which tab depends on
  // which serializer wrote the link: the Daily panels send the hour via
  // 'hours' (24h windows), the old 3-hourly list sent it via 'hour'.
  // Canonical slices (time_scale present) are real precip slices and pass
  // through.
  if (!params.get('time_scale') && parsed.scale === '3-hourly' && parsed.subMode === 'slice') {
    const endHour = parsed.hours[0] ?? '00'
    if (params.get('hours')) {
      return params.get('date_mode') !== 'list' && parsed.customDates.length === 1
        ? { scale: 'daily', subMode: 'single', date: parsed.customDates[0], hour: endHour }
        : { scale: 'daily', subMode: 'list', customDates: parsed.customDates, hour: endHour }
    }
    return {
      scale: '3-hourly',
      subMode: 'list',
      customTimes: parsed.customDates.map(d => ({ date: d, hour: endHour })),
    }
  }
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
  const apiLevel = params.get('level') ?? (apiVariable === 'blank_map' ? '' : '850')
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
    wind: windStep === null && params.get('isotachs') !== '1' && !isWindApiVariable ? undefined : (() => {
      // An anomaly/normalized wind map is unreadable without glyphs: a link
      // that says nothing about wind defaults to glyphs on (#47). Barbs, like
      // everywhere else — vectors stay an explicit choice, not a default.
      // An explicit wind_step=0 stays a deliberate glyphs-off request.
      const anomalyWindDefault = isWindApiVariable && windStep === null
        && (parsedDisplayMode === 'anomaly' || parsedDisplayMode === 'normalized')
      return {
        on: windStepUsable || anomalyWindDefault,
        step: windStepUsable ? windStep! : AUTO_DENSITY,
        type: parsedWindType,
        isotachs: params.get('isotachs') === '1',
        isotachInterval: isotachInterval(params.get('isotach_interval')),
        shading: params.get('fill_mode') !== 'none',
      }
    })(),
    // Unit params are deliberately not parsed: links never choose display
    // units. The render paths add the visitor's own units before serializing.
    precipWindow: precipWindow(params.get('precip_window')),
    fillMode: params.get('fill_mode') === 'shaded' ? 'shaded' : undefined,
    centers: params.get('centers') === '1' ? true : undefined,
    contours: params.get('contours') ? params.get('contours')!.split(',').filter(c => ['pressure', 'height', 'temp'].includes(c)) : undefined,
    colorStep: parsedColorStep ? String(normalizeColorStep(parsedColorStep)) : undefined,
  }
}
