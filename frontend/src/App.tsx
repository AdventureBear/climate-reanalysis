import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wind, Settings, X } from 'lucide-react'

const API_BASE = 'http://127.0.0.1:8000'

const VARIABLES = [
  { key: 'wind_speed',   label: 'Wind Speed' },
  { key: 'temp',         label: 'Temperature' },
  { key: 'height',       label: 'Geopotential Height' },
  { key: 'rel_humidity', label: 'Relative Humidity' },
  { key: 'humidity',     label: 'Specific Humidity' },
]

const LEVELS  = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]
const HOURS   = ['00', '03', '06', '09', '12', '15', '18', '21']
const REGIONS = ['CONUS', 'Indian Ocean']

type InputTab    = 'sixhourly' | 'monthly' | 'climatology'
type DateSubMode = 'single' | 'range'
type MonthSubMode = 'single' | 'range'
type DisplayMode = 'raw' | 'anomaly' | 'normalized'
type ClimoSource = 'monthly-pgb' | 'r1-daily' | 'cfsr-daily'

const DISPLAY_MODES: { value: DisplayMode; label: string }[] = [
  { value: 'raw',        label: 'Raw Data' },
  { value: 'anomaly',    label: 'Anomaly' },
  { value: 'normalized', label: 'Normalized Anomaly' },
]

const CLIMO_SOURCES: {
  value: ClimoSource
  label: string
  period: string
  description: string
  available: boolean
}[] = [
  {
    value: 'monthly-pgb',
    label: 'CORe monthly pgb',
    period: '1991–2020',
    description: 'CDAS pressure-level monthly means. Anomaly and normalized anomaly valid for monthly composites only.',
    available: true,
  },
  {
    value: 'r1-daily',
    label: 'NCEP/NCAR R1 daily',
    period: '1991–2020',
    description: 'PSL Reanalysis 1 daily climatology. Enables physically meaningful normalized anomaly for all modes.',
    available: false,
  },
  {
    value: 'cfsr-daily',
    label: 'CFSR daily',
    period: '1981–2010',
    description: 'Climate Forecast System Reanalysis. Matches reference sites such as Tropical Tidbits.',
    available: false,
  },
]

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
}

function toApiDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

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

function buildMapUrl(params: Record<string, string>): string {
  return `${API_BASE}/api/map?${new URLSearchParams(params).toString()}`
}

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [inputTab,     setInputTab]     = useState<InputTab>('sixhourly')
  const [dateSubMode,  setDateSubMode]  = useState<DateSubMode>('single')
  const [monthSubMode, setMonthSubMode] = useState<MonthSubMode>('single')
  const [displayMode,  setDisplayMode]  = useState<DisplayMode>('raw')

  // 6-hourly controls
  const [date,      setDate]      = useState(searchParams.get('date')?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') ?? defaultDate())
  const [startDate, setStartDate] = useState(defaultDate())
  const [endDate,   setEndDate]   = useState(defaultDate())
  const [hour,      setHour]      = useState(searchParams.get('hour') ?? '00')

  // Monthly controls
  const [month,      setMonth]      = useState(() => new Date().toISOString().slice(0, 7))
  const [monthStart, setMonthStart] = useState(() => new Date().toISOString().slice(0, 7))
  const [monthEnd,   setMonthEnd]   = useState(() => new Date().toISOString().slice(0, 7))

  // Climatology control
  const [climoMonth, setClimoMonth] = useState(() => new Date().toISOString().slice(0, 7))

  // Shared controls
  const [variable,  setVariable]  = useState(searchParams.get('variable')  ?? 'wind_speed')
  const [level,     setLevel]     = useState(searchParams.get('level')     ?? '850')
  const [region,    setRegion]    = useState(searchParams.get('region')    ?? 'CONUS')
  const [windStep,  setWindStep]  = useState(searchParams.get('wind_step') ?? '')
  const [windType,  setWindType]  = useState(searchParams.get('wind_type') ?? 'vectors')
  const [colorStep, setColorStep] = useState(searchParams.get('color_step') ?? '1')

  // Settings
  const [settingsOpen,   setSettingsOpen]   = useState(false)
  const [climoSource,    setClimoSource]    = useState<ClimoSource>('monthly-pgb')
  const [normalizedAllModes, setNormalizedAllModes] = useState(false)

  // Map state
  const [mapSrc,  setMapSrc]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Reset displayMode to 'raw' if normalized becomes unavailable for current tab
  useEffect(() => {
    const selectedSource = CLIMO_SOURCES.find(s => s.value === climoSource)
    const normalizedOk = selectedSource?.available && (
      !isSixHourly || normalizedAllModes
    )
    if (displayMode === 'normalized' && !normalizedOk) setDisplayMode('raw')
  }, [inputTab, climoSource, normalizedAllModes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived layout state ───────────────────────────────────────────────────
  const isClimo     = inputTab === 'climatology'
  const isSixHourly = inputTab === 'sixhourly'
  const isRange     = isSixHourly ? dateSubMode === 'range' : monthSubMode === 'range'

  const selectedSource    = CLIMO_SOURCES.find(s => s.value === climoSource)!
  const normalizedEnabled = selectedSource.available && (!isSixHourly || normalizedAllModes)

  // Primary date/month slot — always rendered, content depends on tab + sub-mode
  const primaryType     = isSixHourly ? 'date' : 'month'
  const primaryLabel    = isSixHourly
    ? (isRange ? 'Start Date' : 'Date')
    : (isRange ? 'Start Month' : 'Month')
  const primaryValue    = isSixHourly
    ? (isRange ? startDate : date)
    : (isClimo ? climoMonth : (isRange ? monthStart : month))
  const primaryOnChange = isSixHourly
    ? (isRange ? setStartDate : setDate)
    : (isClimo ? setClimoMonth : (isRange ? setMonthStart : setMonth))

  // End date/month slot — always rendered, invisible when not a range mode
  const endLabel    = isSixHourly ? 'End Date' : 'End Month'
  const endType     = isSixHourly ? 'date' : 'month'
  const endValue    = isSixHourly ? endDate : monthEnd
  const endOnChange = isSixHourly ? setEndDate : setMonthEnd

  // Generate button label
  function generateLabel(): string {
    if (loading) return 'Rendering…'
    if (isClimo) return 'Generate Climatology Map'
    if (isRange) {
      const n = isSixHourly
        ? (startDate && endDate && startDate <= endDate ? dateRange(startDate, endDate).length : 0)
        : monthRange(monthStart, monthEnd).length
      return n > 1 ? `Generate Composite (${n} ${isSixHourly ? 'dates' : 'months'})` : 'Generate Map'
    }
    return 'Generate Map'
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const params: Record<string, string> = { variable, level, region }

    if (isClimo) {
      params.date = climoMonth.replace('-', '') + '01'
      params.hour = '00'
      params.mode = 'climatology'
    } else if (!isSixHourly) {
      // Monthly tab
      if (!isRange) {
        params.months = month.replace('-', '')
      } else {
        const mList = monthRange(monthStart, monthEnd)
        if (mList.length === 0) { setError('End month must be on or after start month.'); return }
        params.months = mList.join(',')
      }
      if (displayMode !== 'raw') params.mode = displayMode
    } else {
      // 6-hourly tab
      params.hour = hour
      if (!isRange) {
        params.date = toApiDate(date)
      } else {
        const dates = startDate && endDate && startDate <= endDate
          ? dateRange(startDate, endDate)
          : []
        if (dates.length === 0) { setError('End date must be on or after start date.'); return }
        params.dates = dates.join(',')
      }
      if (displayMode !== 'raw') params.mode = displayMode
    }

    if (windStep) { params.wind_step = windStep; params.wind_type = windType }
    if (colorStep && colorStep !== '1') params.color_step = colorStep

    setSearchParams(params)
    setLoading(true)
    if (mapSrc?.startsWith('blob:')) URL.revokeObjectURL(mapSrc)
    setMapSrc(null)

    // climo_source goes to the API but not into the shareable URL
    const fetchParams = { ...params }
    if (climoSource !== 'monthly-pgb') fetchParams.climo_source = climoSource

    try {
      const res = await fetch(buildMapUrl(fetchParams))
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center gap-3">
        <Wind className="text-sky-400" size={28} />
        <span className="text-xl font-semibold tracking-tight">PyRe — Climate Reanalysis</span>
        <span className="ml-2 text-xs text-slate-500 font-mono">CORe / NCEP</span>
        <button
          type="button"
          onClick={() => setSettingsOpen(o => !o)}
          className="ml-auto p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </header>

      <form onSubmit={handleGenerate} className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex flex-col gap-4">

        {/* ── Row 1: field controls — all always present ─────────────────────── */}
        <div className="flex flex-wrap gap-4 items-end">

          <Field label="Data Source">
            <div className="flex rounded overflow-hidden border border-slate-600 text-sm font-medium">
              {([
                ['sixhourly',   '6-Hourly'],
                ['monthly',     'Monthly'],
                ['climatology', 'Climatology'],
              ] as [InputTab, string][]).map(([tab, lbl]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInputTab(tab)}
                  className={`px-3 py-1.5 transition-colors cursor-pointer ${
                    inputTab === tab
                      ? 'bg-sky-700 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          {/* Display — always present; disabled for climatology tab */}
          <Field label="Display">
            <select
              value={isClimo ? 'climatology-mean' : displayMode}
              onChange={e => setDisplayMode(e.target.value as DisplayMode)}
              disabled={isClimo}
              className="input disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isClimo
                ? <option value="climatology-mean">Climatology Mean</option>
                : DISPLAY_MODES.map(d => {
                    const disabled = d.value === 'normalized' && !normalizedEnabled
                    return (
                      <option key={d.value} value={d.value} disabled={disabled}>
                        {d.label}{disabled ? ' (monthly only)' : ''}
                      </option>
                    )
                  })
              }
            </select>
          </Field>

          <Field label="Variable">
            <select value={variable} onChange={e => setVariable(e.target.value)} className="input">
              {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </Field>

          <Field label="Level (mb)">
            <select value={level} onChange={e => setLevel(e.target.value)} className="input">
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>

          <Field label="Color Interval">
            <input
              type="number" min={1} max={50}
              value={colorStep}
              onChange={e => setColorStep(e.target.value)}
              className="input w-20"
              title="Contour bucket size in display units"
            />
          </Field>

          <Field label="Wind Overlay">
            <div className="flex gap-2">
              <select value={windType} onChange={e => setWindType(e.target.value)} className="input">
                <option value="vectors">Vectors</option>
                <option value="barbs">Barbs</option>
              </select>
              <input
                type="number" min={1} max={20}
                placeholder="off"
                value={windStep}
                onChange={e => setWindStep(e.target.value)}
                className="input w-20"
                title="Plot every nth grid point (blank = off)"
              />
            </div>
          </Field>

          <Field label="Region">
            <select value={region} onChange={e => setRegion(e.target.value)} className="input">
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50
                       font-semibold text-sm transition-colors cursor-pointer self-end"
          >
            {generateLabel()}
          </button>
        </div>

        {/* ── Row 2: date controls — fixed slots, invisible when N/A ──────────── */}
        <div className="flex gap-4 items-end border-t border-slate-700/60 pt-3">

          {/* Sub-mode toggle — invisible for climatology, text changes for 6H vs monthly */}
          <div className={isClimo ? 'invisible' : ''}>
            <Field label={isSixHourly ? 'Date Mode' : 'Month Mode'}>
              <div className="flex rounded overflow-hidden border border-slate-600 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => isSixHourly ? setDateSubMode('single') : setMonthSubMode('single')}
                  className={`px-3 py-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                    !isRange ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {isSixHourly ? 'Single Date' : 'Single Month'}
                </button>
                <button
                  type="button"
                  onClick={() => isSixHourly ? setDateSubMode('range') : setMonthSubMode('range')}
                  className={`px-3 py-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                    isRange ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {isSixHourly ? 'Date Range' : 'Month Range'}
                </button>
              </div>
            </Field>
          </div>

          {/* Primary date/month — always visible, label + type adapt */}
          <Field label={primaryLabel}>
            <input
              type={primaryType}
              value={primaryValue}
              onChange={e => primaryOnChange(e.target.value)}
              className="input"
            />
          </Field>

          {/* Hour — visible only for 6-hourly single date; always takes space */}
          <div className={isSixHourly && !isRange ? '' : 'invisible'}>
            <Field label="Hour (UTC)">
              <select value={hour} onChange={e => setHour(e.target.value)} className="input">
                {HOURS.map(h => <option key={h} value={h}>{h}z</option>)}
              </select>
            </Field>
          </div>

          {/* End date/month — always takes space, invisible when single mode */}
          <div className={isRange ? '' : 'invisible'}>
            <Field label={endLabel}>
              <input
                type={endType}
                value={endValue}
                onChange={e => endOnChange(e.target.value)}
                className="input"
              />
            </Field>
          </div>

        </div>
      </form>

      {/* Settings panel */}
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSettingsOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-84 bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <span className="font-semibold text-sm tracking-wide">Settings</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-7">

              {/* Climatology source */}
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">
                  Climatology Source
                </h3>
                <div className="flex flex-col gap-4">
                  {CLIMO_SOURCES.map(src => (
                    <label
                      key={src.value}
                      className={`flex gap-3 ${src.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}
                    >
                      <input
                        type="radio"
                        name="climo_source"
                        value={src.value}
                        checked={climoSource === src.value}
                        disabled={!src.available}
                        onChange={() => setClimoSource(src.value)}
                        className="mt-0.5 shrink-0 accent-sky-500"
                      />
                      <div>
                        <div className="text-sm font-medium leading-snug">
                          {src.label}
                          <span className="ml-2 text-xs text-slate-400 font-normal font-mono">{src.period}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{src.description}</div>
                        {!src.available && (
                          <div className="text-xs text-amber-400 mt-1">Requires offline precomputation — not yet available</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* Normalized anomaly */}
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">
                  Normalized Anomaly
                </h3>
                <label className="flex gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={normalizedAllModes}
                    onChange={e => setNormalizedAllModes(e.target.checked)}
                    className="mt-0.5 shrink-0 accent-sky-500"
                  />
                  <div>
                    <div className="text-sm font-medium leading-snug">Enable for 6-hourly mode</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Values are normalized against the monthly σ — expect inflated readings compared
                      to daily-climo sources until R1 or CFSR daily data is available.
                    </div>
                  </div>
                </label>
              </section>

              {/* Active source badge */}
              <section className="mt-auto pt-4 border-t border-slate-700/60">
                <div className="text-xs text-slate-500">
                  <span className="text-slate-400 font-medium">Active climatology: </span>
                  {selectedSource.label} · {selectedSource.period}
                </div>
              </section>

            </div>
          </div>
        </>
      )}

      {/* Map display */}
      <main className="flex-1 flex items-center justify-center p-4">
        {error && (
          <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 max-w-xl text-sm">
            {error}
          </div>
        )}
        {!mapSrc && !error && (
          <p className="text-slate-500 text-sm">Select parameters and click Generate Map.</p>
        )}
        {mapSrc && (
          <img
            key={mapSrc}
            src={mapSrc}
            alt="Climate reanalysis map"
            className="max-w-full max-h-full rounded shadow-lg"
          />
        )}
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
