// Small presentational primitives shared across the Composite Builder.
// These are dumb components: no data fetching, no recipe knowledge.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { HOURS } from '../sharedOptions'
import type { SelectOption } from '../variableConfig'

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest select-none">
      {children}
    </span>
  )
}

// On/off switch. Use where a setting is a layer that is either drawn or not,
// and the row it sits on carries the label.
export function Switch({ checked, onChange, disabled = false, label }: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={onChange} disabled={disabled}
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed bg-slate-700' : `cursor-pointer ${checked ? 'bg-sky-600' : 'bg-slate-600'}`
      }`}>
      <span className={`inline-block h-4 w-4 transform rounded-full shadow transition-transform ${
        disabled ? 'bg-slate-500' : 'bg-white'
      } ${checked ? 'translate-x-3' : 'translate-x-0'}`} />
    </button>
  )
}

// Connected horizontal tab strip — pass fullWidth to stretch across the parent
export function TabStrip({ options, value, onChange, fullWidth = false, disabled = false, className = '' }: {
  options: { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (v: string) => void
  fullWidth?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={`flex rounded overflow-hidden border border-slate-600 text-xs font-medium ${fullWidth ? 'w-full' : 'w-fit'} ${className}`}>
      {options.map(opt => {
        const optionDisabled = disabled || Boolean(opt.disabled)
        return (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)} disabled={optionDisabled}
          className={`${fullWidth ? 'flex-1 text-center' : ''} inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 transition-colors ${
            optionDisabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
          } ${
            value === opt.value
              ? 'bg-sky-700 text-white'
              : `bg-slate-800 text-slate-300 ${optionDisabled ? '' : 'hover:bg-slate-700'}`
          }`}>
          {opt.label}
        </button>
        )
      })}
    </div>
  )
}

export function VariableDisplayControl({
  label,
  status,
  children,
}: {
  label: string
  status?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[50px] flex-col gap-1">
      <div className="flex h-4 items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className={`text-[10px] leading-none text-slate-500 ${status ? '' : 'invisible'}`}>
          {status || 'Ready'}
        </span>
      </div>
      {children}
    </div>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  className = 'input w-full',
  wrapperClassName = 'flex flex-col gap-1',
}: {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  className?: string
  wrapperClassName?: string
}) {
  const groups = Array.from(new Set(options.map(option => option.group).filter(Boolean)))
  const ungroupedOptions = options.filter(option => !option.group)

  return (
    <div className={wrapperClassName}>
      {label && <Label>{label}</Label>}
      <select value={value} onChange={e => onChange(e.target.value)} className={className}>
        {ungroupedOptions.map(option => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {groups.map(group => (
          <optgroup key={group} label={group}>
            {options.filter(option => option.group === group).map(option => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

export function ToggleButton({
  active,
  disabled = false,
  children,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
        disabled
          ? 'cursor-not-allowed bg-slate-800 text-slate-600'
          : active
            ? 'cursor-pointer bg-sky-700 text-white'
            : 'cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

// ‹ 00z › stepper — cycles through HOURS array
export function HourStepper({ hour, setHour, compact = false }: { hour: string; setHour: (h: string) => void; compact?: boolean }) {
  const idx = HOURS.indexOf(hour)
  const prev = () => setHour(HOURS[(idx - 1 + HOURS.length) % HOURS.length])
  const next = () => setHour(HOURS[(idx + 1) % HOURS.length])
  // h-[34px] matches the .input class's computed height (text-sm line +
  // py-1.5 + border), so the stepper sits flush beside date inputs.
  return (
    <div className="flex h-[34px] items-stretch rounded overflow-hidden border border-slate-600 shrink-0">
      <button type="button" onClick={prev}
        className={`${compact ? 'px-1' : 'px-1.5'} flex items-center bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors`}>
        <ChevronLeft size={compact ? 11 : 13} />
      </button>
      <span className={`${compact ? 'min-w-[2.35rem] px-1.5' : 'min-w-[3rem] px-2.5'} flex flex-1 items-center justify-center bg-slate-800 text-xs font-mono text-slate-200 select-none`}>
        {hour}z
      </span>
      <button type="button" onClick={next}
        className={`${compact ? 'px-1' : 'px-1.5'} flex items-center bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors`}>
        <ChevronRight size={compact ? 11 : 13} />
      </button>
    </div>
  )
}

export function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full self-start bg-slate-900 border border-slate-700/60 rounded-xl px-4 pt-4 pb-5 flex flex-col gap-3 ${className}`}>
      {children}
    </div>
  )
}

export function CardRow({ children = null, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-[50px] ${className}`}>
      {children}
    </div>
  )
}
