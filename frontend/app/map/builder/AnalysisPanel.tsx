// Analysis card: raw/anomaly/normalized selection and the Generate submit
// button with its composite-aware label. Wind glyph styling lives with the
// variable (VariableLevelPanel) — the map mode alone decides whether glyphs
// show actual or anomaly wind (#47).
import { dateRange, monthRange, type DisplayMode } from '../../../mapRecipe'
import { CardRow, Section, TabStrip, VariableDisplayControl } from '../../../ui/controls'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function AnalysisPanel({ recipe, loading }: { recipe: CompositeRecipeState; loading: boolean }) {
  const {
    isClimo, isMonthly,
    monthSubMode, monthStart, monthEnd, customMonths,
    dateSubMode, startDate, endDate, customDates,
    displayMode, setDisplayMode,
    rawOnlyVariable,
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
        if (n > 1) return `Composite (${n} days)`
      } else if (dateSubMode === 'list') {
        const n = customDates.filter(Boolean).length
        if (n > 1) return `Composite (${n} dates)`
      }
    }
    return 'Generate Map'
  }

  return (
          <Section>
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
                  { value: 'normalized', label: 'Normalized', disabled: rawOnlyVariable },
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
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 font-bold text-xs tracking-wide cursor-pointer transition-colors w-full">
              {generateLabel()}
            </button>
            </VariableDisplayControl>
            </CardRow>
          </Section>
  )
}
