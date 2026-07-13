// Analysis card: raw/anomaly/normalized selection, the anomaly-wind option,
// and the Generate submit button with its composite-aware label.
import { dateRange, monthRange, type DisplayMode, type WindAnomalyOverlay } from '../../../mapRecipe'
import { CardRow, Section, TabStrip, VariableDisplayControl } from '../../../ui/controls'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function AnalysisPanel({ recipe, loading }: { recipe: CompositeRecipeState; loading: boolean }) {
  const {
    isClimo, isMonthly,
    monthSubMode, monthStart, monthEnd, customMonths,
    dateSubMode, startDate, endDate, customDates,
    displayMode, setDisplayMode,
    rawOnlyVariable,
    canUseWindAnomalyOverlay,
    windAnomalyOverlay, setWindAnomalyOverlay,
    setWindOn,
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
                onChange={v => {
                  const next = v as DisplayMode
                  setDisplayMode(next)
                  if (next !== 'anomaly') setWindAnomalyOverlay('none')
                }}
                fullWidth
              />
            )}
            </VariableDisplayControl>
            </CardRow>
            {canUseWindAnomalyOverlay && (
              <CardRow>
                <VariableDisplayControl label="Anomaly Wind">
                  <TabStrip
                    options={[
                      { value: 'none', label: 'Shading' },
                      { value: 'vectors', label: 'Vectors' },
                      { value: 'barbs', label: 'Barbs' },
                    ]}
                    value={windAnomalyOverlay}
                    onChange={v => {
                      const next = v as WindAnomalyOverlay
                      setWindAnomalyOverlay(next)
                      if (next !== 'none') setWindOn(false)
                    }}
                    fullWidth
                  />
                </VariableDisplayControl>
              </CardRow>
            )}
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
