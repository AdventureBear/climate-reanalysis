import type { TimeScale } from '../mapRecipe'
import { TabStrip } from '../ui/controls'
import type { CompositeRecipeState } from './useCompositeRecipe'

// `header` renders the compact fixed-height variant that lines up with the
// other nav-bar controls; the default stretches to fill panel layouts.
export function TimeScaleControls({ recipe, header = false }: { recipe: CompositeRecipeState; header?: boolean }) {
  const { timeScale, setTimeScale, monthlyUnavailable, rawOnlyVariable } = recipe
    return (
      <TabStrip
        options={[
          { value: '3-hourly',    label: '3-Hourly' },
          { value: 'daily',       label: 'Daily' },
          { value: 'monthly',     label: 'Monthly', disabled: monthlyUnavailable },
          { value: 'climatology', label: 'Climatology', disabled: rawOnlyVariable },
        ]}
        value={timeScale}
        onChange={v => setTimeScale(v as TimeScale)}
        fullWidth={!header}
        className={header ? 'h-7 shrink-0' : ''}
      />
    )
  }
