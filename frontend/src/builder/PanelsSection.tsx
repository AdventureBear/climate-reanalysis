// Placeholder card for the future multi-map panel layout feature.
import { GalleryHorizontalEnd } from 'lucide-react'
import { Label, Section, ToggleButton, VariableDisplayControl } from '../ui/controls'

export function PanelsSection() {
  return (
          <Section>
            <div className="flex items-center gap-2">
              <GalleryHorizontalEnd size={15} className="text-sky-400" />
              <Label>Panels</Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <VariableDisplayControl label="Add Map" status="Coming soon">
                <button type="button" disabled
                  className="w-full rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 cursor-not-allowed">
                  Add Current Map
                </button>
              </VariableDisplayControl>
              <VariableDisplayControl label="Layout" status="Coming soon">
                <div className="grid grid-cols-3 gap-1">
                  <ToggleButton active disabled onClick={() => {}}>Single</ToggleButton>
                  <ToggleButton active={false} disabled onClick={() => {}}>2-Up</ToggleButton>
                  <ToggleButton active={false} disabled onClick={() => {}}>4-Up</ToggleButton>
                </div>
              </VariableDisplayControl>
            </div>
          </Section>
  )
}
