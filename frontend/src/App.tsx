import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wind, Settings, X, Plus, Minus, ChevronLeft, ChevronRight, PanelLeft, LayoutGrid } from 'lucide-react'

const API_BASE = 'http://127.0.0.1:8000'
// const API_BASE = import.meta.env.VITE_API_URL;

const VARIABLES = [
  { key: 'wind_speed',   label: 'Wind Speed' },
  { key: 'temp',         label: 'Temperature' },
  { key: 'height',       label: 'Geopot. Height' },
  { key: 'rel_humidity', label: 'Rel. Humidity' },
  { key: 'humidity',     label: 'Spec. Humidity' },
]

const LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]
const HOURS  = ['00', '03', '06', '09', '12', '15', '18', '21']

type TimeScale   = '6-hourly' | 'daily' | 'monthly' | 'climatology'
type SubMode     = 'single' | 'range' | 'list'
type DisplayMode = 'raw' | 'anomaly' | 'normalized'
type ClimoSource = 'monthly-pgb' | 'r2-daily' | 'r2-monthly' | 'cfsr-daily'

// ── Region catalogue ──────────────────────────────────────────────────────────

type RegionEntry = { key: string; label: string; available: boolean }
type RegionGroup = { category: string; regions: RegionEntry[] }

const REGION_GROUPS: RegionGroup[] = [
  {
    category: 'United States',
    regions: [
      { key: 'CONUS',          label: 'CONUS',          available: true  },
      { key: 'Northwest US',   label: 'Northwest US',   available: false },
      { key: 'Northern Plains',label: 'Northern Plains',available: false },
      { key: 'Central Plains', label: 'Central Plains', available: false },
      { key: 'Northeast',      label: 'Northeast',      available: false },
      { key: 'Eastern US',     label: 'Eastern US',     available: false },
      { key: 'Southwest US',   label: 'Southwest US',   available: false },
      { key: 'South Central',  label: 'South Central',  available: false },
      { key: 'Southeast US',   label: 'Southeast US',   available: false },
      { key: 'Western US',     label: 'Western US',     available: false },
      { key: 'Alaska',         label: 'Alaska',         available: false },
      { key: 'Hawaii',         label: 'Hawaii',         available: false },
    ],
  },
  {
    category: 'World',
    regions: [
      { key: 'North America',       label: 'North America',       available: false },
      { key: 'Northern Hemisphere', label: 'Northern Hemisphere', available: false },
      { key: 'North Pacific',       label: 'North Pacific',       available: false },
      { key: 'Northern Africa',     label: 'Northern Africa',     available: false },
      { key: 'Europe',              label: 'Europe',              available: false },
      { key: 'Asia',                label: 'Asia',                available: false },
      { key: 'Middle East',         label: 'Middle East',         available: false },
      { key: 'East Asia',           label: 'East Asia',           available: false },
      { key: 'Australia',           label: 'Australia',           available: false },
      { key: 'Southeast Canada',    label: 'Southeast Canada',    available: false },
      { key: 'Western Canada',      label: 'Western Canada',      available: false },
      { key: 'Canada',              label: 'Canada',              available: false },
      { key: 'South America',       label: 'South America',       available: false },
      { key: 'World',               label: 'World',               available: false },
    ],
  },
  {
    category: 'Tropics — Oceanic & Coastal',
    regions: [
      { key: 'Indian Ocean',      label: 'Indian Ocean',      available: true  },
      { key: 'North Atlantic',    label: 'North Atlantic',    available: false },
      { key: 'Western Atlantic',  label: 'Western Atlantic',  available: false },
      { key: 'Tropical Atlantic', label: 'Tropical Atlantic', available: false },
      { key: 'Western Pacific',   label: 'Western Pacific',   available: false },
      { key: 'Central Pacific',   label: 'Central Pacific',   available: false },
      { key: 'Eastern Pacific',   label: 'Eastern Pacific',   available: false },
      { key: 'Southwest Pacific', label: 'Southwest Pacific', available: false },
      { key: 'Southeast Pacific', label: 'Southeast Pacific', available: false },
    ],
  },
  {
    category: 'Tropics — Land Based',
    regions: [
      { key: 'India',          label: 'India',          available: false },
      { key: 'Southern Africa',label: 'Southern Africa',available: false },
    ],
  },
]

const CLIMO_SOURCES: {
  value: ClimoSource; label: string; period: string; description: string; available: boolean
}[] = [
  {
    value: 'monthly-pgb',
    label: 'CORe PGB monthly',
    period: '1991–2020',
    description: 'CDAS pgb monthly means. Best baseline for monthly composites.',
    available: true,
  },
  {
    value: 'r2-daily',
    label: 'NCEP/DOE R2 daily',
    period: '1991–2020',
    description: 'R2 day-of-year climatology via PSL OPeNDAP. Correct baseline for 6-hourly and daily anomalies.',
    available: true,
  },
  {
    value: 'r2-monthly',
    label: 'NCEP/DOE R2 monthly',
    period: '1991–2020',
    description: 'R2 monthly climatology via PSL OPeNDAP. WMO 1991–2020 standard normal. Default for monthly anomalies.',
    available: true,
  },
  {
    value: 'cfsr-daily',
    label: 'CFSR daily',
    period: '1981–2010',
    description: 'Climate Forecast System Reanalysis daily climatology.',
    available: false,
  },
]

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
}

function toApiDate(s: string) { return s.replace(/-/g, '') }

function monthRange(startYM: string, endYM: string): string[] {
  const result: string[] = []
  const [sy, sm] = startYM.split('-').map(Number)
  const [ey, em] = endYM.split('-').map(Number)
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
}

function dateRange(startISO: string, endISO: string): string[] {
  const result: string[] = []
  const cur = new Date(startISO + 'T00:00:00Z')
  const end = new Date(endISO  + 'T00:00:00Z')
  while (cur <= end) {
    result.push(cur.toISOString().slice(0, 10).replace(/-/g, ''))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return result
}

// ── Design primitives ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest select-none">
      {children}
    </span>
  )
}

// Connected horizontal tab strip — pass fullWidth to stretch across the parent
function TabStrip({ options, value, onChange, fullWidth = false }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  fullWidth?: boolean
}) {
  return (
    <div className={`flex rounded overflow-hidden border border-slate-600 text-xs font-medium ${fullWidth ? 'w-full' : 'w-fit'}`}>
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
          className={`${fullWidth ? 'flex-1 text-center' : ''} px-2.5 py-1 cursor-pointer transition-colors ${
            value === opt.value
              ? 'bg-sky-700 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ‹ 00z › stepper — cycles through HOURS array
function HourStepper({ hour, setHour }: { hour: string; setHour: (h: string) => void }) {
  const idx = HOURS.indexOf(hour)
  const prev = () => setHour(HOURS[(idx - 1 + HOURS.length) % HOURS.length])
  const next = () => setHour(HOURS[(idx + 1) % HOURS.length])
  return (
    <div className="flex items-center rounded overflow-hidden border border-slate-600 shrink-0">
      <button type="button" onClick={prev}
        className="px-1.5 py-1 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors">
        <ChevronLeft size={13} />
      </button>
      <span className="px-2.5 py-1 bg-slate-800 text-xs font-mono text-slate-200 select-none min-w-[3rem] text-center">
        {hour}z
      </span>
      <button type="button" onClick={next}
        className="px-1.5 py-1 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors">
        <ChevronRight size={13} />
      </button>
    </div>
  )
}

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-2.5 ${className}`}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function App() {
  const [, setSearchParams] = useSearchParams()

  const [timeScale,    setTimeScale]    = useState<TimeScale>('6-hourly')
  const [dateSubMode,  setDateSubMode]  = useState<SubMode>('single')
  const [monthSubMode, setMonthSubMode] = useState<SubMode>('single')

  const [date,        setDate]        = useState(defaultDate)
  const [startDate,   setStartDate]   = useState(defaultDate)
  const [endDate,     setEndDate]     = useState(defaultDate)
  const [hour,        setHour]        = useState('00')
  const [customDates, setCustomDates] = useState<string[]>([defaultDate()])

  const [month,        setMonth]        = useState(() => new Date().toISOString().slice(0, 7))
  const [monthStart,   setMonthStart]   = useState(() => new Date().toISOString().slice(0, 7))
  const [monthEnd,     setMonthEnd]     = useState(() => new Date().toISOString().slice(0, 7))
  const [customMonths, setCustomMonths] = useState<string[]>([new Date().toISOString().slice(0, 7)])

  const [climoMonth, setClimoMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const [variable, setVariable] = useState('wind_speed')
  const [level,    setLevel]    = useState('850')

  const [region,      setRegion]      = useState('CONUS')
  const [regionsOpen, setRegionsOpen] = useState(false)

  const [displayMode, setDisplayMode] = useState<DisplayMode>('raw')

  const [windOn,    setWindOn]    = useState(false)
  const [windStep,  setWindStep]  = useState('2')
  const [windType,  setWindType]  = useState('vectors')
  const [colorStep, setColorStep] = useState('1')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [climoSource,  setClimoSource]  = useState<ClimoSource>('r2-monthly')

  const [mapSrc,  setMapSrc]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const isVertical  = layoutMode === 'vertical'

  const isClimo     = timeScale === 'climatology'
  const isMonthly   = timeScale === 'monthly'
  const isSixHourly = timeScale === '6-hourly'

  // ── Generate label ───────────────────────────────────────────────────────────
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

  // ── API call ─────────────────────────────────────────────────────────────────
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const params: Record<string, string> = { variable, level, region }

    if (displayMode !== 'raw') params.mode = displayMode

    if (isClimo) {
      params.date = climoMonth.replace('-', '') + '01'
      params.hour = '00'
      params.mode = 'climatology'
    } else if (isMonthly) {
      if (monthSubMode === 'single') {
        params.months = month.replace('-', '')
      } else if (monthSubMode === 'range') {
        const mList = monthRange(monthStart, monthEnd)
        if (!mList.length) { setError('End month must be on or after start month.'); return }
        params.months = mList.join(',')
      } else {
        const mList = customMonths.filter(Boolean).map(m => m.replace('-', ''))
        if (!mList.length) { setError('Add at least one month.'); return }
        params.months = mList.join(',')
      }
    } else {
      if (isSixHourly) {
        params.hour = hour
      } else {
        // Daily composite: average 00z, 06z, 12z, 18z synoptic times per day.
        params.hours = '00,06,12,18'
      }
      if (dateSubMode === 'single') {
        params.date = toApiDate(date)
      } else if (dateSubMode === 'range') {
        const dates = startDate && endDate && startDate <= endDate ? dateRange(startDate, endDate) : []
        if (!dates.length) { setError('End date must be on or after start date.'); return }
        params.dates = dates.join(',')
      } else {
        const dates = customDates.filter(Boolean).map(toApiDate)
        if (!dates.length) { setError('Add at least one date.'); return }
        dates.length === 1 ? (params.date = dates[0]) : (params.dates = dates.join(','))
      }
    }

    if (windOn && windStep) { params.wind_step = windStep; params.wind_type = windType }
    if (colorStep && colorStep !== '1') params.color_step = colorStep

    setSearchParams(params)
    setLoading(true)
    if (mapSrc?.startsWith('blob:')) URL.revokeObjectURL(mapSrc)
    setMapSrc(null)

    const fetchParams = { ...params }
    // Always send the user's climo preference for anomaly/normalized requests.
    // The backend decides what to actually honour and logs any override.
    if (params.mode && params.mode !== 'raw') {
      fetchParams.climo_source = climoSource
    }

    try {
      const res = await fetch(`${API_BASE}/api/map?${new URLSearchParams(fetchParams)}`)
      if (res.ok) {
        const blob = await res.blob()
        setMapSrc(URL.createObjectURL(blob))
      } else {
        const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        setError(body.detail ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Temporal inputs ──────────────────────────────────────────────────────────
  const subModeOpts = [
    { value: 'single', label: 'Single' },
    { value: 'range',  label: 'Range'  },
    { value: 'list',   label: 'List'   },
  ]

  function renderTemporalInputs() {
    if (isClimo) {
      return (
        <input type="month" value={climoMonth}
          onChange={e => setClimoMonth(e.target.value)} className="input" />
      )
    }

    if (isMonthly) {
      return (
        <>
          <TabStrip options={subModeOpts} value={monthSubMode} onChange={v => setMonthSubMode(v as SubMode)} fullWidth />
          {monthSubMode === 'single' && (
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input" />
          )}
          {monthSubMode === 'range' && (
            <div className="flex gap-1.5 items-center flex-wrap">
              <input type="month" value={monthStart} onChange={e => setMonthStart(e.target.value)} className="input" />
              <span className="text-slate-600 text-xs">→</span>
              <input type="month" value={monthEnd}   onChange={e => setMonthEnd(e.target.value)}   className="input" />
              <span className="text-slate-500 text-xs">{monthRange(monthStart, monthEnd).length} mo</span>
            </div>
          )}
          {monthSubMode === 'list' && (
            <div className="flex flex-col gap-1.5">
              {customMonths.map((m, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input type="month" value={m}
                    onChange={e => setCustomMonths(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    className="input flex-1" />
                  <button type="button" disabled={customMonths.length === 1}
                    onClick={() => setCustomMonths(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 text-slate-600 hover:text-red-400 disabled:opacity-20 cursor-pointer transition-colors">
                    <Minus size={13} />
                  </button>
                </div>
              ))}
              <button type="button"
                onClick={() => setCustomMonths(prev => [...prev, new Date().toISOString().slice(0, 7)])}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 cursor-pointer w-fit">
                <Plus size={12} /> Add Month
              </button>
            </div>
          )}
        </>
      )
    }

    // 6-hourly or daily
    return (
      <>
        <TabStrip options={subModeOpts} value={dateSubMode} onChange={v => setDateSubMode(v as SubMode)} fullWidth />
        {dateSubMode === 'single' && (
          <div className="flex gap-2 items-center">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input flex-1" />
            {isSixHourly && <HourStepper hour={hour} setHour={setHour} />}
          </div>
        )}
        {dateSubMode === 'range' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
              <span className="text-slate-600 text-xs">→</span>
              <input type="date" value={endDate}   onChange={e => setEndDate(e.target.value)}   className="input" />
              {isSixHourly && <HourStepper hour={hour} setHour={setHour} />}
              {startDate && endDate && startDate <= endDate && (
                <span className="text-slate-500 text-xs">{dateRange(startDate, endDate).length}d</span>
              )}
            </div>
            {!isSixHourly && startDate && endDate && startDate < endDate && (
              <p className="text-[10px] text-slate-500 leading-tight">
                Each date is averaged across 00/06/12/18z — {dateRange(startDate, endDate).length * 4} total fetches.
                First request cold; subsequent requests use disk cache.
              </p>
            )}
          </div>
        )}
        {dateSubMode === 'list' && (
          <div className="flex flex-col gap-1.5">
            {customDates.map((d, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input type="date" value={d}
                  onChange={e => setCustomDates(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  className="input flex-1" />
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
        {!isSixHourly && (
          <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
            Daily composites average 00z, 06z, 12z, and 18z synoptic times.
          </p>
        )}
      </>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-slate-950 text-slate-100 flex flex-col ${isVertical ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 border-b border-slate-700 px-5 py-2 flex items-center gap-3">
        <Wind className="text-sky-400 shrink-0" size={20} />
        <span className="font-bold tracking-tight text-sm">PyRe</span>
        <span className="text-slate-400 text-sm font-light">Climate Reanalysis</span>
        <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">CORe / NCEP</span>

        {/* Time scale — far right of header */}
        <div className="ml-auto flex items-center gap-3">
          <TabStrip
            options={[
              { value: '6-hourly',    label: '6-Hourly' },
              { value: 'daily',       label: 'Daily' },
              { value: 'monthly',     label: 'Monthly' },
              { value: 'climatology', label: 'Climatology' },
            ]}
            value={timeScale}
            onChange={v => setTimeScale(v as TimeScale)}
          />
          <button type="button"
            onClick={() => setLayoutMode(m => m === 'horizontal' ? 'vertical' : 'horizontal')}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            title={isVertical ? 'Switch to grid layout' : 'Switch to side-by-side layout'}>
            {isVertical ? <LayoutGrid size={17} /> : <PanelLeft size={17} />}
          </button>
          <button type="button" onClick={() => setSettingsOpen(o => !o)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            title="Settings">
            <Settings size={17} />
          </button>
        </div>
      </header>

      <form onSubmit={handleGenerate}
        className={isVertical ? 'flex flex-1 min-h-0 overflow-hidden' : 'p-4 flex flex-col gap-4'}>

        {/* ── Card panels ─────────────────────────────────────────────────── */}
        <div className={isVertical
          ? 'w-72 shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
          : 'grid grid-cols-2 xl:grid-cols-4 gap-3 items-start'}>

          {/* 1 · Variable & Level */}
          <Section>
            <div className="flex gap-2 items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label>Variable</Label>
                <select value={variable} onChange={e => setVariable(e.target.value)} className="input w-full">
                  {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Label>Level (mb)</Label>
                <select value={level} onChange={e => setLevel(e.target.value)} className="input">
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

            </div>
            {/* ── Wind overlay ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-700/40">
              <Label>Wind Overlay</Label>
              <button type="button" role="switch" aria-checked={windOn}
                onClick={() => setWindOn(o => !o)}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ${windOn ? 'bg-sky-600' : 'bg-slate-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${windOn ? 'translate-x-3' : 'translate-x-0'}`} />
              </button>

              <div className={`flex items-center gap-1.5 ml-auto transition-opacity ${windOn ? '' : 'opacity-30 pointer-events-none'}`}>
                <Label>Density</Label>
                <input type="number" min={1} max={20} value={windStep}
                  onChange={e => setWindStep(e.target.value)}
                  className="input w-10 text-center px-1" />
                <div className="flex flex-col gap-0.5">
                  {(['vectors', 'barbs'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setWindType(t)}
                      className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors leading-tight ${
                        windType === t ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}>
                      {t === 'vectors' ? 'Vectors' : 'Barbs'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* 2 · Temporal Range */}
          <Section>
            <Label>{isClimo ? 'Climatology Month' : (isMonthly ? 'Month' : 'Date')}</Label>
            {renderTemporalInputs()}
          </Section>

          {/* 3 · Region */}
          <Section>
            <Label>Region</Label>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setRegion('CONUS')}
                className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-center cursor-pointer transition-colors ${
                  region === 'CONUS'
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}>
                CONUS
              </button>
              <button type="button" onClick={() => setRegionsOpen(true)}
                className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-center cursor-pointer transition-colors ${
                  region !== 'CONUS'
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}>
                {region !== 'CONUS' ? region : 'All Regions'}
              </button>
            </div>
          </Section>

          {/* 4 · Analysis + Generate */}
          <Section>
            <Label>Analysis</Label>
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
                  { value: 'anomaly',    label: 'Anomaly'    },
                  { value: 'normalized', label: 'Normalized' },
                ]}
                value={displayMode}
                onChange={v => setDisplayMode(v as DisplayMode)}
                fullWidth
              />
            )}
            <button type="submit" disabled={loading}
              className="mt-1 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 active:bg-sky-700
                         disabled:opacity-50 font-bold text-sm tracking-wide cursor-pointer transition-colors w-full">
              {generateLabel()}
            </button>
          </Section>

        </div>

        {/* ── Map panel ───────────────────────────────────────────────────── */}
        {isVertical ? (
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {(mapSrc || error || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex items-center justify-center w-full h-full">
                {error && (
                  <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
                    {error}
                  </div>
                )}
                {loading && !error && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && !error && (
                  <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map"
                    className="max-w-full max-h-full rounded shadow-xl object-contain" />
                )}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">Select parameters and click Generate Map.</p>
            )}
          </div>
        ) : (
          <>
            {(mapSrc || error || loading) ? (
              <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 flex items-center justify-center min-h-48">
                {error && (
                  <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
                    {error}
                  </div>
                )}
                {loading && !error && <p className="text-slate-400 text-sm animate-pulse">Rendering map…</p>}
                {mapSrc && !error && (
                  <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map" className="max-w-[75%] rounded shadow-xl" />
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-16">
                <p className="text-slate-600 text-sm">Select parameters above and click Generate Map.</p>
              </div>
            )}
          </>
        )}

      </form>

      {/* ── Regions modal ──────────────────────────────────────────────────── */}
      {regionsOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setRegionsOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[80vw] shadow-2xl flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                <span className="font-semibold text-base">Select Region</span>
                <button type="button" onClick={() => setRegionsOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5 flex flex-col gap-6">
                {REGION_GROUPS.map(group => (
                  <div key={group.category}>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                      {group.category}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {group.regions.map(r => (
                        <button
                          key={r.key}
                          type="button"
                          disabled={!r.available}
                          onClick={() => { setRegion(r.key); setRegionsOpen(false) }}
                          className={`px-4 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                            r.available
                              ? region === r.key
                                ? 'bg-sky-700 text-white cursor-pointer'
                                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer'
                              : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                          }`}
                        >
                          {r.label}
                          {!r.available && (
                            <span className="block text-xs text-slate-600 mt-0.5">coming soon</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Settings drawer ────────────────────────────────────────────────── */}
      {settingsOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSettingsOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-84 bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <span className="font-semibold text-sm tracking-wide">Settings</span>
              <button type="button" onClick={() => setSettingsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-7">
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Render Options</h3>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Color Interval</label>
                    <input type="number" min={1} max={50} value={colorStep}
                      onChange={e => setColorStep(e.target.value)} className="input w-24" />
                  </div>
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Climatology Source</h3>
                <div className="flex flex-col gap-4">
                  {CLIMO_SOURCES.map(src => (
                    <label key={src.value}
                      className={`flex gap-3 ${src.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>
                      <input type="radio" name="climo_source" value={src.value}
                        checked={climoSource === src.value} disabled={!src.available}
                        onChange={() => setClimoSource(src.value)} className="mt-0.5 shrink-0 accent-sky-500" />
                      <div>
                        <div className="text-sm font-medium leading-snug">
                          {src.label}
                          <span className="ml-2 text-xs text-slate-400 font-normal font-mono">{src.period}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{src.description}</div>
                        {!src.available && (
                          <div className="text-xs text-amber-400 mt-1">Not yet implemented</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-600 mt-4 leading-relaxed">
                  The backend may override your selection when the chosen source does not match
                  the temporal resolution of the request. Check the map title for the source actually used.
                </p>
              </section>
            </div>
          </div>
        </>
      )}

    </div>
  )
}