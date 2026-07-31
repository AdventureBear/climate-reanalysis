import type { CompositeRecipeState } from '../useCompositeRecipe'

export type WindLayerProps = {
  recipe: CompositeRecipeState
  /** Selectable glyph densities, widened to include a saved map's own value. */
  densityOptions: number[]
}
