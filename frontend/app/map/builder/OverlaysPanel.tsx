// Overlays card: the wind controls, H/L centers, and contour overlays. On a
// wind-variable map the wind controls style the map's own wind; the map mode
// picks the glyph quantity (raw → actual wind, anomaly → anomaly wind, #47).
//
// The wind block has two layouts under split test (#45); it lives in
// windLayers/ and picks itself. Do not inline wind controls here again.
import { SlidersHorizontal } from 'lucide-react'
import { Label, Section, ToggleButton, VariableDisplayControl } from '../../../ui/controls'
import { WindLayerControls } from './windLayers'
import type { CompositeRecipeState } from './useCompositeRecipe'

export function OverlaysPanel({ recipe }: { recipe: CompositeRecipeState }) {
  const { hlCenters, setHlCenters, contourOverlays, setContourOverlays, apiVariable } = recipe

  return (
          <Section>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-sky-400" />
              <Label>Overlays</Label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <WindLayerControls recipe={recipe} />
              <VariableDisplayControl label="Contours">
                <div className="grid grid-cols-2 gap-1">
                  <ToggleButton active={hlCenters} onClick={() => setHlCenters(o => !o)}>H/L Centers</ToggleButton>
                  {([
                    { key: 'pressure', label: 'Pressure', redundant: apiVariable === 'surface_pressure' },
                    { key: 'height', label: 'Height', redundant: apiVariable === 'height' },
                    { key: 'temp', label: 'Temp', redundant: apiVariable === 'temp' || apiVariable === 'temp_2m' },
                  ] as const).map(({ key, label, redundant }) => (
                    <ToggleButton
                      key={key}
                      active={contourOverlays.includes(key)}
                      disabled={redundant}
                      onClick={() => setContourOverlays(prev =>
                        prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])}
                    >
                      {label}
                    </ToggleButton>
                  ))}
                </div>
              </VariableDisplayControl>
            </div>
          </Section>
  )
}
