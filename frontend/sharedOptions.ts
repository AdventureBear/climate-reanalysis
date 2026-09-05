export const HOURS = ['00', '03', '06', '09', '12', '15', '18', '21']

export function normalizeColorStep(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(50, Math.round(parsed)))
}

/** Human-readable names for the climatology baselines (#128).
 *
 * The internal keys name file layouts rather than datasets, and are load-bearing
 * in URLs and saved recipes, so they stay as they are. These are what a reader
 * should see. `monthly-pgb` is CORe's own monthly means, the only baseline that
 * comes from the same dataset as the observations. */
export const CLIMO_SOURCE_LABELS: Record<string, string> = {
  'monthly-pgb': 'CORe monthly',
  'r2-monthly': 'R2 monthly',
  'r2-daily': 'R2 daily',
  'r2-daily-15day': 'R2 daily 15-day',
  'core-3hourly': 'CORe 3-hourly ±5d',
  'r1-4xdaily': 'R1 hourly',
  'cfsr-daily': 'CFSR daily',
}

/** User copy for a link that asked for the CORe monthly baseline where none
 * exists. Mirrors backend climo_policy at the level a reader needs — which
 * baseline family replaced the request; the map sub-title stays authoritative
 * for the exact source (PWAT and synoptic-composite edges land on R2). */
export function coreSubstitutionMessage(time: { scale: string } | undefined, variable: string | undefined): string {
  const body =
    time?.scale === 'daily'
      ? 'This map requires daily baselines, so R2 was used instead.'
      : time?.scale === '3-hourly'
        ? variable === 'precipitable_water'
          ? 'This map requires sub-monthly baselines, so an R2 daily baseline was used instead.'
          : 'This map requires hourly baselines, so R1 was used instead.'
        : 'This variable has no CORe monthly baseline, so R2 was used instead.'
  return `This link asked for the CORe monthly baseline, which exists only for monthly pressure-level maps. ${body} The baseline used is identified in the map’s sub-title.`
}
