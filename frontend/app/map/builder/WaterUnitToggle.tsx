import type { PrecipUnit, PwatUnit } from '../../../mapRecipe'
import { TabStrip, VariableDisplayControl } from '../../../ui/controls'

type WaterUnit = PwatUnit | PrecipUnit

export function WaterUnitToggle<T extends WaterUnit>({
  label,
  value,
  onChange,
}: {
  label: string
  value: T
  onChange: (value: T) => void
}) {
  return (
    <VariableDisplayControl label={label}>
      <TabStrip
        options={[
          { value: 'mm', label: 'mm' },
          { value: 'in', label: 'inches' },
        ]}
        value={value}
        onChange={v => onChange(v as T)}
        fullWidth
      />
    </VariableDisplayControl>
  )
}
