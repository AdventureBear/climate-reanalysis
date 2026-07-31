// The wind-layer controls, picked by layout variant (#45 split test).
//
// Registry, not a branch: adding a third variant means adding one entry and
// one string to WIND_LAYOUTS. Both variants read and write the same recipe
// state, so switching layout mid-session never changes the map.
import { WIND_DENSITIES, AUTO_DENSITY } from '../../../../mapRecipe'
import { useWindLayout, type WindLayout } from '../../../../lib/windLayout'
import type { CompositeRecipeState } from '../useCompositeRecipe'
import type { WindLayerProps } from './types'
import { WindLayerSwitches } from './WindLayerSwitches'
import { WindLayerButtons } from './WindLayerButtons'

const VARIANTS: Record<WindLayout, (props: WindLayerProps) => React.JSX.Element> = {
  switches: WindLayerSwitches,
  buttons: WindLayerButtons,
}

export function WindLayerControls({ recipe }: { recipe: CompositeRecipeState }) {
  const Variant = VARIANTS[useWindLayout()]
  // A saved map may carry a density outside the standard list (the control
  // used to be a free number input); keep it selectable rather than blank.
  const step = Number(recipe.windStep)
  const densityOptions = WIND_DENSITIES.includes(step) || recipe.windStep === AUTO_DENSITY
    ? WIND_DENSITIES
    : [...WIND_DENSITIES, step].sort((a, b) => a - b)

  return <Variant recipe={recipe} densityOptions={densityOptions} />
}
