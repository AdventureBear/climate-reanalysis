import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Wind, Settings, X, Plus, Minus, ChevronLeft, ChevronRight, ChevronDown, PanelLeft, LayoutGrid, CircleHelp, SlidersHorizontal, GalleryHorizontalEnd, Menu } from 'lucide-react'
import { REGION_THUMBNAILS } from './regionThumbnails'

// const API_BASE = 'http://127.0.0.1:8000'
const API_BASE = import.meta.env.VITE_API_URL;

const VARIABLES = [
  { key: 'wind_speed',   label: 'Wind Speed' },
  { key: 'temp',         label: 'Temperature' },
  { key: 'pressure',     label: 'Pressure' },
  { key: 'height',       label: 'Geopot. Height' },
  { key: 'rel_humidity', label: 'Humidity' },
  { key: 'precipitable_water', label: 'Precipitable Water' },
]

const FLX_VARIABLES = new Set(['temp_2m', 'wind_10m', 'surface_pressure', 'precipitable_water'])

const LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10]
const SURFACE_LEVELS = new Set(['surface_10m', 'surface_2m', 'surface_mslp'])
const HOURS  = ['00', '03', '06', '09', '12', '15', '18', '21']

type TimeScale   = '6-hourly' | 'daily' | 'monthly' | 'climatology'
type SubMode     = 'single' | 'range' | 'list'
type DisplayMode = 'raw' | 'anomaly' | 'normalized'
type ClimoSource = 'monthly-pgb' | 'r2-daily' | 'r2-monthly' | 'cfsr-daily'
type WindAnomalyStyle = 'speed_diff' | 'vector_mag'
type WindUnit = 'kt' | 'm/s'
type TemperatureUnit = 'F' | 'C'
type HeightDisplay = 'contoured' | 'shaded'
type WindAnomalyRecommendation = {
  style: WindAnomalyStyle
  label: string
  reason: string
}
type ScaleMeta = {
  scale_kind?: string
  group?: string
  unit?: string
  step?: number
  boundaries?: number[]
  interval_mids?: number[]
  interval_hex?: string[]
  anchor_values?: number[]
  anchor_hex?: string[]
  key_breakpoints?: number[]
  domain_min?: number
  domain_max?: number
}
type ScaleTransition = 'smooth' | 'discrete' | 'sampled'
type ScaleAnchor = { id: string; value: number; color: string }
type ScalePalettePreset = {
  id: string
  label: string
  family: 'PyRe' | 'Sequential' | 'Diverging' | 'Perceptual'
  colors: string[]
}

const SCALE_LAB_VARIABLES = [
  { key: 'wind_speed', label: 'Wind' },
  { key: 'temp', label: 'Temp' },
  { key: 'rel_humidity', label: 'RH' },
  { key: 'height', label: 'Height' },
  { key: 'humidity', label: 'Spec. Humidity' },
] as const

type ScaleFamily = {
  key: string
  label: string
  levels: number[]
  description: string
}

const SCALE_PALETTE_PRESETS: ScalePalettePreset[] = [
  { id: 'backend', label: 'Backend Default', family: 'PyRe', colors: [] },
  { id: 'ylgnbu', label: 'YlGnBu', family: 'Sequential', colors: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#0c2c84'] },
  { id: 'ylorrd', label: 'YlOrRd', family: 'Sequential', colors: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#800026'] },
  { id: 'pubugn', label: 'PuBuGn', family: 'Sequential', colors: ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016450'] },
  { id: 'rdbu', label: 'RdBu', family: 'Diverging', colors: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#f7f7f7', '#92c5de', '#4393c3', '#2166ac', '#053061'] },
  { id: 'brbg', label: 'BrBG', family: 'Diverging', colors: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f5f5f5', '#80cdc1', '#35978f', '#01665e', '#003c30'] },
  { id: 'piyg', label: 'PiYG', family: 'Diverging', colors: ['#8e0152', '#c51b7d', '#de77ae', '#f1b6da', '#f7f7f7', '#b8e186', '#7fbc41', '#4d9221', '#276419'] },
  { id: 'viridis', label: 'Viridis', family: 'Perceptual', colors: ['#440154', '#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'] },
  { id: 'magma', label: 'Magma', family: 'Perceptual', colors: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55964', '#fb8761', '#fec287', '#fcfdbf'] },
  { id: 'cividis', label: 'Cividis', family: 'Perceptual', colors: ['#00204c', '#173b6d', '#3b496c', '#5c586e', '#7d6970', '#a17c6f', '#c89266', '#fdea45'] },
]

// ── Region catalogue ──────────────────────────────────────────────────────────

type RegionEntry = { key: string; label: string; available: boolean }
type RegionSection = {
  category: string
  defaultOpen?: boolean
  rows: RegionEntry[][]
}

const REGION_SECTIONS: RegionSection[] = [
  {
    category: 'US',
    defaultOpen: true,
    rows: [
      [
        { key: 'CONUS',         label: 'CONUS',         available: true },
        { key: 'North America', label: 'North America', available: true },
      ],
    ],
  },
  {
    category: 'US Regions',
    defaultOpen: true,
    rows: [
      [
        { key: 'Northwest US',    label: 'Pacific Northwest', available: true },
        { key: 'Northern Plains', label: 'Northern Plains',   available: true },
        { key: 'Northeast',       label: 'Northeast',         available: true },
      ],
      [
        { key: 'Western US',     label: 'Western US',        available: true },
        { key: 'Central Plains', label: 'Central Plains',    available: true },
        { key: 'Eastern US',     label: 'Eastern US',        available: true },
      ],
      [
        { key: 'Southwest US',  label: 'Southwest',       available: true },
        { key: 'South Central', label: 'Southern Plains', available: true },
        { key: 'Southeast US',  label: 'Southeast',       available: true },
      ],
      [
        { key: 'Alaska', label: 'Alaska', available: true },
        { key: 'Hawaii', label: 'Hawaii', available: true },
      ],
    ],
  },
  {
    category: 'World',
    rows: [
      [
        { key: 'World',               label: 'World',               available: true },
        { key: 'Northern Hemisphere', label: 'Northern Hemisphere', available: true },
        { key: 'Southern Hemisphere', label: 'Southern Hemisphere', available: true },
      ],
      [
        { key: 'North America', label: 'North America', available: true },
        { key: 'South America', label: 'South America', available: true },
        { key: 'Europe',        label: 'Europe',        available: true },
      ],
      [
        { key: 'Asia',      label: 'Asia',      available: true },
        { key: 'East Asia', label: 'East Asia', available: true },
        { key: 'Australia', label: 'Australia', available: true },
      ],
      [
        { key: 'Northern Africa', label: 'Northern Africa', available: true },
        { key: 'Middle East',     label: 'Middle East',     available: true },
        { key: 'Southern Africa', label: 'Southern Africa', available: true },
      ],
      [
        { key: 'Western Canada',   label: 'Western Canada',   available: true },
        { key: 'Canada',           label: 'Canada',           available: true },
        { key: 'Southeast Canada', label: 'Southeast Canada', available: true },
      ],
      [
        { key: 'India', label: 'India', available: true },
      ],
    ],
  },
  {
    category: 'Tropical & Equatorial',
    rows: [
      [
        { key: 'India',           label: 'India',           available: true },
        { key: 'Southern Africa', label: 'Southern Africa', available: true },
        { key: 'Northern Africa', label: 'Northern Africa', available: true },
      ],
      [
        { key: 'Indian Ocean',      label: 'Indian Ocean',      available: true },
        { key: 'Tropical Atlantic', label: 'Tropical Atlantic', available: true },
        { key: 'Western Atlantic',  label: 'Western Atlantic',  available: true },
      ],
      [
        { key: 'Western Pacific', label: 'Western Pacific', available: true },
        { key: 'Central Pacific', label: 'Central Pacific', available: true },
        { key: 'Eastern Pacific', label: 'Eastern Pacific', available: true },
      ],
      [
        { key: 'Southwest Pacific', label: 'Southwest Pacific', available: true },
        { key: 'Southeast Pacific', label: 'Southeast Pacific', available: true },
      ],
    ],
  },
  {
    category: 'Ocean Basins',
    rows: [
      [
        { key: 'North Pacific',   label: 'North Pacific',   available: true },
        { key: 'Western Pacific', label: 'Western Pacific', available: true },
        { key: 'Central Pacific', label: 'Central Pacific', available: true },
      ],
      [
        { key: 'Eastern Pacific',   label: 'Eastern Pacific',   available: true },
        { key: 'Southwest Pacific', label: 'Southwest Pacific', available: true },
        { key: 'Southeast Pacific', label: 'Southeast Pacific', available: true },
      ],
      [
        { key: 'North Atlantic',    label: 'North Atlantic',    available: true },
        { key: 'Western Atlantic',  label: 'Western Atlantic',  available: true },
        { key: 'Tropical Atlantic', label: 'Tropical Atlantic', available: true },
        { key: 'Indian Ocean',      label: 'Indian Ocean',      available: true },
      ],
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

const WIND_ANOMALY_OPTIONS: { value: WindAnomalyStyle; label: string }[] = [
  { value: 'speed_diff', label: 'Speed Anomaly' },
  { value: 'vector_mag', label: 'Vector Anomaly' },
]

const US_WIND_REGIONS = new Set([
  'CONUS',
  'Northwest US',
  'Northern Plains',
  'Central Plains',
  'Northeast',
  'Eastern US',
  'Southwest US',
  'South Central',
  'Southeast US',
  'Western US',
  'Alaska',
  'Hawaii',
])

const TROPICAL_FLOW_REGIONS = new Set([
  'Indian Ocean',
  'India',
  'Northern Africa',
  'Southern Africa',
  'Tropical Atlantic',
  'Western Pacific',
  'Central Pacific',
  'Eastern Pacific',
  'Southwest Pacific',
  'Southeast Pacific',
  'North Atlantic',
  'Western Atlantic',
  'Asia',
  'Middle East',
])

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

function formatScaleValue(value: number): string {
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value))
  return value.toFixed(1).replace(/\.0$/, '')
}

function scaleAnchorId(idx: number) {
  return `anchor-${idx}`
}

function anchorsFromValues(values: number[], colors: string[]): ScaleAnchor[] {
  return values.map((value, idx) => ({
    id: scaleAnchorId(idx),
    value,
    color: colors[idx] ?? colors[colors.length - 1] ?? '#ffffff',
  }))
}

function anchorsFromScaleMeta(meta: ScaleMeta | null): ScaleAnchor[] {
  const values = meta?.anchor_values ?? []
  const colors = meta?.anchor_hex ?? []
  if (!values.length || !colors.length) return []
  return anchorsFromValues(values, colors)
}

function anchorsFromPreset(preset: ScalePalettePreset, min: number, max: number): ScaleAnchor[] {
  if (preset.id === 'backend') return []
  if (preset.colors.length === 1) return anchorsFromValues([min], preset.colors)
  return anchorsFromValues(
    preset.colors.map((_, idx) => min + (idx / (preset.colors.length - 1)) * (max - min)),
    preset.colors,
  )
}

function sortedAnchors(anchors: ScaleAnchor[]) {
  return [...anchors].sort((a, b) => a.value - b.value)
}

function previewGradient(anchors: ScaleAnchor[], transition: ScaleTransition): string {
  const ordered = sortedAnchors(anchors)
  if (!ordered.length) return 'linear-gradient(90deg, #1e293b, #1e293b)'
  if (ordered.length === 1) return ordered[0].color
  if (transition === 'sampled') {
    return `linear-gradient(90deg, ${ordered.map(anchor => anchor.color).join(', ')})`
  }
  const min = ordered[0].value
  const max = ordered[ordered.length - 1].value
  const pct = (value: number) => max > min ? ((value - min) / (max - min)) * 100 : 0
  if (transition === 'discrete') {
    return `linear-gradient(90deg, ${ordered.map((anchor, idx) => {
      const left = idx === 0 ? 0 : (pct(ordered[idx - 1].value) + pct(anchor.value)) / 2
      const right = idx === ordered.length - 1 ? 100 : (pct(anchor.value) + pct(ordered[idx + 1].value)) / 2
      return `${anchor.color} ${left}%, ${anchor.color} ${right}%`
    }).join(', ')})`
  }
  return `linear-gradient(90deg, ${ordered.map(anchor => `${anchor.color} ${pct(anchor.value)}%`).join(', ')})`
}

function getScaleFamilies(variable: string, mode: DisplayMode): ScaleFamily[] {
  if (mode !== 'raw') {
    return [
      {
        key: 'shared',
        label: 'Shared',
        levels: LEVELS,
        description: 'This analysis scale is shared across levels for the selected variable.',
      },
    ]
  }

  if (variable === 'wind_speed') {
    return [
      { key: 'surface', label: 'Surface', levels: [1000], description: 'Surface wind scale.' },
      { key: 'low', label: 'Low', levels: [925, 850, 700, 600], description: 'Lower-tropospheric wind scale.' },
      { key: 'mid', label: 'Mid', levels: [500, 400], description: 'Mid-level wind scale.' },
      { key: 'high', label: 'High', levels: [300, 250, 200, 150, 100, 70, 50, 20, 10], description: 'Upper-level wind scale.' },
    ]
  }

  if (variable === 'temp') {
    return [
      { key: 'surface', label: 'Surface', levels: [1000], description: 'Surface temperature scale with Fahrenheit breakpoints.' },
      { key: 'low', label: 'Low', levels: [925, 850, 700], description: 'Lower-level temperature scales with fixed meteorological anchors.' },
      { key: 'other', label: 'Other', levels: [600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 20, 10], description: 'Levels currently using the generic fallback path.' },
    ]
  }

  if (variable === 'rel_humidity') {
    return [
      {
        key: 'shared',
        label: 'Shared',
        levels: LEVELS,
        description: 'Relative humidity uses one shared stepped scale across levels.',
      },
    ]
  }

  return [
    {
      key: 'shared',
      label: 'Shared',
      levels: LEVELS,
      description: 'This variable currently uses one shared scale family across levels.',
    },
  ]
}

function resolveScaleFamily(variable: string, mode: DisplayMode, level: string): ScaleFamily {
  const families = getScaleFamilies(variable, mode)
  return families.find(f => f.levels.includes(Number(level))) ?? families[0]
}

function levelOptionsForVariable(variable: string): { value: string; label: string }[] {
  if (variable === 'wind_speed') {
    return [{ value: 'surface_10m', label: 'Surface (10m)' }, ...LEVELS.map(l => ({ value: String(l), label: String(l) }))]
  }
  if (variable === 'temp') {
    return [{ value: 'surface_2m', label: 'Surface (2m)' }, ...LEVELS.map(l => ({ value: String(l), label: String(l) }))]
  }
  if (variable === 'pressure') {
    return [{ value: 'surface_mslp', label: 'Surface (MSLP)' }]
  }
  return LEVELS.map(l => ({ value: String(l), label: String(l) }))
}

function apiVariableForSelection(variable: string, level: string): string {
  if (variable === 'wind_speed' && level === 'surface_10m') return 'wind_10m'
  if (variable === 'temp' && level === 'surface_2m') return 'temp_2m'
  if (variable === 'pressure') return 'surface_pressure'
  return variable
}

function apiLevelForSelection(level: string): string {
  return SURFACE_LEVELS.has(level) ? '1000' : level
}

function getWindAnomalyRecommendation(region: string, level: string): WindAnomalyRecommendation {
  const mb = Number(level)
  if (US_WIND_REGIONS.has(region) && mb >= 700 && mb <= 1000) {
    return {
      style: 'speed_diff',
      label: 'Recommended: Speed Anomaly',
      reason: '850 mb wind anomalies over U.S. regions usually start with intensity departures.',
    }
  }
  if (TROPICAL_FLOW_REGIONS.has(region) && mb >= 700 && mb <= 1000) {
    return {
      style: 'vector_mag',
      label: 'Recommended: Vector Anomaly',
      reason: 'Low-level tropical and monsoon analyses often hinge on directional departures from climatology.',
    }
  }
  if (mb <= 300) {
    return {
      style: 'speed_diff',
      label: 'Often useful: Speed Anomaly',
      reason: 'Upper-level jet diagnostics often start with faster or slower than normal flow, though displaced jets may still need vector anomaly.',
    }
  }
  if (mb >= 700) {
    return {
      style: 'speed_diff',
      label: 'Often useful: Speed Anomaly',
      reason: 'Low-level wind anomaly maps often start with intensity unless the circulation direction is the focus.',
    }
  }
  return {
    style: 'vector_mag',
    label: 'Choose by question',
    reason: 'Vector anomaly shows circulation departures; speed anomaly shows intensity departures.',
  }
}

// ── Design primitives ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest select-none">
      {children}
    </span>
  )
}

function RegionThumbnail({ regionKey, selected }: { regionKey: string; selected: boolean }) {
  const src = REGION_THUMBNAILS[regionKey]
  if (!src) return null

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`h-[52px] w-[52px] shrink-0 object-cover ${selected ? 'opacity-95' : 'opacity-85'}`}
    />
  )
}

function getRegionLabel(regionKey: string) {
  for (const section of REGION_SECTIONS) {
    for (const row of section.rows) {
      const region = row.find(r => r.key === regionKey)
      if (region) return region.label
    }
  }
  return regionKey
}

// Connected horizontal tab strip — pass fullWidth to stretch across the parent
function TabStrip({ options, value, onChange, fullWidth = false, disabled = false }: {
  options: { value: string; label: string; disabled?: boolean }[]
  value: string
  onChange: (v: string) => void
  fullWidth?: boolean
  disabled?: boolean
}) {
  return (
    <div className={`flex rounded overflow-hidden border border-slate-600 text-xs font-medium ${fullWidth ? 'w-full' : 'w-fit'}`}>
      {options.map(opt => {
        const optionDisabled = disabled || Boolean(opt.disabled)
        return (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)} disabled={optionDisabled}
          className={`${fullWidth ? 'flex-1 text-center' : ''} px-2.5 py-1 transition-colors ${
            optionDisabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
          } ${
            value === opt.value
              ? 'bg-sky-700 text-white'
              : `bg-slate-800 text-slate-400 ${optionDisabled ? '' : 'hover:bg-slate-700'}`
          }`}>
          {opt.label}
        </button>
        )
      })}
    </div>
  )
}

function WindAnomalyInfo({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
        aria-label="Wind anomaly guidance"
        aria-expanded={open}
      >
        <CircleHelp size={13} />
      </button>
      {open ? (
        <div className="absolute right-0 top-6 z-30 w-72 rounded-lg border border-slate-600 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300 shadow-xl">
          <p>Use vector wind anomaly when direction matters.</p>
          <p className="mt-1">Use wind speed anomaly when intensity matters.</p>
          <p className="mt-2 text-slate-500">
            Vector anomaly overlays show departure flow. Calculation details are on the FAQ page.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function VariableDisplayControl({
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

function ToggleButton({
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
function HourStepper({ hour, setHour, compact = false }: { hour: string; setHour: (h: string) => void; compact?: boolean }) {
  const idx = HOURS.indexOf(hour)
  const prev = () => setHour(HOURS[(idx - 1 + HOURS.length) % HOURS.length])
  const next = () => setHour(HOURS[(idx + 1) % HOURS.length])
  return (
    <div className="flex items-center rounded overflow-hidden border border-slate-600 shrink-0">
      <button type="button" onClick={prev}
        className={`${compact ? 'px-1' : 'px-1.5'} py-1 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors`}>
        <ChevronLeft size={compact ? 11 : 13} />
      </button>
      <span className={`${compact ? 'min-w-[2.35rem] px-1.5' : 'min-w-[3rem] px-2.5'} py-1 bg-slate-800 text-xs font-mono text-slate-200 select-none text-center`}>
        {hour}z
      </span>
      <button type="button" onClick={next}
        className={`${compact ? 'px-1' : 'px-1.5'} py-1 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white cursor-pointer transition-colors`}>
        <ChevronRight size={compact ? 11 : 13} />
      </button>
    </div>
  )
}

function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-700/60 rounded-xl px-4 pt-4 pb-5 flex flex-col gap-3 ${className}`}>
      {children}
    </div>
  )
}

function CardRow({ children = null, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-[50px] ${className}`}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function App({ adminMode = false }: { adminMode?: boolean }) {
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
  const [openRegionSections, setOpenRegionSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REGION_SECTIONS.map(section => [section.category, section.defaultOpen ?? false]))
  )

  const [displayMode, setDisplayMode] = useState<DisplayMode>('raw')

  const [windOn,    setWindOn]    = useState(false)
  const [windStep,  setWindStep]  = useState('2')
  const [windType,  setWindType]  = useState('vectors')
  const [windAnomalyStyle, setWindAnomalyStyle] = useState<WindAnomalyStyle>('speed_diff')
  const [windUnit, setWindUnit] = useState<WindUnit>('kt')
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>('F')
  const [heightDisplay, setHeightDisplay] = useState<HeightDisplay>('contoured')
  const [colorStep, setColorStep] = useState('1')
  const [scaleMin,  setScaleMin]  = useState('')
  const [scaleMax,  setScaleMax]  = useState('')

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scaleLabOpen, setScaleLabOpen] = useState(false)
  const [windAnomalyHelpOpen, setWindAnomalyHelpOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [climoSource,  setClimoSource]  = useState<ClimoSource>('r2-monthly')

  const [mapSrc,  setMapSrc]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [labVariable, setLabVariable] = useState('wind_speed')
  const [labLevel, setLabLevel] = useState('850')
  const [labMode, setLabMode] = useState<DisplayMode>('raw')
  const [labFamily, setLabFamily] = useState('low')
  const [scaleMeta, setScaleMeta] = useState<ScaleMeta | null>(null)
  const [scaleMetaError, setScaleMetaError] = useState<string | null>(null)
  const [scaleMetaLoading, setScaleMetaLoading] = useState(false)
  const [scalePreset, setScalePreset] = useState('backend')
  const [scaleTransition, setScaleTransition] = useState<ScaleTransition>('smooth')
  const [scaleAnchors, setScaleAnchors] = useState<ScaleAnchor[]>([])

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const isVertical  = layoutMode === 'vertical'

  const apiVariable = apiVariableForSelection(variable, level)
  const apiLevel = apiLevelForSelection(level)
  const levelOptions = levelOptionsForVariable(variable)
  const isClimo     = timeScale === 'climatology'
  const isMonthly   = timeScale === 'monthly'
  const isSixHourly = timeScale === '6-hourly'
  const isFlxVariable = FLX_VARIABLES.has(apiVariable)
  const labFamilies = getScaleFamilies(labVariable, labMode)
  const activeFamily = labFamilies.find(f => f.key === labFamily) ?? labFamilies[0]
  const windAnomalyRecommendation = getWindAnomalyRecommendation(region, level)
  const labWindAnomalyRecommendation = getWindAnomalyRecommendation(region, labLevel)

  useEffect(() => {
    if (!isFlxVariable) return
    if (displayMode !== 'raw') setDisplayMode('raw')
    if (timeScale === 'monthly' || timeScale === 'climatology') setTimeScale('6-hourly')
  }, [displayMode, isFlxVariable, timeScale])

  useEffect(() => {
    if (!levelOptions.some(opt => opt.value === level)) {
      setLevel(levelOptions[0]?.value ?? '850')
    }
  }, [level, levelOptions])

  useEffect(() => {
    if (apiVariable === 'temp_2m' || apiVariable === 'wind_10m' || apiVariable === 'surface_pressure') {
      setWindOn(true)
      setWindType('barbs')
    }
  }, [apiVariable])

  useEffect(() => {
    if (!adminMode) return

    const params = new URLSearchParams({
      variable: labVariable,
      level: labLevel,
      color_step: colorStep || '1',
      mode: labMode,
    })
    if (labVariable === 'wind_speed' && labMode === 'anomaly') {
      params.set('wind_anomaly_style', windAnomalyStyle)
    }
    if (labVariable === 'wind_speed') {
      params.set('wind_unit', windUnit)
      if (scaleMin.trim()) params.set('scale_min', scaleMin.trim())
      if (scaleMax.trim()) params.set('scale_max', scaleMax.trim())
    }

    const controller = new AbortController()

    async function loadScaleMeta() {
      setScaleMetaLoading(true)
      setScaleMetaError(null)

      try {
        const res = await fetch(`${API_BASE}/api/scale-meta?${params.toString()}`, { signal: controller.signal })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
          throw new Error(body.detail ?? `HTTP ${res.status}`)
        }
        setScaleMeta(await res.json())
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setScaleMetaError(err instanceof Error ? err.message : String(err))
        setScaleMeta(null)
      } finally {
        setScaleMetaLoading(false)
      }
    }

    void loadScaleMeta()

    return () => controller.abort()
  }, [adminMode, colorStep, labLevel, labMode, labVariable, scaleMax, scaleMin, windAnomalyStyle, windUnit])

  useEffect(() => {
    const backendAnchors = anchorsFromScaleMeta(scaleMeta)
    if (backendAnchors.length) {
      setScaleAnchors(backendAnchors)
      setScalePreset('backend')
    }
  }, [scaleMeta])

  function openScaleLab() {
    setLabVariable(apiVariable)
    setLabLevel(apiLevel)
    setLabMode(isClimo ? 'raw' : displayMode)
    setLabFamily(resolveScaleFamily(apiVariable, isClimo ? 'raw' : displayMode, apiLevel).key)
    setScaleLabOpen(true)
  }

  function toggleRegionSection(category: string) {
    setOpenRegionSections(openSections => ({
      ...openSections,
      [category]: !openSections[category],
    }))
  }

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

    const params: Record<string, string> = { variable: apiVariable, level: apiLevel, region }

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
        if (dates.length === 1) {
          params.date = dates[0]
        } else {
          params.dates = dates.join(',')
        }
      }
    }

    if (windOn && windStep) { params.wind_step = windStep; params.wind_type = windType }
    if (colorStep && colorStep !== '1') params.color_step = colorStep
    if (apiVariable === 'wind_speed' && displayMode === 'anomaly') {
      params.wind_anomaly_style = windAnomalyStyle
    }
    if (apiVariable === 'wind_speed' || apiVariable === 'wind_10m') {
      params.wind_unit = windUnit
      if (scaleMin.trim()) params.scale_min = scaleMin.trim()
      if (scaleMax.trim()) params.scale_max = scaleMax.trim()
    }

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

  function renderTimeScaleControls() {
    return (
      <TabStrip
        options={[
          { value: '6-hourly',    label: '6-Hourly' },
          { value: 'daily',       label: 'Daily' },
          { value: 'monthly',     label: 'Monthly', disabled: isFlxVariable },
          { value: 'climatology', label: 'Climatology', disabled: isFlxVariable },
        ]}
        value={timeScale}
        onChange={v => setTimeScale(v as TimeScale)}
        fullWidth
      />
    )
  }

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
        {dateSubMode === 'single' && (
          <div className={`${isVertical ? 'gap-1' : 'gap-2'} flex min-w-0 items-center`}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input min-w-0 flex-1" />
            {isSixHourly && <HourStepper hour={hour} setHour={setHour} compact={isVertical} />}
          </div>
        )}
        {dateSubMode === 'range' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input min-w-0" />
              <span className="text-slate-600 text-xs">→</span>
              <input type="date" value={endDate}   onChange={e => setEndDate(e.target.value)}   className="input min-w-0" />
              {isSixHourly && <HourStepper hour={hour} setHour={setHour} compact={isVertical} />}
              {startDate && endDate && startDate <= endDate && (
                <span className="text-slate-500 text-xs">{dateRange(startDate, endDate).length}d</span>
              )}
            </div>
            {/*{!isSixHourly && startDate && endDate && startDate < endDate && (*/}
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

  function renderScaleInspector() {
    if (!adminMode) return null

    const boundaries = scaleMeta?.boundaries ?? []
    const intervalHex = scaleMeta?.interval_hex ?? []
    const anchors = scaleMeta?.anchor_values ?? []
    const keyBreaks = scaleMeta?.key_breakpoints ?? []
    const min = boundaries[0]
    const max = boundaries[boundaries.length - 1]
    const keyBreakOffsets = (min !== undefined && max !== undefined && max > min)
      ? keyBreaks
          .filter(v => v >= min && v <= max)
          .map(v => ({ value: v, left: ((v - min) / (max - min)) * 100 }))
      : []
    const designerAnchors = sortedAnchors(scaleAnchors)
    const designerGradient = previewGradient(designerAnchors, scaleTransition)
    const presetFamilies = Array.from(new Set(SCALE_PALETTE_PRESETS.map(preset => preset.family)))
    const hasDesignerDomain = min !== undefined && max !== undefined && max > min

    function applyScalePreset(preset: ScalePalettePreset) {
      setScalePreset(preset.id)
      if (preset.id === 'backend') {
        const backendAnchors = anchorsFromScaleMeta(scaleMeta)
        if (backendAnchors.length) setScaleAnchors(backendAnchors)
        return
      }
      if (hasDesignerDomain) {
        setScaleAnchors(anchorsFromPreset(preset, min, max))
      }
    }

    function updateScaleAnchor(id: string, patch: Partial<ScaleAnchor>) {
      setScalePreset('custom')
      setScaleAnchors(prev => prev.map(anchor => anchor.id === id ? { ...anchor, ...patch } : anchor))
    }

    function addScaleAnchor() {
      if (!hasDesignerDomain) return
      const ordered = sortedAnchors(scaleAnchors)
      const value = ordered.length
        ? (ordered[Math.floor((ordered.length - 1) / 2)].value + ordered[Math.ceil((ordered.length - 1) / 2)].value) / 2
        : (min + max) / 2
      setScalePreset('custom')
      setScaleAnchors(prev => [...prev, { id: `anchor-${Date.now()}`, value, color: '#ffffff' }])
    }

    function removeScaleAnchor(id: string) {
      setScalePreset('custom')
      setScaleAnchors(prev => prev.filter(anchor => anchor.id !== id))
    }

    return (
      <div className="flex flex-col gap-4">
        {labVariable === 'wind_speed' && (
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <Label>Experimental Wind Scale</Label>
                <p className="text-sm text-slate-200 mt-1">Remap the wind domain while keeping the same palette and interpolation.</p>
              </div>
              <button
                type="button"
                onClick={() => { setScaleMin(''); setScaleMax('') }}
                className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
              >
                Reset
              </button>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Min</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={scaleMin}
                  onChange={e => setScaleMin(e.target.value)}
                  placeholder="default"
                  className="input w-28"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Max</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={scaleMax}
                  onChange={e => setScaleMax(e.target.value)}
                  placeholder="default"
                  className="input w-28"
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Useful for trying alternate wind-scale ranges in the currently selected unit without changing renderer code.
            </p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Label>Admin Scale Lab</Label>
            <p className="text-sm text-slate-200 mt-1">
              Browse the resolved backend scales by variable, level, and analysis mode.
            </p>
          </div>
          {scaleMeta && (
            <div className="text-right text-[11px] text-slate-400 leading-relaxed">
              <div>Kind: <span className="text-slate-200">{scaleMeta.scale_kind ?? 'n/a'}</span></div>
              {scaleMeta.group && <div>Group: <span className="text-slate-200">{scaleMeta.group}</span></div>}
              {scaleMeta.unit && <div>Unit: <span className="text-slate-200">{scaleMeta.unit}</span></div>}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr]">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Variable</p>
            <div className="flex flex-wrap gap-2">
              {SCALE_LAB_VARIABLES.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    const nextFamily = resolveScaleFamily(opt.key, labMode, labLevel)
                    setLabVariable(opt.key)
                    setLabFamily(nextFamily.key)
                    if (!nextFamily.levels.includes(Number(labLevel))) {
                      setLabLevel(String(nextFamily.levels[0]))
                    }
                  }}
                  className={`rounded px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                    labVariable === opt.key
                      ? 'bg-sky-700 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Mode</p>
            <TabStrip
              options={[
                { value: 'raw', label: 'Raw' },
                { value: 'anomaly', label: 'Anomaly' },
                { value: 'normalized', label: 'Norm' },
              ]}
              value={labMode}
              onChange={v => {
                const nextMode = v as DisplayMode
                const nextFamily = resolveScaleFamily(labVariable, nextMode, labLevel)
                setLabMode(nextMode)
                setLabFamily(nextFamily.key)
                if (!nextFamily.levels.includes(Number(labLevel))) {
                  setLabLevel(String(nextFamily.levels[0]))
                }
              }}
              fullWidth
            />
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Color Interval</p>
            <input
              type="number"
              min={1}
              max={50}
              value={colorStep}
              onChange={e => setColorStep(e.target.value)}
              className="input w-24"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Changes displayed bin spacing only. It does not spatially smooth the underlying data field.
            </p>
          </div>
        </div>

        {labVariable === 'wind_speed' && labMode === 'anomaly' && (
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-widest text-slate-500">Wind Anomaly Type</p>
              <WindAnomalyInfo
                open={windAnomalyHelpOpen}
                onToggle={() => setWindAnomalyHelpOpen(open => !open)}
              />
            </div>
            <TabStrip
              options={WIND_ANOMALY_OPTIONS}
              value={windAnomalyStyle}
              onChange={v => setWindAnomalyStyle(v as WindAnomalyStyle)}
              fullWidth
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{labWindAnomalyRecommendation.label}</p>
          </div>
        )}

        {labVariable === 'wind_speed' && (
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Wind Units</p>
            <TabStrip
              options={[
                { value: 'kt', label: 'Knots' },
                { value: 'm/s', label: 'm/s' },
              ]}
              value={windUnit}
              onChange={v => setWindUnit(v as WindUnit)}
              fullWidth
            />
          </div>
        )}

        <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Scale Family</p>
            <p className="text-[11px] text-slate-500">Browse shared scale definitions before choosing a level.</p>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {labFamilies.map(family => (
              <button
                key={family.key}
                type="button"
                onClick={() => {
                  setLabFamily(family.key)
                  if (!family.levels.includes(Number(labLevel))) {
                    setLabLevel(String(family.levels[0]))
                  }
                }}
                className={`rounded px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  activeFamily?.key === family.key
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {family.label}
              </button>
            ))}
          </div>
          {activeFamily && (
            <p className="text-[11px] text-slate-500 mb-3">{activeFamily.description}</p>
          )}
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Levels In Family</p>
            <p className="text-[11px] text-slate-500">
              {activeFamily ? `${activeFamily.levels.length} level${activeFamily.levels.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(activeFamily?.levels ?? LEVELS).map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLabLevel(String(lvl))}
                className={`rounded px-2.5 py-1.5 text-xs font-mono transition-colors cursor-pointer ${
                  labLevel === String(lvl)
                    ? 'bg-sky-700 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {scaleMetaLoading && <p className="text-sm text-slate-400 animate-pulse">Resolving scale…</p>}
        {scaleMetaError && (
          <div className="text-red-400 bg-red-950 border border-red-700 rounded px-4 py-3 text-sm">
            {scaleMetaError}
          </div>
        )}

        {scaleMeta && boundaries.length > 1 && intervalHex.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400 mb-2">
                <span>
                  Domain: <span className="text-slate-200">{formatScaleValue(min)}–{formatScaleValue(max)} {scaleMeta.unit ?? ''}</span>
                </span>
                <span>
                  Intervals: <span className="text-slate-200">{intervalHex.length}</span>
                </span>
              </div>
              <div className="relative">
                <div className="h-8 w-full overflow-hidden rounded-md border border-slate-700 flex">
                  {intervalHex.map((hex, idx) => (
                    <div key={`${hex}-${idx}`} className="h-full flex-1" style={{ backgroundColor: hex }} />
                  ))}
                </div>
                {keyBreakOffsets.map(bp => (
                  <div
                    key={bp.value}
                    className="absolute top-0 bottom-0 w-px bg-white/80"
                    style={{ left: `${bp.left}%` }}
                    title={`Key breakpoint ${formatScaleValue(bp.value)} ${scaleMeta.unit ?? ''}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>{formatScaleValue(min)}</span>
                <span>{formatScaleValue((min + max) / 2)}</span>
                <span>{formatScaleValue(max)}</span>
              </div>
              {keyBreakOffsets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {keyBreakOffsets.map(bp => (
                    <span key={`key-${bp.value}`} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 font-mono">
                      key {formatScaleValue(bp.value)} {scaleMeta.unit ?? ''}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-slate-500">Scale Designer</p>
                  <p className="mt-1 text-sm text-slate-200">Experiment with palette presets, anchor colors, and transition behavior.</p>
                </div>
                <span className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-400">
                  preview only
                </span>
              </div>

              <div className="mb-4 h-10 w-full overflow-hidden rounded-md border border-slate-700" style={{ background: designerGradient }} />

              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-lg bg-slate-900/70 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-widest text-slate-500">Palette Presets</p>
                    {scalePreset === 'custom' && <span className="text-[11px] text-sky-300">Custom</span>}
                  </div>
                  <div className="flex flex-col gap-3">
                    {presetFamilies.map(family => (
                      <div key={family}>
                        <p className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-600">{family}</p>
                        <div className="flex flex-wrap gap-2">
                          {SCALE_PALETTE_PRESETS.filter(preset => preset.family === family).map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyScalePreset(preset)}
                              disabled={!hasDesignerDomain && preset.id !== 'backend'}
                              className={`rounded px-2.5 py-1.5 text-xs transition-colors ${
                                scalePreset === preset.id
                                  ? 'bg-sky-700 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              } ${!hasDesignerDomain && preset.id !== 'backend' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900/70 p-3">
                  <p className="mb-2 text-[11px] uppercase tracking-widest text-slate-500">Transition</p>
                  <TabStrip
                    options={[
                      { value: 'smooth', label: 'Smooth' },
                      { value: 'discrete', label: 'Stepped' },
                      { value: 'sampled', label: 'Sampled' },
                    ]}
                    value={scaleTransition}
                    onChange={v => setScaleTransition(v as ScaleTransition)}
                    fullWidth
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Smooth interpolates between anchors. Stepped creates hard color bands. Sampled preserves preset color order.
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-slate-900/70 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500">Anchor Editor</p>
                  <button
                    type="button"
                    onClick={addScaleAnchor}
                    disabled={!hasDesignerDomain}
                    className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={12} />
                    Anchor
                  </button>
                </div>
                <div className="grid gap-2">
                  {designerAnchors.map((anchor, idx) => (
                    <div key={anchor.id} className="grid grid-cols-[2.5rem_1fr_7rem_2rem] items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-mono">{idx + 1}</span>
                      <input
                        type="number"
                        value={Number.isFinite(anchor.value) ? anchor.value : 0}
                        onChange={e => updateScaleAnchor(anchor.id, { value: Number(e.target.value) })}
                        className="input w-full"
                      />
                      <label className="flex h-8 items-center overflow-hidden rounded border border-slate-700 bg-slate-800">
                        <span className="h-full w-8 shrink-0" style={{ backgroundColor: anchor.color }} />
                        <input
                          type="color"
                          value={anchor.color}
                          onChange={e => updateScaleAnchor(anchor.id, { color: e.target.value })}
                          className="h-8 w-full cursor-pointer border-0 bg-transparent p-0"
                          aria-label={`Anchor ${idx + 1} color`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeScaleAnchor(anchor.id)}
                        disabled={designerAnchors.length <= 2}
                        className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label={`Remove anchor ${idx + 1}`}
                      >
                        <Minus size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Anchors</p>
                <div className="flex flex-wrap gap-2">
                  {anchors.map((value, idx) => (
                    <span key={`anchor-${value}-${idx}`} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 font-mono">
                      {formatScaleValue(value)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Anchor Colors</p>
                <div className="flex flex-wrap gap-2">
                  {(scaleMeta.anchor_hex ?? []).map((hex, idx) => (
                    <span key={`${hex}-${idx}`} className="inline-flex items-center gap-2 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 font-mono">
                      <span className="h-3 w-3 rounded-sm border border-slate-500" style={{ backgroundColor: hex }} />
                      {hex}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Resolved Config</p>
                <div className="space-y-1 text-[11px] text-slate-300 font-mono">
                  <div>variable: {labVariable}</div>
                  <div>family: {activeFamily?.key ?? 'n/a'}</div>
                  <div>level: {labLevel} mb</div>
                  <div>mode: {labMode}</div>
                  {labVariable === 'wind_speed' && labMode === 'anomaly' && <div>anomaly: {windAnomalyStyle}</div>}
                  {labVariable === 'wind_speed' && <div>unit: {windUnit}</div>}
                  {scaleMeta.domain_min !== undefined && scaleMeta.domain_max !== undefined && (
                    <div>domain: {formatScaleValue(scaleMeta.domain_min)} to {formatScaleValue(scaleMeta.domain_max)}</div>
                  )}
                  {scaleMeta.step !== undefined && <div>color_step: {scaleMeta.step}</div>}
                  <div>boundaries: {boundaries.length}</div>
                  <div>intervals: {intervalHex.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-slate-950 text-slate-100 flex flex-col ${isVertical ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative bg-slate-900 border-b border-slate-700 px-5 py-2 flex items-center gap-3">
        <Wind className="text-sky-400 shrink-0" size={20} />
        <span className="font-bold tracking-tight text-sm">PyRe</span>
        <span className="hidden sm:inline text-slate-400 text-sm font-light">Climate Reanalysis</span>
        <span className="hidden sm:inline text-[10px] text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">CORe / NCEP</span>

        {/* Time scale — far right of header */}
        <div className="ml-auto hidden md:flex items-center gap-3">
          <Link
            to="/faq"
            className="inline-flex items-center gap-2 rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            title="Open FAQ"
          >
            <CircleHelp size={14} />
            FAQ
          </Link>
          {renderTimeScaleControls()}
	          {adminMode ? (
	            <button
	              type="button"
	              onClick={openScaleLab}
	              className="inline-flex items-center gap-2 rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
	              title="Open scale lab"
	            >
              Scale Lab
            </button>
          ) : (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Open scale lab"
            >
              Scale Lab
            </Link>
          )}
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
        <button
          type="button"
          onClick={() => setMobileMenuOpen(open => !open)}
          className="ml-auto rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        {mobileMenuOpen && (
          <div className="absolute right-3 top-11 z-40 w-48 rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-xl md:hidden">
            <Link
              to="/faq"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 rounded px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              <CircleHelp size={14} />
              FAQ
            </Link>
            {adminMode ? (
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); openScaleLab() }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
              >
                Scale Lab
              </button>
            ) : (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Scale Lab
              </Link>
            )}
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); setLayoutMode(m => m === 'horizontal' ? 'vertical' : 'horizontal') }}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
            >
              {isVertical ? <LayoutGrid size={14} /> : <PanelLeft size={14} />}
              {isVertical ? 'Grid Layout' : 'Side-by-Side'}
            </button>
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); setSettingsOpen(o => !o) }}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
            >
              <Settings size={14} />
              Settings
            </button>
          </div>
        )}
      </header>

      <form onSubmit={handleGenerate}
        className={isVertical ? 'flex flex-1 min-h-0 overflow-hidden' : 'p-4 flex flex-col gap-4'}>

        {/* ── Card panels ─────────────────────────────────────────────────── */}
        <div className={isVertical
          ? 'w-72 shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
          : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch'}>

          {/* Mobile · Time Scale */}
          <Section className="h-full md:hidden">
            <CardRow>
              <VariableDisplayControl label="Time Scale">
                {renderTimeScaleControls()}
              </VariableDisplayControl>
            </CardRow>
          </Section>

          {/* 1 · Variable & Level */}
          <Section className="h-full">
            <CardRow>
            <div className="flex gap-2 items-end">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label>Variable</Label>
                <select
                  value={variable === 'humidity' ? 'rel_humidity' : variable}
                  onChange={e => {
                    const nextVariable = e.target.value
                    setVariable(nextVariable)
                    const nextLevel = levelOptionsForVariable(nextVariable)[0]?.value ?? '850'
                    setLevel(nextLevel)
                  }}
                  className="input w-full"
                >
                  {VARIABLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Label>Level (mb)</Label>
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                  className="input"
                >
                  {levelOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

            </div>
            </CardRow>
            {(variable === 'wind_speed' || variable === 'temp' || variable === 'pressure' || variable === 'height' || variable === 'rel_humidity' || variable === 'humidity') && (
              <CardRow>
                {variable === 'wind_speed' && (
                  <VariableDisplayControl label="Wind Units">
                    <TabStrip
                      options={[
                        { value: 'kt', label: 'Knots' },
                        { value: 'm/s', label: 'm/s' },
                      ]}
                      value={windUnit}
                      onChange={v => setWindUnit(v as WindUnit)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'temp' && (
                  <VariableDisplayControl label="Temperature Units" status="Coming soon">
                    <TabStrip
                      options={[
                        { value: 'F', label: '°F' },
                        { value: 'C', label: '°C' },
                      ]}
                      value={temperatureUnit}
                      onChange={v => setTemperatureUnit(v as TemperatureUnit)}
                      fullWidth
                      disabled
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'pressure' && (
                  <VariableDisplayControl label="Pressure Display">
                    <TabStrip
                      options={[
                        { value: 'contoured', label: 'Contoured' },
                        { value: 'shaded', label: 'Shaded', disabled: true },
                      ]}
                      value="contoured"
                      onChange={() => {}}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'height' && (
                  <VariableDisplayControl label="Height Display" status="Coming soon">
                    <TabStrip
                      options={[
                        { value: 'contoured', label: 'Contoured' },
                        { value: 'shaded', label: 'Shaded' },
                      ]}
                      value={heightDisplay}
                      onChange={v => setHeightDisplay(v as HeightDisplay)}
                      fullWidth
                      disabled
                    />
                  </VariableDisplayControl>
                )}
                {(variable === 'rel_humidity' || variable === 'humidity') && (
                  <VariableDisplayControl label="Humidity Type">
                    <TabStrip
                      options={[
                        { value: 'rel_humidity', label: 'Relative' },
                        { value: 'humidity', label: 'Specific' },
                      ]}
                      value={variable}
                      onChange={setVariable}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
              </CardRow>
            )}
          </Section>

          {/* 2 · Temporal Range */}
          <Section className="h-full">
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

          {/* 3 · Region */}
          <Section className="h-full">
            <CardRow>
            <VariableDisplayControl label="Region">
              <button type="button" onClick={() => setRegionsOpen(true)}
                className="min-h-8 w-full rounded bg-sky-700 px-3 py-1.5 text-center text-xs font-semibold text-white cursor-pointer transition-colors hover:bg-sky-600">
                {getRegionLabel(region)}
              </button>
            </VariableDisplayControl>
            </CardRow>
            <CardRow>
            <VariableDisplayControl label="Region List">
              <button type="button" onClick={() => setRegionsOpen(true)}
                className="w-full rounded bg-slate-800 px-3 py-1.5 text-center text-xs font-semibold text-slate-300 cursor-pointer transition-colors hover:bg-slate-700">
                All Regions
              </button>
            </VariableDisplayControl>
            </CardRow>
          </Section>

          {/* 4 · Analysis + Generate */}
          <Section className="h-full">
            <CardRow>
            <VariableDisplayControl label="Analysis">
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
                  { value: 'anomaly',    label: 'Anomaly', disabled: isFlxVariable },
                  { value: 'normalized', label: 'Normalized', disabled: isFlxVariable },
                ]}
                value={displayMode}
                onChange={v => setDisplayMode(v as DisplayMode)}
                fullWidth
              />
            )}
            </VariableDisplayControl>
            </CardRow>
            {variable === 'wind_speed' && !isClimo && displayMode === 'anomaly' && (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Label>Wind Anomaly Type</Label>
                  <WindAnomalyInfo
                    open={windAnomalyHelpOpen}
                    onToggle={() => setWindAnomalyHelpOpen(open => !open)}
                  />
                </div>
                <TabStrip
                  options={WIND_ANOMALY_OPTIONS}
                  value={windAnomalyStyle}
                  onChange={v => setWindAnomalyStyle(v as WindAnomalyStyle)}
                  fullWidth
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{windAnomalyRecommendation.label}</p>
              </div>
            )}
            <CardRow>
            <VariableDisplayControl label="Render">
            <button type="submit" disabled={loading}
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 active:bg-sky-700
                         disabled:opacity-50 font-bold text-xs tracking-wide cursor-pointer transition-colors w-full">
              {generateLabel()}
            </button>
            </VariableDisplayControl>
            </CardRow>
          </Section>

        </div>

        {/* ── Advanced composition panels ─────────────────────────────────── */}
        <div className={isVertical
          ? 'w-72 shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
          : 'grid grid-cols-1 lg:grid-cols-2 gap-3'}>
          <Section>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-sky-400" />
              <Label>Decorations</Label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 pt-2 border-t border-slate-700/40">
              <Label>Wind Overlay</Label>
              <button type="button" role="switch" aria-checked={windOn}
                onClick={() => setWindOn(o => !o)}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors cursor-pointer ${windOn ? 'bg-sky-600' : 'bg-slate-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${windOn ? 'translate-x-3' : 'translate-x-0'}`} />
              </button>

              <div className={`flex items-center gap-6 ml-auto transition-opacity ${windOn ? '' : 'opacity-30 pointer-events-none'}`}>
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
                <Label>Density</Label>
                <input type="number" min={1} max={20} value={windStep}
                  onChange={e => setWindStep(e.target.value)}
                  className="input w-10 text-center px-1" />

              </div>
            </div>
              <VariableDisplayControl label="Contours" status="Coming soon">
                <div className="grid grid-cols-3 gap-1">
                  <ToggleButton active={false} disabled onClick={() => {}}>Height</ToggleButton>
                  <ToggleButton active={false} disabled onClick={() => {}}>Pressure</ToggleButton>
                  <ToggleButton active={false} disabled onClick={() => {}}>Temp</ToggleButton>
                </div>
              </VariableDisplayControl>
            </div>
          </Section>

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
                  <img key={mapSrc} src={mapSrc} alt="Climate reanalysis map" className="max-w-full xl:max-w-[75%] rounded shadow-xl" />
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
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,72rem)] h-[min(84vh,48rem)] shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                <span className="font-semibold text-base">Select Region</span>
                <button type="button" onClick={() => setRegionsOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                {REGION_SECTIONS.map(section => (
                  <div
                    key={section.category}
                    className={`${openRegionSections[section.category] ? 'bg-slate-700/55' : ''} first:rounded-t-lg last:rounded-b-lg overflow-hidden`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRegionSection(section.category)}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                        openRegionSections[section.category] ? 'bg-transparent' : 'bg-slate-800/35 hover:bg-slate-800/55'
                      }`}
                      aria-expanded={openRegionSections[section.category] ?? false}
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        {openRegionSections[section.category] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span>{section.category}</span>
                      </span>
                      <span className="text-slate-500">
                        {openRegionSections[section.category] ? <Minus size={15} /> : <Plus size={15} />}
                      </span>
                    </button>
                    {openRegionSections[section.category] && (
                      <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
                        {section.rows.map((row, rowIndex) => (
                          <div key={`${section.category}-${rowIndex}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {row.map(r => {
                              const hasThumbnail = r.key in REGION_THUMBNAILS
                              return (
                                <button
                                  key={r.key}
                                  type="button"
                                  disabled={!r.available}
                                  onClick={() => { setRegion(r.key); setRegionsOpen(false) }}
                                  className={`min-h-[52px] rounded-lg text-sm font-medium text-left transition-colors ${
                                    hasThumbnail ? 'flex items-center gap-3 overflow-hidden py-0 pl-0 pr-4' : 'px-4 py-3'
                                  } ${
                                    r.available
                                      ? region === r.key
                                        ? 'bg-sky-700 text-white cursor-pointer'
                                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer'
                                      : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                  }`}
                                >
                                  <RegionThumbnail regionKey={r.key} selected={region === r.key} />
                                  <span>
                                    {r.label}
                                    {!r.available && (
                                      <span className="block text-xs text-slate-600 mt-0.5">coming soon</span>
                                    )}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )}
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
                <p className="text-xs text-slate-500 leading-relaxed">
                  General render controls live here. Scale-specific controls are available in the Scale Lab.
                </p>
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

      {adminMode && scaleLabOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setScaleLabOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(980px,92vw)] shadow-2xl flex flex-col max-h-[88vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                <div>
                  <span className="font-semibold text-base">Scale Lab</span>
                  <p className="text-xs text-slate-400 mt-1">Admin-only scale preview and experimental controls.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setScaleLabOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                {renderScaleInspector()}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
