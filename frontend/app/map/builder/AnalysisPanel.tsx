// Analysis card: raw/anomaly/normalized selection and the Generate submit
// button with its composite-aware label. Wind glyph styling lives with the
// variable (VariableLevelPanel) — the map mode alone decides whether glyphs
// show actual or anomaly wind (#47).
import { dateRange, monthRange, type DisplayMode } from '../../../mapRecipe'
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
    displayMode, setDisplayMode,
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
        if (n > 1) return `Composite (${n} mo)`
      } else if (monthSubMode === 'list') {
        const n = customMonths.filter(Boolean).length
        if (n > 1) return `Composite (${n} mo)`
      }
    } else {
      if (dateSubMode === 'range' && startDate && endDate && startDate <= endDate) {
        const n = dateRange(startDate, endDate).length
        if (n > 1) return precipTotalVariable ? `Total (${n} days)` : `Composite (${n} days)`
      } else if (dateSubMode === 'list') {
        const n = customDates.filter(Boolean).length
        if (n > 1) return precipTotalVariable ? `Total (${n} dates)` : `Composite (${n} dates)`
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
                  // A 3-hourly map has no standard deviation to divide by:
                  // its baseline is the normal for that one hour (#72).
                  { value: 'normalized', label: 'Normalized', disabled: rawOnlyVariable || isThreeHourly },
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
