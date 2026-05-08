import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Wind } from 'lucide-react'

const API_BASE = 'http://127.0.0.1:8000'

const VARIABLES = [
  { key: 'wind_speed',    label: 'Wind Speed' },
  { key: 'temp',          label: 'Temperature' },
  { key: 'height',        label: 'Geopotential Height' },
  { key: 'rel_humidity',  label: 'Relative Humidity' },
  { key: 'humidity',      label: 'Specific Humidity' },
]

const LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]

const HOURS = ['00', '03', '06', '09', '12', '15', '18', '21']

const REGIONS = ['CONUS']

function defaultDate(): string {
  // 3 days ago — safely within the GCS near-real-time window
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)  // YYYY-MM-DD for <input type="date">
}

function toApiDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')  // YYYY-MM-DD → YYYYMMDD
}

function buildMapUrl(params: Record<string, string>): string {
  const q = new URLSearchParams(params)
  return `${API_BASE}/api/map?${q.toString()}`
}

export default function App() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Controls — initialise from URL if present
  const [date,     setDate]     = useState(searchParams.get('date')?.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') ?? defaultDate())
  const [hour,     setHour]     = useState(searchParams.get('hour')     ?? '00')
  const [variable, setVariable] = useState(searchParams.get('variable') ?? 'wind_speed')
  const [level,    setLevel]    = useState(searchParams.get('level')    ?? '850')
  const [region,   setRegion]   = useState(searchParams.get('region')   ?? 'CONUS')
  const [windStep, setWindStep] = useState(searchParams.get('wind_step') ?? '')
  const [windType, setWindType] = useState(searchParams.get('wind_type') ?? 'vectors')

  // Map state
  const [mapSrc,  setMapSrc]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    const params: Record<string, string> = { date: toApiDate(date), hour, variable, level, region }
    if (windStep) { params.wind_step = windStep; params.wind_type = windType }
    setSearchParams(params)
    setMapSrc(buildMapUrl(params))
    setLoading(true)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center gap-3">
        <Wind className="text-sky-400" size={28} />
        <span className="text-xl font-semibold tracking-tight">PyRe — Climate Reanalysis</span>
        <span className="ml-2 text-xs text-slate-500 font-mono">CORe / NCEP</span>
      </header>

      {/* Control panel */}
      <form
        onSubmit={handleGenerate}
        className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex flex-wrap gap-4 items-end"
      >
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Hour (UTC)">
          <select value={hour} onChange={e => setHour(e.target.value)} className="input">
            {HOURS.map(h => (
              <option key={h} value={h}>{h}z</option>
            ))}
          </select>
        </Field>

        <Field label="Variable">
          <select value={variable} onChange={e => setVariable(e.target.value)} className="input">
            {VARIABLES.map(v => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Level (mb)">
          <select value={level} onChange={e => setLevel(e.target.value)} className="input">
            {LEVELS.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </Field>

        <Field label="Wind Overlay">
          <div className="flex gap-2">
            <select value={windType} onChange={e => setWindType(e.target.value)} className="input">
              <option value="vectors">Vectors</option>
              <option value="barbs">Barbs</option>
            </select>
            <input
              type="number"
              min={1}
              max={20}
              placeholder="off"
              value={windStep}
              onChange={e => setWindStep(e.target.value)}
              className="input w-20"
              title="Plot every nth point (leave blank for none)"
            />
          </div>
        </Field>

        <Field label="Region">
          <select value={region} onChange={e => setRegion(e.target.value)} className="input">
            {REGIONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50
                     font-semibold text-sm transition-colors cursor-pointer"
        >
          {loading ? 'Rendering…' : 'Generate Map'}
        </button>
      </form>

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
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false)
              setError('Failed to render map. Check the backend console for details.')
            }}
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