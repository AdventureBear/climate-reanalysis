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
  'r1-4xdaily': 'R1 hourly',
  'cfsr-daily': 'CFSR daily',
}
