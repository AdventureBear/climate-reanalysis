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
  // Daily requests carry hours=00,06,12,18 in legacy form; canonical daily
  // singles carry time_scale=daily and no hours param.
  if ((!params.hours && params.time_scale !== 'daily') || dates.length !== 1) return null
  const previousDate = shiftDate(dates[0], -1)
  const next: Record<string, string> = { ...params, date: previousDate, date_mode: 'single' }
  delete next.dates
  return {
    label: `Generate ${prettyDate(previousDate)}`,
    question: `Generate this map for ${prettyDate(previousDate)} instead?`,
    params: next,
  }
}

// "20260721 21z" -> "2026072121", matching the canonical times token shape.
const labelToToken = (label: string) => label.replace(' ', '').replace('z', '')

function tokenMinus3h(token: string): string | null {
  const parsed = new Date(`${isoDate(token.slice(0, 8))}T${token.slice(8)}:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return null
  parsed.setUTCHours(parsed.getUTCHours() - 3)
  return parsed.toISOString().slice(0, 13).replace(/-/g, '').replace('T', '')
}

function monthMinusOne(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(4, 6))
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`
}

// Newest analysis that is conservatively past the 24-36h publication lag,
// floored to the 3-hour grid, as a YYYYMMDDHH token.
function newestLikelyAvailableToken(now = new Date()): string {
  const d = new Date(now.valueOf() - 36 * 3_600_000)
  d.setUTCHours(Math.floor(d.getUTCHours() / 3) * 3, 0, 0, 0)
  return d.toISOString().slice(0, 13).replace(/-/g, '').replace('T', '')
}

// Canonical 3-hourly range (start_time/end_time): truncate a trailing gap by
// pulling end_time back to just before the earliest missing member.
function canonicalRangeRetry(params: Record<string, string>, missing: string[], total: number): GapRetry | null {
  const missingTokens = new Set(missing.map(labelToToken))
  const earliest = [...missingTokens].sort()[0]

  // Every member missing: nothing to truncate to inside the range. If the
  // range sits at the publication edge, offer ending at the newest analysis
  // conservatively past the 24-36h lag. Older all-missing ranges are real
  // archive holes — no smart offer exists.
  if (missing.length === total) {
    const candidate = newestLikelyAvailableToken()
    if (candidate >= params.start_time && candidate < params.end_time) {
      return {
        label: `Generate through ${prettyDate(candidate.slice(0, 8))} ${candidate.slice(8)}z`,
        question: 'That range is inside the data publication lag. Generate through the newest available analysis instead?',
        params: { ...params, end_time: candidate },
      }
    }
    return null
  }
  // Trailing when everything from the earliest missing member to end_time is
  // missing: count the 3-hour steps in that suffix.
  const suffixSteps = (() => {
    let t: string | null = params.end_time
    let n = 0
    while (t && t >= earliest) {
      if (!missingTokens.has(t)) return null   // a present member inside the suffix
      n += 1
      t = tokenMinus3h(t)
    }
    return n
  })()
  if (suffixSteps === missingTokens.size) {
    const newEnd = tokenMinus3h(earliest)
    if (!newEnd || newEnd < params.start_time) return null
    return {
      label: `Generate through ${prettyDate(newEnd.slice(0, 8))} ${newEnd.slice(8)}z`,
      params: { ...params, end_time: newEnd },
    }
  }
  if (missing.length / total <= 0.05) {
    return { label: `Generate without ${missing.length} missing time${missing.length === 1 ? '' : 's'}`, params: { ...params, skip_missing: '1' } }
  }
  return null
}

// Canonical 3-hourly list (times): drop the missing members.
function canonicalListRetry(params: Record<string, string>, missing: string[]): GapRetry | null {
  const missingTokens = new Set(missing.map(labelToToken))
  const tokens = params.times.split(',').filter(Boolean)
  const keep = tokens.filter(t => !missingTokens.has(t))
  if (keep.length === 0 || keep.length === tokens.length) return null
  return {
    label: `Generate without ${tokens.length - keep.length} missing time${tokens.length - keep.length === 1 ? '' : 's'}`,
    params: { ...params, times: keep.join(',') },
  }
}

// Canonical 3-hourly slice (dates × hours): a trailing run of dates whose
// members are all missing truncates the dates list. Slice mode is kept even
// when one date remains — rewriting to date_mode=single would need an 'hour'
// param the slice shape does not carry.
function canonicalSliceRetry(params: Record<string, string>, missing: string[], total: number): GapRetry | null {
  const hoursCount = params.hours.split(',').filter(Boolean).length
  const missingPerDate = new Map<string, number>()
  for (const m of missing) {
    const date = m.split(' ')[0]
    missingPerDate.set(date, (missingPerDate.get(date) ?? 0) + 1)
  }
  const sorted = params.dates.split(',').filter(Boolean).sort()
  let cut = sorted.length
  while (cut > 0 && missingPerDate.get(sorted[cut - 1]) === hoursCount) cut -= 1
  const keep = sorted.slice(0, cut)
  const trailingMembers = (sorted.length - cut) * hoursCount
  // Trailing only when every missing member sits in the dropped dates.
  if (keep.length > 0 && keep.length < sorted.length && trailingMembers === missing.length) {
    return { label: `Generate through ${isoDate(keep[keep.length - 1])}`, params: { ...params, dates: keep.join(',') } }
  }
  if (missing.length < total && missing.length / total <= 0.05) {
    return { label: `Generate without ${missing.length} missing time${missing.length === 1 ? '' : 's'}`, params: { ...params, skip_missing: '1' } }
  }
  return null
}

// Canonical daily range (start_date/end_date): trailing gap pulls end_date
// back to the last complete date.
function canonicalDailyRangeRetry(params: Record<string, string>, missing: string[], total: number): GapRetry | null {
  const missingDates = new Set(missing.map(m => m.split(' ')[0]))
  const earliest = [...missingDates].sort()[0]
  let d = params.end_date
  let trailingDays = 0
  while (d >= earliest) {
    if (!missingDates.has(d)) break
    trailingDays += 1
    d = shiftDate(d, -1)
  }
  if (trailingDays === missingDates.size) {
    const newEnd = shiftDate(earliest, -1)
    if (newEnd < params.start_date) return null
    return { label: `Generate through ${isoDate(newEnd)}`, params: { ...params, end_date: newEnd } }
  }
  if (missing.length / total <= 0.05) {
    return { label: `Generate without ${missing.length} missing times`, params: { ...params, skip_missing: '1' } }
  }
  return null
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
    // Canonical monthly range: pull end_month back before the earliest gap.
    if (params.start_month && params.end_month) {
      const earliest = [...missing].sort()[0]
      const newEnd = monthMinusOne(earliest)
      if (newEnd < params.start_month) return null
      return {
        label: `Generate through ${isoMonth(newEnd)}`,
        params: { ...params, end_month: newEnd },
      }
    }
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

  // Canonical shapes carry their own retry logic.
  if (params.start_time && params.end_time) return canonicalRangeRetry(params, missing, total)
  if (params.times) return canonicalListRetry(params, missing)
  if (params.time_scale === 'daily' && params.start_date && params.end_date) {
    return canonicalDailyRangeRetry(params, missing, total)
  }
  if (params.time_scale === '3-hourly' && params.date_mode === 'slice' && params.dates && params.hours) {
    return canonicalSliceRetry(params, missing, total)
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
