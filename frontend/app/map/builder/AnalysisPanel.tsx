// Analysis card: raw/anomaly/normalized selection and the Generate submit
// button with its composite-aware label. Wind glyph styling lives with the
// variable (VariableLevelPanel) — the map mode alone decides whether glyphs
// show actual or anomaly wind (#47).
import { dateRange, hoursBetween, monthRange, type DisplayMode } from '../../../mapRecipe'
import { CardRow, Section, TabStrip, VariableDisplayControl } from '../../../ui/controls'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function AnalysisPanel({ recipe, loading, className = '' }: {
  recipe: CompositeRecipeState
  loading: boolean
  className?: string
}) {
  const {
    isClimo, isMonthly,
    monthSubMode, monthStart, monthEnd, customMonths,
    dateSubMode, startDate, endDate, customDates,
    startHour, hour, listTimes, sliceHours,
    displayMode, setDisplayMode,
    apiVariable,
    rawOnlyVariable,
    isThreeHourly,
    precipTotalVariable,
  } = recipe

  function generateLabel(): string {
    if (loading) return 'Rendering…'
    if (isClimo) return 'Generate Climatology'
    if (isMonthly) {
      if (monthSubMode === 'range') {
        const n = monthRange(monthStart, monthEnd).length
        if (n > 1) return `Generate (${n} mo)`
      } else if (monthSubMode === 'list') {
        const n = customMonths.filter(Boolean).length
        if (n > 1) return `Generate (${n} mo)`
      }
    } else {
      const threeHourlyMembers = isThreeHourly && !precipTotalVariable
      if (dateSubMode === 'range' && startDate && endDate) {
        if (threeHourlyMembers) {
          const span = hoursBetween(startDate, startHour, endDate, hour)
          if (span !== null && span >= 0 && span % 3 === 0) {
            const n = span / 3 + 1
            if (n > 1) return `Generate (${n} intervals)`
          }
        } else if (precipTotalVariable) {
          // A precip range is an accumulation window; count hours, matching
          // the duration text next to the pickers.
          const span = hoursBetween(startDate, startHour, endDate, hour)
          if (span !== null && span > 0 && span % 3 === 0) return `Total (${span} hr)`
        } else if (startDate <= endDate) {
          const n = dateRange(startDate, endDate).length
          if (n > 1) return `Generate (${n} days)`
        }
      } else if (dateSubMode === 'list') {
        const usesRows = isThreeHourly
        const n = usesRows ? listTimes.filter(t => t.date).length : customDates.filter(Boolean).length
        if (n > 1) {
          if (precipTotalVariable) return `Total (${n} windows)`
          return usesRows ? `Generate (${n} intervals)` : `Generate (${n} dates)`
        }
      } else if (dateSubMode === 'slice') {
        const n = customDates.filter(Boolean).length * Math.max(sliceHours.length, 1)
        if (n > 1) return precipTotalVariable ? `Total (${n} windows)` : `Generate (${n} intervals)`
      }
    }
    return 'Generate Map'
  }

  return (
          <Section className={className}>
            <CardRow>
            <VariableDisplayControl label="Analysis">
            {isClimo ? (
              <TabStrip
                options={[{ value: 'climatology', label: 'Climatology Mean' }]}
                value="climatology"
                onChange={() => {}}
              />
            ) : (
              <TabStrip
                options={[
                  { value: 'raw',        label: 'Raw Data'   },
                  { value: 'anomaly',    label: 'Anomaly', disabled: rawOnlyVariable },
                  // PWAT uses the R2 daily 15-day mean/std path; other
                  // 3-hourly normalized maps still lack a usable sigma path.
                  { value: 'normalized', label: 'Normalized', disabled: rawOnlyVariable || (isThreeHourly && apiVariable !== 'precipitable_water') },
                ]}
                value={displayMode}
                onChange={v => setDisplayMode(v as DisplayMode)}
                fullWidth
              />
            )}
            </VariableDisplayControl>
            </CardRow>
            <CardRow>
            <VariableDisplayControl label="Render">
            <button type="submit" disabled={loading}
              className="w-full rounded bg-[#e17a35] px-3 py-1.5 text-xs font-bold tracking-wide text-orange-50 transition-colors hover:bg-[#f38a40] active:bg-[#c3672e] disabled:cursor-not-allowed disabled:opacity-50">
              {generateLabel()}
            </button>
            </VariableDisplayControl>
            </CardRow>
          </Section>
  )
}
