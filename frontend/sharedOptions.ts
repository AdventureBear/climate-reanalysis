export const HOURS = ['00', '03', '06', '09', '12', '15', '18', '21']

export function normalizeColorStep(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1
  return Math.max(1, Math.min(50, Math.round(parsed)))
}
