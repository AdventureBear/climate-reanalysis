// Temporal Range card: date/month mode selection and the matching inputs for
// every time scale (3-hourly, daily, monthly, climatology).
import { Fragment, useState } from 'react'
import { ChevronDown, Plus, RotateCcw, X } from 'lucide-react'
import {
  CORE_ARCHIVE_START_DATE,
  CORE_ARCHIVE_START_MONTH,
  MAX_COMPOSITE_DATES,
  dateRange,
  dateRangeAvailabilityMessage,
  futureObservationDateMessage,
  monthlyAvailabilityMessage,
  monthRange,
  newestAllowedObservationMonth,
  newestAllowedObservationDate,
  type SubMode,
} from '../../../mapRecipe'
import { CardRow, HourStepper, Label, Section, SelectField, TabStrip, VariableDisplayControl } from '../../../ui/controls'
import { HOURS } from '../../../sharedOptions'
import { defaultDate, type CompositeRecipeState } from './useCompositeRecipe'

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const subModeOpts = [
    { value: 'single', label: 'Single' },
    { value: 'range',  label: 'Range'  },
    { value: 'list',   label: 'List'   },
]

// Slice (hours x dates) is a 3-hourly-only concept; daily/monthly and the
// precip_total panels never offer the tab.
const threeHourlySubModeOpts = [
    ...subModeOpts,
    { value: 'slice',  label: 'Slice'  },
]

function dateHourToUtc(date: string, hour: string) {
  const parsed = new Date(`${date}T${hour}:00:00Z`)
  return Number.isNaN(parsed.valueOf()) ? null : parsed
}

function rangeHours(startDate: string, startHour: string, endDate: string, endHour: string) {
  const start = dateHourToUtc(startDate, startHour)
  const end = dateHourToUtc(endDate, endHour)
  if (!start || !end) return null
  return (end.valueOf() - start.valueOf()) / 3_600_000
}

function formatDuration(hours: number | null) {
  if (!hours || hours <= 0) return ''
  if (hours % 24 === 0) return `${hours / 24}d`
  return `${hours}h`
}

function formatPrecipRangeDuration(startDate: string, startHour: string, endDate: string, endHour: string) {
  return formatDuration(rangeHours(startDate, startHour, endDate, endHour))
}

// Stepping an hour past midnight rolls its paired date: 21z → 00z advances a
// day, 00z → 21z goes back one. Null = no roll needed.
function rolledDate(prevHour: string, nextHour: string, isoDate: string): string | null {
  const step = prevHour === '21' && nextHour === '00' ? 1 : prevHour === '00' && nextHour === '21' ? -1 : 0
  if (!step || !isoDate) return null
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.valueOf())) return null
  d.setUTCDate(d.getUTCDate() + step)
  return d.toISOString().slice(0, 10)
}

// Header cell for the label row of a date/hour grid: same height as the
// card's own label line (h-4), so total card height is unchanged.
function HeaderCell({ children }: { children?: React.ReactNode }) {
  return <div className="flex h-4 items-center">{children ? <Label>{children}</Label> : null}</div>
}

// Slice's hour picker: a stepper-sized button opening a toggle menu — click
// an hour to select/deselect, selection shown by color. The at-least-one-hour
// rule lives in the caller's onToggle.
function HourMultiSelect({ selected, onToggle }: { selected: string[]; onToggle: (h: string) => void }) {
  const [open, setOpen] = useState(false)
  const label = selected.length === 1 ? `${selected[0]}z` : `${selected.length} hrs`
  return (
    <div className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex h-[34px] w-full items-center rounded border border-slate-600 bg-slate-800 px-2 text-xs font-mono text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors">
        {/* Invisible twin of the right chevron: balances the row so the
            label centers exactly like the stepper's hour text. */}
        <ChevronDown size={11} className="invisible" />
        <span className="flex-1 text-center">{label}</span>
        <ChevronDown size={11} className="text-slate-400" />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close hour menu" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[36px] z-40 w-24 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl">
            {HOURS.map(h => (
              <button key={h} type="button" onClick={() => onToggle(h)}
                className={`w-full rounded px-2 py-1 text-left text-xs font-mono cursor-pointer transition-colors ${
                  selected.includes(h) ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-800'
                }`}>
                {h}z
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function DateInput({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className: string
}) {
  const maxDate = newestAllowedObservationDate()
  const availabilityTitle = `${dateRangeAvailabilityMessage()} ${futureObservationDateMessage()}`
  const invalidMessage = (input: HTMLInputElement) => {
    if (input.validity.rangeUnderflow) return dateRangeAvailabilityMessage()
    if (input.validity.rangeOverflow) return futureObservationDateMessage()
    return availabilityTitle
  }
  return (
    <input
      type="date"
      value={value}
      min={CORE_ARCHIVE_START_DATE}
      max={maxDate}
      title={availabilityTitle}
      aria-label={availabilityTitle}
      onInvalid={e => e.currentTarget.setCustomValidity(invalidMessage(e.currentTarget))}
      onInput={e => e.currentTarget.setCustomValidity('')}
      onChange={e => {
        e.currentTarget.setCustomValidity('')
        onChange(e.target.value)
      }}
      className={className}
    />
  )
}

function MonthInput({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className: string
}) {
  const maxMonth = newestAllowedObservationMonth()
  const availabilityTitle = monthlyAvailabilityMessage()
  return (
    <input
      type="month"
      value={value}
      min={CORE_ARCHIVE_START_MONTH}
      max={maxMonth}
      title={availabilityTitle}
      aria-label={availabilityTitle}
      onInvalid={e => e.currentTarget.setCustomValidity(availabilityTitle)}
      onInput={e => e.currentTarget.setCustomValidity('')}
      onChange={e => {
        e.currentTarget.setCustomValidity('')
        onChange(e.target.value)
      }}
      className={className}
    />
  )
}

export function TemporalPanel({ recipe, isVertical }: { recipe: CompositeRecipeState; isVertical: boolean }) {
  const {
    isClimo, isMonthly, isThreeHourly,
    precipTotalVariable,
    dateSubMode, setDateSubMode,
    monthSubMode, setMonthSubMode,
    climoMonth, setClimoMonth,
    month, setMonth,
    monthStart, setMonthStart,
    monthEnd, setMonthEnd,
    customMonths, setCustomMonths,
    date, setDate,
    startDate, setStartDate,
    endDate, setEndDate,
    startHour, setStartHour,
    hour, setHour,
    customDates, setCustomDates,
    sliceHours, setSliceHours,
    listTimes, setListTimes,
    syncRangeStart,
  } = recipe

  function toggleSliceHour(h: string) {
    setSliceHours(prev => {
      if (prev.includes(h)) {
        // At least one hour stays selected.
        return prev.length > 1 ? prev.filter(x => x !== h) : prev
      }
      return HOURS.filter(x => prev.includes(x) || x === h)  // keep chip order
    })
  }

  function renderTemporalModeControls() {
    if (isClimo) {
      return (
        <TabStrip
          options={[{ value: 'climatology', label: 'Climatology Month' }]}
          value="climatology"
          onChange={() => {}}
          fullWidth
        />
      )
    }
    if (isMonthly) {
      return <TabStrip options={subModeOpts} value={monthSubMode} onChange={v => setMonthSubMode(v as SubMode)} fullWidth />
    }
    const opts = isThreeHourly && !precipTotalVariable ? threeHourlySubModeOpts : subModeOpts
    return <TabStrip options={opts} value={dateSubMode} onChange={v => setDateSubMode(v as SubMode)} fullWidth />
  }

  function renderTemporalInputs() {
    if (isClimo) {
      return (
        <SelectField
          value={climoMonth}
          options={MONTH_OPTIONS}
          onChange={setClimoMonth}
          className="input"
          wrapperClassName="contents"
        />
      )
    }

    if (isMonthly) {
      return (
        <>
          {monthSubMode === 'single' && (
            <MonthInput value={month} onChange={setMonth} className="input" />
          )}
          {monthSubMode === 'range' && (
            <div className="flex gap-1.5 items-center flex-wrap">
              <MonthInput value={monthStart} onChange={setMonthStart} className="input" />
              <span className="text-slate-600 text-xs">→</span>
              <MonthInput value={monthEnd} onChange={setMonthEnd} className="input" />
              <span className="text-slate-500 text-xs">{monthRange(monthStart, monthEnd).length} mo</span>
            </div>
          )}
          {monthSubMode === 'list' && (
            <div className="flex flex-col gap-1.5">
              {customMonths.map((m, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <MonthInput
                    value={m}
                    onChange={value => setCustomMonths(prev => prev.map((x, j) => j === i ? value : x))}
                    className="input flex-1"
                  />
                  <button type="button" disabled={customMonths.length === 1}
                    onClick={() => setCustomMonths(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 text-sky-400 hover:text-sky-300 disabled:opacity-20 cursor-pointer transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => setCustomMonths(prev => [...prev, newestAllowedObservationMonth()])}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
                <Plus size={12} /> Add Month
              </button>
            </div>
          )}
        </>
      )
    }

    if (precipTotalVariable && dateSubMode === 'single') {
      return (
        <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
          <HeaderCell>Date</HeaderCell>
          <HeaderCell>Hour</HeaderCell>
          <HeaderCell />
          <DateInput value={date} onChange={setDate} className="input min-w-0" />
          <HourStepper
            hour={hour}
            setHour={h => {
              const rolled = rolledDate(hour, h, date)
              if (rolled) setDate(rolled)
              setHour(h)
            }}
            compact={isVertical}
          />
          <span />
        </div>
      )
    }

    if (precipTotalVariable && dateSubMode === 'range') {
      const duration = formatPrecipRangeDuration(startDate, startHour, endDate, hour)
      return (
        <div className="flex flex-col gap-1.5">
          <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
            <HeaderCell>Date</HeaderCell>
            <HeaderCell>Hour</HeaderCell>
            <HeaderCell />
            <DateInput value={startDate} onChange={setStartDate} className="input min-w-0" />
            <HourStepper
              hour={startHour}
              setHour={h => {
                const rolled = rolledDate(startHour, h, startDate)
                if (rolled) setStartDate(rolled)
                setStartHour(h)
              }}
              compact={isVertical}
            />
            <span className="text-slate-600 text-xs select-none">Start</span>
            <DateInput
              value={endDate}
              onChange={value => {
                setEndDate(value)
                setDate(value)
              }}
              className="input min-w-0"
            />
            <HourStepper
              hour={hour}
              setHour={h => {
                const rolled = rolledDate(hour, h, endDate)
                if (rolled) {
                  setEndDate(rolled)
                  setDate(rolled)
                }
                setHour(h)
              }}
              compact={isVertical}
            />
            <span className="text-slate-600 text-xs select-none">End</span>
          </div>
          <span className="min-h-[16px] text-slate-500 text-xs">{duration}</span>
        </div>
      )
    }

    if (precipTotalVariable && dateSubMode === 'list') {
      return (
        <div className="flex flex-col gap-1.5">
          {/* Same shared grid as List/Slice. One ending hour applies to every
              date, so the stepper sits on the first row only. */}
          <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
            <HeaderCell>Date</HeaderCell>
            <HeaderCell>Hour</HeaderCell>
            <HeaderCell />
            {customDates.map((d, i) => (
              <Fragment key={i}>
                <DateInput
                  value={d}
                  onChange={value => setCustomDates(prev => prev.map((x, j) => j === i ? value : x))}
                  className="input min-w-0"
                />
                {i === 0 ? (
                  <HourStepper hour={hour} setHour={setHour} compact={isVertical} />
                ) : <span />}
                <button type="button" disabled={customDates.length === 1}
                  onClick={() => setCustomDates(prev => prev.filter((_, j) => j !== i))}
                  className="p-1 text-sky-400 hover:text-sky-300 disabled:opacity-20 cursor-pointer transition-colors">
                  <X size={13} />
                </button>
              </Fragment>
            ))}
          </div>
          <button type="button"
            onClick={() => setCustomDates(prev => [...prev, defaultDate()])}
            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
            <Plus size={12} /> Add Date
          </button>
        </div>
      )
    }

    // 3-hourly or daily
    return (
      <>
        {dateSubMode === 'single' && isThreeHourly && (
          <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
            <HeaderCell>Date</HeaderCell>
            <HeaderCell>Hour</HeaderCell>
            <HeaderCell />
            <DateInput value={date} onChange={setDate} className="input min-w-0" />
            <HourStepper
              hour={hour}
              setHour={h => {
                const rolled = rolledDate(hour, h, date)
                if (rolled) setDate(rolled)
                setHour(h)
              }}
              compact={isVertical}
            />
            <span />
            <div className="col-span-3 flex items-center">
              <button type="button" onClick={syncRangeStart}
                title="Set Range's start date to this date"
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
                <RotateCcw size={12} /> Sync range start
              </button>
            </div>
          </div>
        )}
        {dateSubMode === 'single' && !isThreeHourly && (
          <div className={`${isVertical ? 'gap-1' : 'gap-2'} flex min-w-0 flex-col gap-1.5`}>
            <DateInput value={date} onChange={setDate} className="input min-w-0 w-full" />
            <div className="flex items-center">
              <button type="button" onClick={syncRangeStart}
                title="Set Range's start date to this date"
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
                <RotateCcw size={12} /> Sync range start
              </button>
            </div>
          </div>
        )}
        {dateSubMode === 'range' && isThreeHourly && (
          // A continuous span: start date+hour through end date+hour,
          // the same layout as the precip_total range above. The interval
          // count lives on the Generate button; this space is for feedback
          // when the range is invalid.
          <div className="flex flex-col gap-1.5">
            <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
              <HeaderCell>Date</HeaderCell>
              <HeaderCell>Hour</HeaderCell>
              <HeaderCell />
              <DateInput value={startDate} onChange={setStartDate} className="input min-w-0" />
              <HourStepper
                hour={startHour}
                setHour={h => {
                  const rolled = rolledDate(startHour, h, startDate)
                  if (rolled) setStartDate(rolled)
                  setStartHour(h)
                }}
                compact={isVertical}
              />
              <span className="text-slate-600 text-xs select-none">Start</span>
              <DateInput value={endDate} onChange={setEndDate} className="input min-w-0" />
              <HourStepper
                hour={hour}
                setHour={h => {
                  const rolled = rolledDate(hour, h, endDate)
                  if (rolled) setEndDate(rolled)
                  setHour(h)
                }}
                compact={isVertical}
              />
              <span className="text-slate-600 text-xs select-none">End</span>
            </div>
            {(() => {
              // Always-rendered line: interval count, or (same quiet gray)
              // what's wrong — content changes, layout doesn't.
              const span = rangeHours(startDate, startHour, endDate, hour)
              const intervals = span === null || span % 3 !== 0 ? null : span / 3 + 1
              const text = intervals === null
                ? ''
                : span! < 0
                  ? 'End time must be later than the start time.'
                  : intervals > MAX_COMPOSITE_DATES * 4
                    ? `Ranges are limited to ${MAX_COMPOSITE_DATES * 4} fetches (${Math.floor((MAX_COMPOSITE_DATES * 4) / 8)} days)`
                    : `${intervals} 3-hr intervals`
              return <span className="min-h-[16px] text-slate-500 text-xs">{text}</span>
            })()}
          </div>
        )}
        {dateSubMode === 'range' && !isThreeHourly && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center flex-wrap">
              <DateInput value={startDate} onChange={setStartDate} className="input min-w-0" />
              <span className="text-slate-600 text-xs">→</span>
              <DateInput value={endDate} onChange={setEndDate} className="input min-w-0" />
              {startDate && endDate && startDate <= endDate && (() => {
                const n = dateRange(startDate, endDate).length
                return (
                  <span className="text-slate-500 text-xs">
                    {n > MAX_COMPOSITE_DATES
                      ? `Ranges are limited to ${MAX_COMPOSITE_DATES * 4} fetches (${MAX_COMPOSITE_DATES} days)`
                      : `${n}d`}
                  </span>
                )
              })()}
            </div>
          </div>
        )}
        {dateSubMode === 'list' && isThreeHourly && (
          // Each row is one (date, hour) member; one grid keeps the header
          // and every row's columns aligned.
          <div className="flex flex-col gap-1.5">
            <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
              <HeaderCell>Date</HeaderCell>
              <HeaderCell>Hour</HeaderCell>
              <HeaderCell />
              {listTimes.map((t, i) => (
                <Fragment key={i}>
                  <DateInput
                    value={t.date}
                    onChange={value => setListTimes(prev => prev.map((x, j) => j === i ? { ...x, date: value } : x))}
                    className="input min-w-0"
                  />
                  <HourStepper
                    hour={t.hour}
                    setHour={value => setListTimes(prev => prev.map((x, j) => {
                      if (j !== i) return x
                      const rolled = rolledDate(x.hour, value, x.date)
                      return { date: rolled ?? x.date, hour: value }
                    }))}
                    compact={isVertical}
                  />
                  <button type="button" disabled={listTimes.length === 1}
                    onClick={() => setListTimes(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 text-sky-400 hover:text-sky-300 disabled:opacity-20 cursor-pointer transition-colors">
                    <X size={13} />
                  </button>
                </Fragment>
              ))}
            </div>
            <button type="button"
              onClick={() => setListTimes(prev => [...prev, { date: defaultDate(), hour: prev[prev.length - 1]?.hour ?? '00' }])}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
              <Plus size={12} /> Add Date & Time
            </button>
          </div>
        )}
        {dateSubMode === 'slice' && (
          // Same grid as List; the Hour column holds one multi-select whose
          // hours apply to every date. Selected hours echo in the gray line.
          <div className="flex flex-col gap-1.5">
            <div className="grid gap-x-1.5 gap-y-1.5 grid-cols-[minmax(0,1fr)_6.5rem_2rem] items-center">
              <HeaderCell>Date</HeaderCell>
              <HeaderCell>Hour</HeaderCell>
              <HeaderCell />
              {customDates.map((d, i) => (
                <Fragment key={i}>
                  <DateInput
                    value={d}
                    onChange={value => setCustomDates(prev => prev.map((x, j) => j === i ? value : x))}
                    className="input min-w-0"
                  />
                  {i === 0 ? <HourMultiSelect selected={sliceHours} onToggle={toggleSliceHour} /> : <span />}
                  <button type="button" disabled={customDates.length === 1}
                    onClick={() => setCustomDates(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 text-sky-400 hover:text-sky-300 disabled:opacity-20 cursor-pointer transition-colors">
                    <X size={13} />
                  </button>
                </Fragment>
              ))}
            </div>
            <button type="button"
              onClick={() => setCustomDates(prev => [...prev, defaultDate()])}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
              <Plus size={12} /> Add Date
            </button>
            <span className="min-h-[16px] text-slate-500 text-xs">
              {sliceHours.map(h => `${h}z`).join(', ')}
            </span>
          </div>
        )}
        {dateSubMode === 'list' && !isThreeHourly && (
          <div className="flex flex-col gap-1.5">
            {customDates.map((d, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <DateInput
                  value={d}
                  onChange={value => setCustomDates(prev => prev.map((x, j) => j === i ? value : x))}
                  className="input flex-1"
                />
                <button type="button" disabled={customDates.length === 1}
                  onClick={() => setCustomDates(prev => prev.filter((_, j) => j !== i))}
                  className="p-1 text-sky-400 hover:text-sky-300 disabled:opacity-20 cursor-pointer transition-colors">
                  <X size={13} />
                </button>
              </div>
            ))}
            <button type="button"
              onClick={() => setCustomDates(prev => [...prev, defaultDate()])}
              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
              <Plus size={12} /> Add Date
            </button>
          </div>
        )}
        {!isThreeHourly && (
          <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
            Daily composites average 00z, 06z, 12z, and 18z synoptic times.
          </p>
        )}
      </>
    )
  }

  return (
          <Section>
            <CardRow>
              <VariableDisplayControl label={isClimo ? 'Climatology' : (isMonthly ? 'Month Mode' : 'Date Mode')}>
                {renderTemporalModeControls()}
              </VariableDisplayControl>
            </CardRow>
            <CardRow>
              {/* Modes with an hour stepper render their own Date/Hour header
                  row inside a shared grid, so the card label would duplicate
                  Date; a plain shell of the same height replaces it. */}
              {!isClimo && !isMonthly && (precipTotalVariable || isThreeHourly) ? (
                <div className="flex min-h-[50px] flex-col gap-1">
                  {renderTemporalInputs()}
                </div>
              ) : (
                <VariableDisplayControl label={isClimo ? 'Month' : (isMonthly ? 'Month' : 'Date')}>
                  {renderTemporalInputs()}
                </VariableDisplayControl>
              )}
            </CardRow>
          </Section>
  )
}
