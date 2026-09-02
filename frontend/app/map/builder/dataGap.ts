// Data-gap retry offers (#95). Pure logic, no imports: a failed composite's
// missing-member list becomes at most one offer — a truncated request for a
// trailing gap, or the same request with skip_missing=1 for a small
// mid-range gap. No offer otherwise.

// A composite failed because data is missing (#95). The backend names the
// missing members; the params are the request that failed, so a retry offer
// can be computed from them.
export type DataGap = { missing: string[]; total: number; params: Record<string, string> }

export type GapRetry = { label: string; question?: string; params: Record<string, string> }

const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
const isoMonth = (m: string) => `${m.slice(0, 4)}-${m.slice(4, 6)}`
const THREE_HOURLY_HOURS = ['00', '03', '06', '09', '12', '15', '18', '21']

function prettyDate(d: string) {
  const parsed = new Date(`${isoDate(d)}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return isoDate(d)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${isoDate(date)}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return date
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10).replace(/-/g, '')
}

function previousThreeHourlyRetry(params: Record<string, string>): GapRetry | null {
  if (!params.hour || params.hours) return null
  const idx = THREE_HOURLY_HOURS.indexOf(params.hour)
  if (idx < 0) return null
  const previousHour = THREE_HOURLY_HOURS[(idx - 1 + THREE_HOURLY_HOURS.length) % THREE_HOURLY_HOURS.length]
  const shiftsBackOneDate = params.hour === '00'
  const next: Record<string, string> = { ...params, hour: previousHour }

  if (shiftsBackOneDate) {
    if (params.dates) next.dates = params.dates.split(',').filter(Boolean).map(d => shiftDate(d, -1)).join(',')
    if (params.date) next.date = shiftDate(params.date, -1)
  }

  const dates = (next.dates ?? next.date ?? '').split(',').filter(Boolean).sort()
  const latestDate = dates[dates.length - 1]
  const timeLabel = latestDate ? `${prettyDate(latestDate)} ${previousHour}z` : `${previousHour}z`
  const question = dates.length > 1
    ? `Generate this map ending at ${timeLabel} instead?`
    : `Generate the map for ${timeLabel} instead?`
  return {
    label: `Generate ${timeLabel}`,
    question,
    params: next,
  }
}

function previousDailyRetry(params: Record<string, string>, dates: string[]): GapRetry | null {
  if (!params.hours || dates.length !== 1) return null
  const previousDate = shiftDate(dates[0], -1)
  const next: Record<string, string> = { ...params, date: previousDate, date_mode: 'single' }
  delete next.dates
  return {
    label: `Generate ${prettyDate(previousDate)}`,
    question: `Generate this map for ${prettyDate(previousDate)} instead?`,
    params: next,
  }
}

// Turn a data gap into at most one offer:
// - gap at the end of the range  -> a shorter request (honest title for free)
// - gap in the middle, <=5%      -> same request + skip_missing=1 (the map
//                                   discloses the skipped times in its margin)
// - anything else                -> no offer; the user adjusts the range
export function gapRetryFromGap(gap: DataGap | null): GapRetry | null {
  if (!gap || gap.missing.length === 0) return null
  const { missing, total, params } = gap

  if (/^\d{6}$/.test(missing[0])) {
    // Monthly composite: keep the months before the earliest missing one.
    const months = (params.months ?? '').split(',').filter(Boolean)
    const earliest = [...missing].sort()[0]
    const keep = months.filter(m => m < earliest)
    if (keep.length === 0 || keep.length === months.length) return null
    const label = keep.length === 1
      ? `Generate ${isoMonth(keep[0])} only`
      : `Generate ${isoMonth(keep[0])} – ${isoMonth(keep[keep.length - 1])}`
    return { label, params: { ...params, months: keep.join(',') } }
  }

  // Date-hour members ("20250722 12z").
  const dates = (params.dates ?? params.date ?? '').split(',').filter(Boolean)
  if (params.hour && !params.hours) {
    return previousThreeHourlyRetry(params)
  }
  if (dates.length <= 1) return previousDailyRetry(params, dates)
  const missingDates = new Set(missing.map(m => m.split(' ')[0]))
  const sorted = [...dates].sort()
  const earliestMissing = [...missingDates].sort()[0]
  // Trailing gap: everything from the earliest missing date onward is
  // missing (the "not published yet" tail — often several days). Offer the
  // range up to the last complete date.
  const suffix = sorted.filter(d => d >= earliestMissing)
  const isTrailing = suffix.every(d => missingDates.has(d)) && missingDates.size === suffix.length
  if (isTrailing) {
    const keep = sorted.filter(d => d < earliestMissing)
    if (keep.length === 0) return null
    const next: Record<string, string> = { ...params }
    if (keep.length === 1) {
      delete next.dates
      next.date = keep[0]
      next.date_mode = 'single'
    } else {
      next.dates = keep.join(',')
    }
    return { label: `Generate through ${isoDate(keep[keep.length - 1])}`, params: next }
  }
  if (missing.length / total <= 0.05) {
    const what = missing.length === 1
      ? `${isoDate(missing[0].split(' ')[0])} ${missing[0].split(' ')[1]}`
      : `${missing.length} missing times`
    return { label: `Generate without ${what}`, params: { ...params, skip_missing: '1' } }
  }
  return null
}
