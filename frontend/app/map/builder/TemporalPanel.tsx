// Temporal Range card: date/month mode selection and the matching inputs for
// every time scale (3-hourly, daily, monthly, climatology).
import { Minus, Plus } from 'lucide-react'
import {
  CORE_ARCHIVE_START_DATE,
  CORE_ARCHIVE_START_MONTH,
  dateRange,
  dateRangeAvailabilityMessage,
  futureObservationDateMessage,
  monthlyAvailabilityMessage,
  monthRange,
  newestAllowedObservationMonth,
  newestAllowedObservationDate,
  type SubMode,
} from '../../../mapRecipe'
import { CardRow, HourStepper, Section, SelectField, TabStrip, VariableDisplayControl } from '../../../ui/controls'
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
  } = recipe

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
    return <TabStrip options={subModeOpts} value={dateSubMode} onChange={v => setDateSubMode(v as SubMode)} fullWidth />
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
                    className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-20 cursor-pointer transition-colors">
                    <Minus size={13} />
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
        <div className={`${isVertical ? 'gap-1' : 'gap-2'} flex min-w-0 items-center`}>
          <DateInput value={date} onChange={setDate} className="input min-w-0 flex-1" />
          <HourStepper hour={hour} setHour={setHour} compact={isVertical} />
        </div>
      )
    }

    if (precipTotalVariable && dateSubMode === 'range') {
      const duration = formatPrecipRangeDuration(startDate, startHour, endDate, hour)
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5 items-center flex-wrap">
            <DateInput value={startDate} onChange={setStartDate} className="input min-w-0" />
            <HourStepper hour={startHour} setHour={setStartHour} compact={isVertical} />
            <span className="text-slate-600 text-xs">→</span>
            <DateInput
              value={endDate}
              onChange={value => {
                setEndDate(value)
                setDate(value)
              }}
              className="input min-w-0"
            />
            <HourStepper hour={hour} setHour={setHour} compact={isVertical} />
            <span className="text-slate-500 text-xs">{duration}</span>
          </div>
        </div>
      )
    }

    if (precipTotalVariable && dateSubMode === 'list') {
      return (
        <div className="flex flex-col gap-1.5">
          <div className={`${isVertical ? 'gap-1' : 'gap-2'} flex min-w-0 items-center`}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Hour</span>
            <HourStepper hour={hour} setHour={setHour} compact={isVertical} />
          </div>
          {customDates.map((d, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <DateInput
                value={d}
                onChange={value => setCustomDates(prev => prev.map((x, j) => j === i ? value : x))}
                className="input flex-1"
              />
              <button type="button" disabled={customDates.length === 1}
                onClick={() => setCustomDates(prev => prev.filter((_, j) => j !== i))}
                className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-20 cursor-pointer transition-colors">
                <Minus size={13} />
              </button>
            </div>
          ))}
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
        {dateSubMode === 'single' && (
          <div className={`${isVertical ? 'gap-1' : 'gap-2'} flex min-w-0 items-center`}>
            <DateInput value={date} onChange={setDate} className="input min-w-0 flex-1" />
            {isThreeHourly && <HourStepper hour={hour} setHour={setHour} compact={isVertical} />}
          </div>
        )}
        {dateSubMode === 'range' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center flex-wrap">
              <DateInput value={startDate} onChange={setStartDate} className="input min-w-0" />
              <span className="text-slate-600 text-xs">→</span>
              <DateInput value={endDate} onChange={setEndDate} className="input min-w-0" />
              {isThreeHourly && <HourStepper hour={hour} setHour={setHour} compact={isVertical} />}
              {startDate && endDate && startDate <= endDate && (
                <span className="text-slate-500 text-xs">{dateRange(startDate, endDate).length}d</span>
              )}
            </div>
            {/*{!isThreeHourly && startDate && endDate && startDate < endDate && (*/}
            {/*  <p className="text-[10px] text-slate-500 leading-tight">*/}
            {/*    Composite dates average all 8 3-hour times.*/}
            {/*  </p>*/}
            {/*)}*/}
          </div>
        )}
        {dateSubMode === 'list' && (
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
                  className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-20 cursor-pointer transition-colors">
                  <Minus size={13} />
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
              <VariableDisplayControl label={isClimo ? 'Month' : (isMonthly ? 'Month' : 'Date')}>
                {renderTemporalInputs()}
              </VariableDisplayControl>
            </CardRow>
          </Section>
  )
}
