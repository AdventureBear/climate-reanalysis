import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Settings, X, Plus, Minus, Eye, EyeOff, Pencil, Copy, Check, ChevronLeft, ChevronRight, ChevronDown, PanelLeft, LayoutGrid, CircleHelp, SlidersHorizontal, GalleryHorizontalEnd, Menu, Trash2, Save, FolderOpen, LogIn, LogOut, User } from 'lucide-react'
import { useAuth } from './auth/authContext'
import { AuthModal } from './auth/AuthModal'
import { LibraryModal } from './projects/LibraryModal'
import { saveMap, type SavedMap } from './lib/library'
import { SaveMapModal, type SaveTarget } from './projects/SaveMapModal'
import { signedUrl } from './lib/storage'
import { blobFromObjectUrl } from './lib/images'
import { suggestedMapName } from './mapName'
import { SiteFooter } from './SiteFooter'
import { dateRange, mapRecipeFromUrl, mapRecipeToParams, monthRange, type ClimoSource, type DisplayMode, type MapRecipe, type PwatUnit, type SubMode, type TimeRecipe, type TimeScale, type WindAnomalyOverlay, type WindOverlayType, type WindUnit } from './mapRecipe'
import { REGION_THUMBNAILS } from './regionThumbnails'
import { HOURS, normalizeColorStep } from './sharedOptions'
import {
  COLOR_LAB_SINGLE_LEVEL_VARIABLES,
  COLOR_LAB_VARIABLES,
  FLX_VARIABLES,
  PRESSURE_LEVELS,
  RAW_ONLY_API_VARIABLES,
  SURFACE_LEVELS,
  VARIABLES,
  apiLevelForSelection,
  apiVariableForSelection,
  levelOptionsForVariable,
  shouldDefaultWindOverlay,
  type SelectOption,
} from './variableConfig'

// Same-origin by default so a missing VITE_API_URL doesn't produce
// requests to literally "undefined/api/..." in production builds.
const API_BASE = import.meta.env.VITE_API_URL ?? ''
const SAVE_TARGET_STORAGE_KEY = 'pyre.saveTarget'

const LEVELS = [...PRESSURE_LEVELS]
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

type TemperatureUnit = 'F' | 'C'
type HeightDisplay = 'contoured' | 'shaded'
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
type ScaleAnchor = { id: string; value: number; color: string; active: boolean }
type ScaleSegmentMode = 'linear_rgb' | 'discrete' | 'bucket' | 'palette'
type ScaleSegment = {
  id: string
  fromId: string
  toId: string
  mode: ScaleSegmentMode
  paletteId: string
  reverse: boolean
  samples: number
}
type ScalePalettePreset = {
  id: string
  label: string
  family: 'PyRe' | 'Sequential' | 'Diverging' | 'Perceptual'
  colors: string[]
}
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

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
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
    active: true,
  }))
}

function anchorsFromScaleMeta(meta: ScaleMeta | null): ScaleAnchor[] {
  const values = meta?.anchor_values ?? []
  const colors = meta?.anchor_hex ?? []
  if (!values.length || !colors.length) return []
  return anchorsFromValues(values, colors)
}

function sortedAnchors(anchors: ScaleAnchor[]) {
  return [...anchors].sort((a, b) => a.value - b.value)
}

function activeAnchors(anchors: ScaleAnchor[]) {
  return sortedAnchors(anchors).filter(anchor => anchor.active)
}

function anchorValuePercent(anchor: ScaleAnchor, min: number, max: number) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((anchor.value - min) / (max - min)) * 100))
}

function anchorRailPositions(anchors: ScaleAnchor[], min: number, max: number, railWidthPx: number) {
  const ordered = sortedAnchors(anchors)
  if (!ordered.length) return new Map<string, number>()
  if (ordered.length === 1) return new Map([[ordered[0].id, 50]])

  const minGapPct = (32 / railWidthPx) * 100
  const positions = ordered.map(anchor => anchorValuePercent(anchor, min, max))

  for (let idx = 1; idx < positions.length; idx += 1) {
    positions[idx] = Math.max(positions[idx], positions[idx - 1] + minGapPct)
  }
  if (positions[positions.length - 1] > 100) {
    positions[positions.length - 1] = 100
    for (let idx = positions.length - 2; idx >= 0; idx -= 1) {
      positions[idx] = Math.min(positions[idx], positions[idx + 1] - minGapPct)
    }
  }
  if (positions[0] < 0) {
    positions[0] = 0
    for (let idx = 1; idx < positions.length; idx += 1) {
      positions[idx] = Math.max(positions[idx], positions[idx - 1] + minGapPct)
    }
  }

  return new Map(ordered.map((anchor, idx) => [anchor.id, positions[idx]]))
}

function segmentId(fromId: string, toId: string) {
  return `${fromId}--${toId}`
}

function segmentLabel(segment: ScaleSegment, anchorsById: Map<string, ScaleAnchor>) {
  const from = anchorsById.get(segment.fromId)
  const to = anchorsById.get(segment.toId)
  return `${from ? formatScaleValue(from.value) : '?'} to ${to ? formatScaleValue(to.value) : '?'}`
}

function segmentsFromAnchors(anchors: ScaleAnchor[], previous: ScaleSegment[] = [], defaultMode: ScaleSegmentMode = 'linear_rgb'): ScaleSegment[] {
  const ordered = sortedAnchors(anchors)
  const previousById = new Map(previous.map(segment => [segment.id, segment]))
  return ordered.slice(0, -1).map((anchor, idx) => {
    const next = ordered[idx + 1]
    const id = segmentId(anchor.id, next.id)
    return previousById.get(id) ?? {
      id,
      fromId: anchor.id,
      toId: next.id,
      mode: defaultMode,
      paletteId: 'ylgnbu',
      reverse: false,
      samples: 5,
    }
  })
}

function colorsForSegment(segment: ScaleSegment, from: ScaleAnchor, to: ScaleAnchor): string[] {
  if (segment.mode === 'palette') {
    const preset = SCALE_PALETTE_PRESETS.find(candidate => candidate.id === segment.paletteId)
    const paletteColors = preset?.colors.length ? preset.colors : [from.color, to.color]
    const orderedColors = segment.reverse ? [...paletteColors].reverse() : paletteColors
    const samples = Math.max(2, Math.min(segment.samples, orderedColors.length))
    const sampled = Array.from({ length: samples }, (_, idx) => {
      const sourceIdx = Math.round((idx / Math.max(samples - 1, 1)) * (orderedColors.length - 1))
      return orderedColors[sourceIdx]
    })
    return [from.color, ...sampled.slice(1, -1), to.color]
  }
  return [from.color, to.color]
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean, 16)
  if (!Number.isFinite(value) || clean.length !== 6) return [255, 255, 255] as const
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

function mixHex(left: string, right: string, t: number) {
  const a = hexToRgb(left)
  const b = hexToRgb(right)
  return rgbToHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  )
}

function colorAtScaleValue(value: number, anchors: ScaleAnchor[], segments: ScaleSegment[]) {
  const ordered = sortedAnchors(anchors)
  if (!ordered.length) return '#ffffff'
  if (value <= ordered[0].value) return ordered[0].color
  if (value >= ordered[ordered.length - 1].value) return ordered[ordered.length - 1].color
  const anchorsById = new Map(ordered.map(anchor => [anchor.id, anchor]))

  for (let idx = 0; idx < ordered.length - 1; idx += 1) {
    const from = ordered[idx]
    const to = ordered[idx + 1]
    if (value < from.value || value > to.value) continue
    const t = to.value > from.value ? (value - from.value) / (to.value - from.value) : 0
    const segment = segments.find(candidate => candidate.id === segmentId(from.id, to.id))
    if (!segment || segment.mode === 'linear_rgb') return mixHex(from.color, to.color, t)
    if (segment.mode === 'bucket') return from.color
    if (segment.mode === 'discrete') return t < 0.5 ? from.color : to.color
    const colors = colorsForSegment(segment, anchorsById.get(segment.fromId) ?? from, anchorsById.get(segment.toId) ?? to)
    if (colors.length <= 1) return colors[0] ?? from.color
    const scaled = t * (colors.length - 1)
    const leftIdx = Math.min(colors.length - 2, Math.max(0, Math.floor(scaled)))
    return mixHex(colors[leftIdx], colors[leftIdx + 1], scaled - leftIdx)
  }

  return ordered[ordered.length - 1].color
}

function renderedScaleFromDesigner(anchors: ScaleAnchor[], segments: ScaleSegment[], step: number) {
  const ordered = activeAnchors(anchors)
  if (ordered.length < 2) return { boundaries: [] as number[], colors: [] as string[] }
  const min = ordered[0].value
  const max = ordered[ordered.length - 1].value
  const safeStep = Math.max(step, 0.000001)
  const boundaries: number[] = [min]
  let next = min + safeStep
  let guard = 0
  while (next < max && guard < 2000) {
    boundaries.push(Number(next.toFixed(6)))
    next += safeStep
    guard += 1
  }
  boundaries.push(max)
  const colors = boundaries.slice(0, -1).map((left, idx) => {
    const right = boundaries[idx + 1]
    return colorAtScaleValue((left + right) / 2, ordered, segments)
  })
  return { boundaries, colors }
}

function renderedScaleGradient(boundaries: number[], colors: string[]) {
  if (!boundaries.length || !colors.length) return 'linear-gradient(90deg, #1e293b, #1e293b)'
  const min = boundaries[0]
  const max = boundaries[boundaries.length - 1]
  if (max <= min) return colors[0] ?? '#1e293b'
  const stops: string[] = []
  colors.forEach((color, idx) => {
    const left = ((boundaries[idx] - min) / (max - min)) * 100
    const right = ((boundaries[idx + 1] - min) / (max - min)) * 100
    stops.push(`${color} ${left}%`, `${color} ${right}%`)
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function previewGradient(anchors: ScaleAnchor[], segments: ScaleSegment[]): string {
  const ordered = sortedAnchors(anchors)
  if (!ordered.length) return 'linear-gradient(90deg, #1e293b, #1e293b)'
  if (ordered.length === 1) return ordered[0].color
  const min = ordered[0].value
  const max = ordered[ordered.length - 1].value
  const pct = (value: number) => max > min ? ((value - min) / (max - min)) * 100 : 0
  const anchorsById = new Map(ordered.map(anchor => [anchor.id, anchor]))
  const segmentsById = new Map(segments.map(segment => [segment.id, segment]))
  const stops: string[] = []

  ordered.slice(0, -1).forEach((from, idx) => {
    const to = ordered[idx + 1]
    const segment = segmentsById.get(segmentId(from.id, to.id))
    const left = pct(from.value)
    const right = pct(to.value)
    if (!segment || segment.mode === 'linear_rgb') {
      stops.push(`${from.color} ${left}%`, `${to.color} ${right}%`)
      return
    }
    if (segment.mode === 'discrete') {
      const mid = (left + right) / 2
      stops.push(`${from.color} ${left}%`, `${from.color} ${mid}%`, `${to.color} ${mid}%`, `${to.color} ${right}%`)
      return
    }
    if (segment.mode === 'bucket') {
      stops.push(`${from.color} ${left}%`, `${from.color} ${right}%`)
      return
    }
    const colors = colorsForSegment(segment, anchorsById.get(segment.fromId) ?? from, anchorsById.get(segment.toId) ?? to)
    colors.forEach((color, colorIdx) => {
      const pos = left + (colorIdx / Math.max(colors.length - 1, 1)) * (right - left)
      stops.push(`${color} ${pos}%`)
    })
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function getScaleFamilies(variable: string, mode: DisplayMode): ScaleFamily[] {
  if (COLOR_LAB_SINGLE_LEVEL_VARIABLES.has(variable)) {
    return [
      {
        key: 'surface',
        label: variable === 'precipitable_water' ? 'Column' : variable === 'olr' ? 'TOA' : 'Surface',
        levels: [1000],
        description: 'This field has one fixed vertical coordinate in CORe.',
      },
    ]
  }

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
      { key: 'mid', label: 'Mid', levels: [600, 500, 400], description: 'Mid-tropospheric temperature scales (evenly spaced anchors, pending scientific review).' },
      { key: 'upper', label: 'Upper', levels: [300, 250, 200, 150, 100, 70, 50, 20, 10], description: 'Upper-air temperature scales (evenly spaced anchors, pending scientific review).' },
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
function TabStrip({ options, value, onChange, fullWidth = false, disabled = false, className = '' }: {
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

function SelectField({
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
  return (
    <div className={wrapperClassName}>
      {label && <Label>{label}</Label>}
      <select value={value} onChange={e => onChange(e.target.value)} className={className}>
        {options.map(option => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
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
    <div className={`self-start bg-slate-900 border border-slate-700/60 rounded-xl px-4 pt-4 pb-5 flex flex-col gap-3 ${className}`}>
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
  const [searchParams, setSearchParams] = useSearchParams()

  const [timeScale,    setTimeScale]    = useState<TimeScale>('3-hourly')
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

  const [climoMonth, setClimoMonth] = useState(() => new Date().toISOString().slice(5, 7))

  const [variable, setVariable] = useState('wind_speed')
  const [level,    setLevel]    = useState('850')

  const [region,      setRegion]      = useState('CONUS')
  const [regionsOpen, setRegionsOpen] = useState(false)
  const [openRegionSections, setOpenRegionSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REGION_SECTIONS.map(section => [section.category, section.defaultOpen ?? false]))
  )

  const [displayMode, setDisplayMode] = useState<DisplayMode>('raw')

  const [windOn,    setWindOn]    = useState(true)
  const [windStep,  setWindStep]  = useState('2')
  const [windType,  setWindType]  = useState<WindOverlayType>('barbs')
  const [windAnomalyOverlay, setWindAnomalyOverlay] = useState<WindAnomalyOverlay>('none')
  const [windUnit, setWindUnit] = useState<WindUnit>('kt')
  const [pwatUnit, setPwatUnit] = useState<PwatUnit>('mm')
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>('F')
  const [heightDisplay, setHeightDisplay] = useState<HeightDisplay>('contoured')
  const [colorStep, setColorStep] = useState('1')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorLabOpen, setColorLabOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [climoSource,  setClimoSource]  = useState<ClimoSource>('r2-monthly')

  const [mapSrc,  setMapSrc]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Release the last rendered blob URL when the component unmounts.
  const mapSrcRef = useRef<string | null>(null)
  useEffect(() => {
    mapSrcRef.current = mapSrc
  }, [mapSrc])
  useEffect(() => () => {
    if (mapSrcRef.current?.startsWith('blob:')) URL.revokeObjectURL(mapSrcRef.current)
  }, [])
  const [labVariable, setLabVariable] = useState('wind_speed')
  const [labLevel, setLabLevel] = useState('850')
  const [labMode, setLabMode] = useState<DisplayMode>('raw')
  const [labFamily, setLabFamily] = useState('low')
  const [scaleMeta, setScaleMeta] = useState<ScaleMeta | null>(null)
  const [scaleMetaError, setScaleMetaError] = useState<string | null>(null)
  const [scaleMetaLoading, setScaleMetaLoading] = useState(false)
  const [, setScalePreset] = useState('backend')
  const [scaleAnchors, setScaleAnchors] = useState<ScaleAnchor[]>([])
  const [scaleSegments, setScaleSegments] = useState<ScaleSegment[]>([])
  const [scaleExportOpen, setScaleExportOpen] = useState(false)
  const [scaleExportCopied, setScaleExportCopied] = useState(false)
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [anchorValueDrafts, setAnchorValueDrafts] = useState<Record<string, string>>({})
  const [anchorColorDrafts, setAnchorColorDrafts] = useState<Record<string, string>>({})
  const [showOriginalScale, setShowOriginalScale] = useState(false)
  const [scaleInfoOpen, setScaleInfoOpen] = useState(false)
  const scalePreviewRef = useRef<HTMLDivElement | null>(null)

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const isVertical  = layoutMode === 'vertical'

  const { enabled: authEnabled, user, isAdmin, signOut } = useAuth()
  // Color Lab is admin-only tooling. With accounts enabled it needs the
  // profile admin flag; without accounts (local dev / dark launch) the /admin
  // route stays available as a dev escape hatch.
  const colorLabVisible = authEnabled ? isAdmin : true
  const colorLabAccess = adminMode && colorLabVisible
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  // Last save destination, remembered across saves (and reloads) so saving
  // repeatedly into the same project/folder is a single confirm.
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(() => {
    try { return JSON.parse(localStorage.getItem(SAVE_TARGET_STORAGE_KEY) ?? 'null') } catch { return null }
  })

  const apiVariable = apiVariableForSelection(variable, level)
  const apiLevel = apiLevelForSelection(variable, level)
  const levelOptions = levelOptionsForVariable(variable)
  const isClimo     = timeScale === 'climatology'
  const isMonthly   = timeScale === 'monthly'
  const isThreeHourly = timeScale === '3-hourly'
  const isFlxVariable = FLX_VARIABLES.has(apiVariable)
  const rawOnlyVariable = RAW_ONLY_API_VARIABLES.has(apiVariable)
  const canUseWindAnomalyOverlay = apiVariable === 'wind_speed' && !isClimo && displayMode === 'anomaly'
  const labFamilies = getScaleFamilies(labVariable, labMode)
  const activeFamily = labFamilies.find(f => f.key === labFamily) ?? labFamilies[0]

  function currentTimeRecipe(): TimeRecipe {
    if (isClimo) {
      return { scale: 'climatology', climoMonth }
    }
    if (isMonthly) {
      if (monthSubMode === 'single') return { scale: 'monthly', subMode: 'single', month }
      if (monthSubMode === 'range') return { scale: 'monthly', subMode: 'range', monthStart, monthEnd }
      return { scale: 'monthly', subMode: 'list', customMonths }
    }
    if (isThreeHourly) {
      if (dateSubMode === 'single') return { scale: '3-hourly', subMode: 'single', date, hour }
      if (dateSubMode === 'range') return { scale: '3-hourly', subMode: 'range', startDate, endDate, hour }
      return { scale: '3-hourly', subMode: 'list', customDates, hour }
    }
    if (dateSubMode === 'single') return { scale: 'daily', subMode: 'single', date }
    if (dateSubMode === 'range') return { scale: 'daily', subMode: 'range', startDate, endDate }
    return { scale: 'daily', subMode: 'list', customDates }
  }

  function currentMapRecipe(): MapRecipe {
    const activeWindAnomaly = canUseWindAnomalyOverlay ? windAnomalyOverlay : 'none'
    return {
      variable,
      level,
      region,
      displayMode,
      climoSource,
      time: currentTimeRecipe(),
      wind: windStep
        ? {
            on: activeWindAnomaly === 'none' && windOn,
            step: windStep,
            type: windType,
            anomalyOverlay: activeWindAnomaly,
          }
        : undefined,
      windUnit,
      pwatUnit,
      colorStep,
    }
  }

  // Apply a recipe (from a shared URL or a saved library map) to the builder
  // controls. Shared by the URL-sync effect and by loading a saved map.
  function applyRecipeToState(recipe: MapRecipe) {
    function applyTimeRecipe(time: TimeRecipe) {
      setTimeScale(time.scale)
      switch (time.scale) {
        case 'climatology':
          setClimoMonth(time.climoMonth)
          return
        case 'monthly':
          setMonthSubMode(time.subMode)
          if (time.subMode === 'single') setMonth(time.month)
          if (time.subMode === 'range') {
            setMonthStart(time.monthStart)
            setMonthEnd(time.monthEnd)
          }
          if (time.subMode === 'list') setCustomMonths(time.customMonths)
          return
        case 'daily':
          setDateSubMode(time.subMode)
          if (time.subMode === 'single') setDate(time.date)
          if (time.subMode === 'range') {
            setStartDate(time.startDate)
            setEndDate(time.endDate)
          }
          if (time.subMode === 'list') setCustomDates(time.customDates)
          return
        case '3-hourly':
          setDateSubMode(time.subMode)
          setHour(time.hour)
          if (time.subMode === 'single') setDate(time.date)
          if (time.subMode === 'range') {
            setStartDate(time.startDate)
            setEndDate(time.endDate)
          }
          if (time.subMode === 'list') setCustomDates(time.customDates)
          return
      }
    }

    if (recipe.variable) setVariable(recipe.variable)
    if (recipe.level) setLevel(recipe.level)
    if (recipe.region) setRegion(recipe.region)
    if (recipe.displayMode) setDisplayMode(recipe.displayMode)
    if (recipe.climoSource) setClimoSource(recipe.climoSource)
    if (recipe.windUnit) setWindUnit(recipe.windUnit)
    if (recipe.pwatUnit) setPwatUnit(recipe.pwatUnit)
    if (recipe.colorStep) setColorStep(recipe.colorStep)
    if (recipe.time) applyTimeRecipe(recipe.time)
    if (recipe.wind) {
      setWindStep(recipe.wind.step)
      setWindType(recipe.wind.type)
      setWindOn(recipe.wind.on)
      setWindAnomalyOverlay(recipe.wind.anomalyOverlay)
    }
  }

  // URL → state synchronization. Runs for deep links and browser back/forward;
  // URL updates made by handleGenerate / library-load are skipped via the ref.
  const selfUpdatedParamsRef = useRef<string | null>(null)

  useEffect(() => {
    const paramsString = searchParams.toString()
    if (paramsString === selfUpdatedParamsRef.current) return
    selfUpdatedParamsRef.current = paramsString

    const recipe = mapRecipeFromUrl(searchParams)
    if (!recipe) return
    applyRecipeToState(recipe)

    // Shared/deep-linked URLs render immediately instead of showing an empty
    // panel until the user clicks Generate.
    const recipeParams = mapRecipeToParams(recipe)
    if (recipeParams.ok) void generateFromParams(recipeParams.params)
  }, [searchParams])

  useEffect(() => {
    if (rawOnlyVariable) {
      if (displayMode !== 'raw') setDisplayMode('raw')
      if (timeScale === 'climatology') setTimeScale('3-hourly')
    }
    // Monthly obs composites are not wired for surface/named-level fields,
    // independent of climatology support.
    if (isFlxVariable && timeScale === 'monthly') setTimeScale('3-hourly')
  }, [displayMode, rawOnlyVariable, isFlxVariable, timeScale])

  useEffect(() => {
    if (!levelOptions.some(opt => opt.value === level)) {
      setLevel(levelOptions[0]?.value ?? '850')
    }
  }, [level, levelOptions])

  useEffect(() => {
    if (shouldDefaultWindOverlay(apiVariable)) {
      setWindOn(true)
      setWindType('barbs')
    }
  }, [apiVariable])

  useEffect(() => {
    if (!colorLabAccess) return
    const safeColorStep = normalizeColorStep(colorStep)

    const params = new URLSearchParams({
      variable: labVariable,
      level: labLevel,
      color_step: String(safeColorStep),
      mode: labMode,
    })
    if (labVariable === 'wind_speed' || labVariable === 'wind_10m') {
      params.set('wind_unit', windUnit)
    }
    if (labVariable === 'precipitable_water') params.set('pwat_unit', pwatUnit)

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
      } finally {
        setScaleMetaLoading(false)
      }
    }

    void loadScaleMeta()

    return () => controller.abort()
  }, [colorLabAccess, colorStep, labLevel, labMode, labVariable, pwatUnit, windUnit])

  useEffect(() => {
    const backendAnchors = anchorsFromScaleMeta(scaleMeta)
    if (backendAnchors.length) {
      const defaultMode: ScaleSegmentMode = scaleMeta?.scale_kind === 'vector-anomaly-magnitude' ? 'bucket' : 'linear_rgb'
      setScaleAnchors(backendAnchors)
      setScaleSegments(segmentsFromAnchors(backendAnchors, [], defaultMode))
      setScalePreset('backend')
      setAnchorValueDrafts({})
      setAnchorColorDrafts({})
      setShowOriginalScale(false)
    }
  }, [scaleMeta])

  useEffect(() => {
    const defaultMode: ScaleSegmentMode = scaleMeta?.scale_kind === 'vector-anomaly-magnitude' ? 'bucket' : 'linear_rgb'
    setScaleSegments(prev => segmentsFromAnchors(scaleAnchors, prev, defaultMode))
    setEditingAnchorId(current => {
      if (current && scaleAnchors.some(anchor => anchor.id === current)) return current
      return scaleAnchors[0]?.id ?? null
    })
  }, [scaleAnchors, scaleMeta?.scale_kind])

  function openColorLab() {
    setLabVariable(apiVariable)
    setLabLevel(apiLevel)
    setLabMode(isClimo ? 'raw' : displayMode)
    setLabFamily(resolveScaleFamily(apiVariable, isClimo ? 'raw' : displayMode, apiLevel).key)
    setColorLabOpen(true)
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
  async function generateFromParams(params: Record<string, string>) {
    setLoading(true)
    setError(null)
    setMapSrc(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })

    try {
      const res = await fetch(`${API_BASE}/api/map?${new URLSearchParams(params)}`)
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

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const recipeParams = mapRecipeToParams(currentMapRecipe())
    if (!recipeParams.ok) {
      setError(recipeParams.error)
      return
    }
    const params = recipeParams.params
    const safeColorStep = normalizeColorStep(colorStep)
    const labRenderMode = isClimo ? 'raw' : displayMode
    const labScaleApplies =
      colorLabAccess &&
      labVariable === apiVariable &&
      labMode === labRenderMode &&
      String(labLevel) === String(apiLevel) &&
      activeAnchors(scaleAnchors).length > 1
    if (labScaleApplies) {
      const labAnchors = activeAnchors(scaleAnchors)
      const labSegments = segmentsFromAnchors(labAnchors, scaleSegments)
      const renderedScale = renderedScaleFromDesigner(labAnchors, labSegments, safeColorStep)
      if (renderedScale.boundaries.length > 1 && renderedScale.colors.length === renderedScale.boundaries.length - 1) {
        params.scale_min = String(renderedScale.boundaries[0])
        params.scale_max = String(renderedScale.boundaries[renderedScale.boundaries.length - 1])
        params.scale_spec = JSON.stringify({
          variable: labVariable,
          mode: labMode,
          level: Number(labLevel),
          unit: scaleMeta?.unit ?? null,
          color_step: safeColorStep,
          domain: [renderedScale.boundaries[0], renderedScale.boundaries[renderedScale.boundaries.length - 1]],
          boundaries: renderedScale.boundaries,
          interval_hex: renderedScale.colors,
          anchors: labAnchors.map(anchor => ({ value: anchor.value, color: anchor.color })),
          segments: labSegments.map(segment => ({
            from: labAnchors.find(anchor => anchor.id === segment.fromId)?.value,
            to: labAnchors.find(anchor => anchor.id === segment.toId)?.value,
            mode: segment.mode,
            palette: segment.mode === 'palette' ? segment.paletteId : null,
            reverse: segment.mode === 'palette' ? segment.reverse : null,
            samples: segment.mode === 'palette' ? segment.samples : null,
          })),
        })
      }
    }

    // Mark this URL update as our own so the URL-sync effect doesn't re-apply
    // it (and re-render the map a second time).
    selfUpdatedParamsRef.current = new URLSearchParams(params).toString()
    setSearchParams(params)
    await generateFromParams(params)
  }

  // ── Save / load library maps ─────────────────────────────────────────────────
  function handleSaveMap() {
    if (!user) { setAuthModalOpen(true); return }
    if (!mapSrc) { setError('Generate a map before saving.'); return }
    setSaveModalOpen(true)
  }

  // Called by SaveMapModal once a name + project/folder target are confirmed.
  // Thrown errors surface inside the modal, so no catch here.
  async function handleSaveMapConfirm({ name, target }: { name: string; target: SaveTarget }) {
    if (!user || !mapSrc) return
    setSaving(true)
    try {
      const fullPng = await blobFromObjectUrl(mapSrc)
      await saveMap({
        userId: user.id, projectId: target.projectId, folderId: target.folderId,
        name, recipe: currentMapRecipe(), fullPng,
      })
      setSaveTarget(target)
      localStorage.setItem(SAVE_TARGET_STORAGE_KEY, JSON.stringify(target))
      setSaveModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleLoadMap(map: SavedMap) {
    const recipe = map.recipe as unknown as MapRecipe
    applyRecipeToState(recipe)

    // Show the stored image directly — no re-render. The bucket is private, so we
    // fetch a short-lived signed URL for the owner's own image. Keep the browser
    // URL in sync but suppress the URL effect so it doesn't kick off a re-render.
    const url = await signedUrl(map.image_path)
    setMapSrc(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return url
    })
    const recipeParams = mapRecipeToParams(recipe)
    if (recipeParams.ok) {
      selfUpdatedParamsRef.current = new URLSearchParams(recipeParams.params).toString()
      setSearchParams(recipeParams.params)
    }
    setError(null)
    setLibraryOpen(false)
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

  // `header` renders the compact fixed-height variant that lines up with the
  // other nav-bar controls; the default stretches to fill panel layouts.
  function renderTimeScaleControls({ header = false }: { header?: boolean } = {}) {
    return (
      <TabStrip
        options={[
          { value: '3-hourly',    label: '3-Hourly' },
          { value: 'daily',       label: 'Daily' },
          { value: 'monthly',     label: 'Monthly', disabled: isFlxVariable },
          { value: 'climatology', label: 'Climatology', disabled: rawOnlyVariable },
        ]}
        value={timeScale}
        onChange={v => setTimeScale(v as TimeScale)}
        fullWidth={!header}
        className={header ? 'h-7 shrink-0' : ''}
      />
    )
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

    // 3-hourly or daily
    return (
      <>
        {dateSubMode === 'single' && (
          <div className={`${isVertical ? 'gap-1' : 'gap-2'} flex min-w-0 items-center`}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input min-w-0 flex-1" />
            {isThreeHourly && <HourStepper hour={hour} setHour={setHour} compact={isVertical} />}
          </div>
        )}
        {dateSubMode === 'range' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input min-w-0" />
              <span className="text-slate-600 text-xs">→</span>
              <input type="date" value={endDate}   onChange={e => setEndDate(e.target.value)}   className="input min-w-0" />
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
        {!isThreeHourly && (
          <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
            Daily composites average 00z, 06z, 12z, and 18z synoptic times.
          </p>
        )}
      </>
    )
  }

  function renderScaleInspector() {
    if (!colorLabAccess) return null

    const boundaries = scaleMeta?.boundaries ?? []
    const keyBreaks = scaleMeta?.key_breakpoints ?? []
    const designerAnchors = sortedAnchors(scaleAnchors)
    const activeDesignerAnchors = activeAnchors(scaleAnchors)
    const activeColorStep = normalizeColorStep(colorStep)
    const min = activeDesignerAnchors[0]?.value ?? boundaries[0]
    const max = activeDesignerAnchors[activeDesignerAnchors.length - 1]?.value ?? boundaries[boundaries.length - 1]
    const keyBreakOffsets = (min !== undefined && max !== undefined && max > min)
      ? keyBreaks
          .filter(v => v >= min && v <= max)
          .map(v => ({ value: v, left: ((v - min) / (max - min)) * 100 }))
      : []
    const anchorsById = new Map(activeDesignerAnchors.map(anchor => [anchor.id, anchor]))
    const designerSegments = segmentsFromAnchors(activeDesignerAnchors, scaleSegments)
    const renderedDesignerScale = renderedScaleFromDesigner(activeDesignerAnchors, designerSegments, activeColorStep)
    const originalAnchors = activeAnchors(anchorsFromScaleMeta(scaleMeta))
    const originalGradient = previewGradient(originalAnchors, segmentsFromAnchors(originalAnchors))
    const displayGradient = showOriginalScale ? originalGradient : renderedScaleGradient(renderedDesignerScale.boundaries, renderedDesignerScale.colors)
    const selectedSegment = designerSegments.find(candidate => candidate.id === editingSegmentId) ?? designerSegments[0] ?? null
    const selectedSegmentFrom = selectedSegment ? anchorsById.get(selectedSegment.fromId) : null
    const selectedSegmentTo = selectedSegment ? anchorsById.get(selectedSegment.toId) : null
    const selectedAnchor = designerAnchors.find(anchor => anchor.id === editingAnchorId) ?? designerAnchors[0] ?? null
    const anchorsLocked = false
    const segmentsLocked = false
    const selectedSegmentGradient = selectedSegment && selectedSegmentFrom && selectedSegmentTo
      ? previewGradient([selectedSegmentFrom, selectedSegmentTo], [selectedSegment])
      : 'linear-gradient(90deg, #1e293b, #1e293b)'
    const hasDesignerDomain = min !== undefined && max !== undefined && max > min
    const anchorRailWidth = Math.max(760, designerAnchors.length * 32)
    const numberInputClass = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
    const anchorPositions = hasDesignerDomain
      ? anchorRailPositions(designerAnchors, min, max, anchorRailWidth)
      : new Map<string, number>()
    const exportSpec = {
      variable: labVariable,
      mode: labMode,
      level: Number(labLevel),
      unit: scaleMeta?.unit ?? null,
      domain: hasDesignerDomain ? [min, max] : null,
      color_step: activeColorStep,
      boundaries: renderedDesignerScale.boundaries,
      interval_hex: renderedDesignerScale.colors,
      anchors: activeDesignerAnchors.map(anchor => ({ value: anchor.value, color: anchor.color })),
      segments: designerSegments.map(segment => ({
        from: anchorsById.get(segment.fromId)?.value,
        to: anchorsById.get(segment.toId)?.value,
        mode: segment.mode,
        palette: segment.mode === 'palette' ? segment.paletteId : null,
        reverse: segment.mode === 'palette' ? segment.reverse : null,
        samples: segment.mode === 'palette' ? segment.samples : null,
      })),
    }
    const exportJson = JSON.stringify(exportSpec, null, 2)

    function updateScaleSegment(id: string, patch: Partial<ScaleSegment>) {
      setScaleSegments(prev => prev.map(segment => segment.id === id ? { ...segment, ...patch } : segment))
    }

    function segmentModeLabel(mode: ScaleSegmentMode) {
      if (mode === 'linear_rgb') return 'L'
      if (mode === 'discrete') return 'S'
      if (mode === 'bucket') return 'B'
      return 'P'
    }

    function paletteSwatch(colors: string[], reverse = false) {
      const paletteColors = reverse ? [...colors].reverse() : colors
      if (!paletteColors.length) return null
      const count = Math.min(5, Math.max(3, paletteColors.length))
      return Array.from({ length: count }, (_, idx) => {
        const sourceIdx = Math.round((idx / Math.max(count - 1, 1)) * (paletteColors.length - 1))
        return paletteColors[sourceIdx]
      })
    }

    function updateScaleAnchor(id: string, patch: Partial<ScaleAnchor>) {
      setScalePreset('custom')
      setScaleAnchors(prev => prev.map(anchor => anchor.id === id ? { ...anchor, ...patch } : anchor))
    }

    function commitScaleAnchorValue(id: string, raw: string) {
      const next = Number(raw)
      setAnchorValueDrafts(prev => {
        const rest = { ...prev }
        delete rest[id]
        return rest
      })
      if (!Number.isFinite(next)) return
      updateScaleAnchor(id, { value: next })
    }

    function cancelScaleAnchorValueDraft(id: string) {
      setAnchorValueDrafts(prev => {
        const rest = { ...prev }
        delete rest[id]
        return rest
      })
    }

    function commitScaleAnchorColor(id: string, raw: string) {
      const next = raw.trim()
      setAnchorColorDrafts(prev => {
        const rest = { ...prev }
        delete rest[id]
        return rest
      })
      if (!/^#[0-9a-fA-F]{6}$/.test(next)) return
      updateScaleAnchor(id, { color: next.toLowerCase() })
    }

    function updateDomainEndpoint(side: 'min' | 'max', value: number) {
      if (!Number.isFinite(value)) return
      const ordered = activeAnchors(scaleAnchors)
      const target = side === 'min' ? ordered[0] : ordered[ordered.length - 1]
      if (!target) return
      updateScaleAnchor(target.id, { value })
    }

    async function copyScaleExport() {
      try {
        await navigator.clipboard.writeText(exportJson)
        setScaleExportCopied(true)
        window.setTimeout(() => setScaleExportCopied(false), 1600)
      } catch {
        setScaleExportCopied(false)
      }
    }

    function updateAnchorFromClientX(id: string, clientX: number) {
      const rect = scalePreviewRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const nextValue = min + pct * (max - min)
      updateScaleAnchor(id, { value: Number(nextValue.toFixed(2)) })
    }

    function addScaleAnchor() {
      if (!hasDesignerDomain) return
      const ordered = sortedAnchors(scaleAnchors)
      const value = ordered.length
        ? (ordered[Math.floor((ordered.length - 1) / 2)].value + ordered[Math.ceil((ordered.length - 1) / 2)].value) / 2
        : (min + max) / 2
      setScalePreset('custom')
      setScaleAnchors(prev => [...prev, { id: `anchor-${Date.now()}`, value, color: '#ffffff', active: true }])
    }

    function toggleScaleAnchor(id: string) {
      setScalePreset('custom')
      setScaleAnchors(prev => {
        const activeCount = prev.filter(anchor => anchor.active).length
        return prev.map(anchor => {
          if (anchor.id !== id) return anchor
          if (anchor.active && activeCount <= 2) return anchor
          return { ...anchor, active: !anchor.active }
        })
      })
    }

    function deleteScaleAnchor(id: string) {
      setScalePreset('custom')
      setScaleAnchors(prev => {
        if (prev.length <= 2) return prev
        const next = prev.filter(anchor => anchor.id !== id)
        if (next.filter(anchor => anchor.active).length < 2) return prev
        return next
      })
      setAnchorValueDrafts(prev => {
        const rest = { ...prev }
        delete rest[id]
        return rest
      })
      setAnchorColorDrafts(prev => {
        const rest = { ...prev }
        delete rest[id]
        return rest
      })
    }

    function resetScaleDesigner() {
      const backendAnchors = anchorsFromScaleMeta(scaleMeta)
      if (backendAnchors.length) {
        setScaleAnchors(backendAnchors)
        setScaleSegments(segmentsFromAnchors(backendAnchors))
        setScalePreset('backend')
        setAnchorValueDrafts({})
        setAnchorColorDrafts({})
        setShowOriginalScale(false)
      }
    }

    return (
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid gap-2 lg:grid-cols-[1.35fr_1.05fr_0.8fr]">
          <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <SelectField
                value={labVariable}
                options={COLOR_LAB_VARIABLES}
                onChange={nextKey => {
                  const nextFamily = resolveScaleFamily(nextKey, labMode, labLevel)
                  setLabVariable(nextKey)
                  setLabFamily(nextFamily.key)
                  if (!nextFamily.levels.includes(Number(labLevel))) setLabLevel(String(nextFamily.levels[0]))
                  if (RAW_ONLY_API_VARIABLES.has(nextKey) && labMode !== 'raw') setLabMode('raw')
                }}
                className="input h-8 min-w-44"
                wrapperClassName="contents"
              />
              <SelectField
                value={labFamily}
                options={labFamilies.map(family => ({ value: family.key, label: family.label }))}
                onChange={nextValue => {
                  const next = labFamilies.find(family => family.key === nextValue)
                  if (!next) return
                  setLabFamily(next.key)
                  if (!next.levels.includes(Number(labLevel))) setLabLevel(String(next.levels[0]))
                }}
                className="input h-8 min-w-32"
                wrapperClassName="contents"
              />
              <SelectField
                value={labLevel}
                options={(activeFamily?.levels ?? LEVELS).map(lvl => ({ value: String(lvl), label: `${lvl} mb` }))}
                onChange={setLabLevel}
                className="input h-8 min-w-24"
                wrapperClassName="contents"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-2.5">
	            <TabStrip
	              options={[
	                { value: 'raw', label: 'Raw' },
	                { value: 'anomaly', label: 'Anomaly', disabled: RAW_ONLY_API_VARIABLES.has(labVariable) },
	                { value: 'normalized', label: 'Norm', disabled: RAW_ONLY_API_VARIABLES.has(labVariable) },
	              ]}
	              value={labMode}
	              onChange={v => {
	                if (RAW_ONLY_API_VARIABLES.has(labVariable) && v !== 'raw') return
	                const nextMode = v as DisplayMode
	                const nextFamily = resolveScaleFamily(labVariable, nextMode, labLevel)
	                setLabMode(nextMode)
                setLabFamily(nextFamily.key)
                if (!nextFamily.levels.includes(Number(labLevel))) setLabLevel(String(nextFamily.levels[0]))
              }}
              fullWidth
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-slate-300">Interval</label>
              <input
                type="number"
                min={1}
                max={50}
                value={colorStep}
                onChange={e => {
                  const next = e.target.value
                  setColorStep(next === '' ? '' : String(normalizeColorStep(next)))
                }}
                onBlur={() => setColorStep(String(normalizeColorStep(colorStep)))}
                className="input h-8 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
	              {(labVariable === 'wind_speed' || labVariable === 'wind_10m') && (
	                <TabStrip
	                  options={[{ value: 'kt', label: 'kt' }, { value: 'm/s', label: 'm/s' }]}
	                  value={windUnit}
	                  onChange={v => setWindUnit(v as WindUnit)}
	                />
	              )}
	              {labVariable === 'precipitable_water' && (
	                <TabStrip
	                  options={[{ value: 'mm', label: 'mm' }, { value: 'in', label: 'inches' }]}
	                  value={pwatUnit}
	                  onChange={v => setPwatUnit(v as PwatUnit)}
	                />
	              )}
	            </div>
	          </div>

          <div className="relative rounded-lg border border-slate-700/70 bg-slate-950/40 p-2.5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <TabStrip
                options={[
                  { value: 'current', label: 'Current' },
                  { value: 'original', label: 'Original' },
                ]}
                value={showOriginalScale ? 'original' : 'current'}
                onChange={v => setShowOriginalScale(v === 'original')}
              />
              <button type="button" onClick={resetScaleDesigner} className="rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
                Reset
              </button>
              <button type="button" onClick={() => { setScaleExportOpen(true); void copyScaleExport() }} className="rounded bg-sky-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-600">
                Export
              </button>
              <button
                type="button"
                onClick={() => setScaleInfoOpen(open => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                aria-label="Scale metadata"
                title="Scale metadata"
              >
                <CircleHelp size={15} />
              </button>
            </div>
            {scaleInfoOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setScaleInfoOpen(false)}
                  aria-label="Close scale metadata"
                />
                <div className="absolute right-2 top-12 z-20 w-52 rounded-lg border border-slate-700 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300 shadow-xl shadow-black/40">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-slate-300">Info</span>
                    <button
                      type="button"
                      onClick={() => setScaleInfoOpen(false)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white"
                      aria-label="Close scale metadata"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div>Kind: <span className="text-slate-100">{scaleMeta?.scale_kind ?? 'resolving'}</span></div>
                  {scaleMeta?.group && <div>Group: <span className="text-slate-100">{scaleMeta.group}</span></div>}
                  <div>Unit: <span className="text-slate-100">{scaleMeta?.unit ?? 'n/a'}</span></div>
                  <div>Interval: <span className="text-slate-100">{formatScaleValue(activeColorStep)}</span></div>
                  <div>Bins: <span className="text-slate-100">{renderedDesignerScale.colors.length || 'n/a'}</span></div>
                </div>
              </>
            )}
          </div>
        </div>

        {scaleMetaLoading && <p className="text-sm text-slate-400 animate-pulse">Resolving scale...</p>}
        {scaleMetaError && <div className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-400">{scaleMetaError}</div>}

        {scaleMeta && boundaries.length > 1 && activeDesignerAnchors.length > 1 && (
          <>
            <div className="sticky top-0 z-10 rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 shadow-xl shadow-black/30">
              <div ref={scalePreviewRef} className="relative mb-2">
                <div className="h-12 w-full overflow-hidden rounded-md border border-slate-700" style={{ background: displayGradient }} />
                {selectedSegmentFrom && selectedSegmentTo && (
                  <div
                    className="pointer-events-none absolute top-0 h-12 rounded border-2 border-sky-300/90 bg-sky-300/10 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
                    style={{
                      left: `${Math.min(anchorValuePercent(selectedSegmentFrom, min, max), anchorValuePercent(selectedSegmentTo, min, max))}%`,
                      width: `${Math.abs(anchorValuePercent(selectedSegmentTo, min, max) - anchorValuePercent(selectedSegmentFrom, min, max))}%`,
                    }}
                  />
                )}
                {activeDesignerAnchors.map(anchor => (
                  <div
                    key={anchor.id}
                    className={`absolute -top-1 bottom-0 w-3 -translate-x-1/2 touch-none ${anchorsLocked ? 'pointer-events-none opacity-50' : 'cursor-ew-resize'}`}
                    style={{ left: `${((anchor.value - min) / (max - min)) * 100}%` }}
                    title={`${formatScaleValue(anchor.value)} ${scaleMeta.unit ?? ''}`}
                    onPointerDown={e => {
                      if (anchorsLocked) return
                      setEditingAnchorId(anchor.id)
                      e.currentTarget.setPointerCapture(e.pointerId)
                      updateAnchorFromClientX(anchor.id, e.clientX)
                    }}
                    onPointerMove={e => {
                      if (anchorsLocked) return
                      if (e.buttons !== 1) return
                      updateAnchorFromClientX(anchor.id, e.clientX)
                    }}
                  >
                    <div className="mx-auto h-full w-px bg-white/85" />
                  </div>
                ))}
                {keyBreakOffsets.map(bp => (
                  <div key={`key-${bp.value}`} className="absolute top-0 bottom-0 w-px bg-sky-200/90" style={{ left: `${bp.left}%` }} />
                ))}
              </div>
              <div className="mt-1 grid grid-cols-[5rem_1fr_5rem] items-center text-[11px] font-mono text-slate-300">
                <input
                  type="number"
                  value={Number.isFinite(min) ? min : 0}
                  onChange={e => updateDomainEndpoint('min', Number(e.target.value))}
                  className={`h-6 w-14 rounded border border-slate-700 bg-slate-900 px-1 text-center text-[11px] text-slate-100 outline-none focus:border-sky-400 ${numberInputClass}`}
                  aria-label="Scale minimum"
                />
                <span className="text-center">{formatScaleValue((min + max) / 2)}</span>
                <input
                  type="number"
                  value={Number.isFinite(max) ? max : 0}
                  onChange={e => updateDomainEndpoint('max', Number(e.target.value))}
                  className={`ml-auto h-6 w-14 rounded border border-slate-700 bg-slate-900 px-1 text-center text-[11px] text-slate-100 outline-none focus:border-sky-400 ${numberInputClass}`}
                  aria-label="Scale maximum"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-3">
              <div className="mb-3 flex items-center justify-end">
                <button type="button" onClick={addScaleAnchor} disabled={!hasDesignerDomain || anchorsLocked} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Plus size={12} />
                  Add
                </button>
              </div>

	              {scaleExportOpen && (
	                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setScaleExportOpen(false)}>
	                  <div className="w-[min(760px,94vw)] rounded-xl border border-slate-600 bg-slate-950 shadow-2xl" onClick={e => e.stopPropagation()}>
	                    <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
	                      <div>
	                        <div className="text-sm font-semibold text-slate-100">Color Scale JSON</div>
	                        <div className="text-xs text-slate-400">Export copied when the modal opened.</div>
	                      </div>
	                      <div className="flex items-center gap-2">
	                        <button
	                          type="button"
	                          onClick={copyScaleExport}
	                          className="inline-flex h-8 items-center gap-2 rounded bg-slate-800 px-3 text-xs text-slate-200 hover:bg-slate-700"
	                        >
	                          {scaleExportCopied ? <Check size={14} /> : <Copy size={14} />}
	                          {scaleExportCopied ? 'Copied' : 'Copy'}
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => setScaleExportOpen(false)}
	                          className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-white"
	                          aria-label="Close export"
	                        >
	                          <X size={16} />
	                        </button>
	                      </div>
	                    </div>
	                    <pre className="max-h-[64vh] overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed text-slate-200">{exportJson}</pre>
	                  </div>
	                </div>
	              )}

	              <div className="overflow-x-auto rounded-lg bg-slate-900/70 px-5 py-3">
	                    <div className="relative h-24" style={{ minWidth: `${anchorRailWidth}px` }}>
                      <div className="absolute left-0 right-0 top-[46px] h-px bg-slate-700" />
                      {designerSegments.map(segment => {
                        const from = anchorsById.get(segment.fromId)
                        const to = anchorsById.get(segment.toId)
                        if (!from || !to) return null
                        const left = anchorPositions.get(from.id) ?? anchorValuePercent(from, min, max)
                        const right = anchorPositions.get(to.id) ?? anchorValuePercent(to, min, max)
                        const center = (left + right) / 2
                        const isSelected = selectedSegment?.id === segment.id
                        return (
                          <div
                            key={segment.id}
                            className={`absolute top-[30px] -translate-x-1/2 ${segmentsLocked ? 'pointer-events-none opacity-35' : ''}`}
                            style={{ left: `${center}%` }}
                          >
                            <button
                              type="button"
                              disabled={segmentsLocked}
                              onClick={() => {
                                setEditingSegmentId(segment.id)
                              }}
                              className={`absolute left-1/2 top-0 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border text-[10px] font-semibold shadow-sm shadow-black/40 disabled:cursor-not-allowed ${
                                isSelected
                                  ? 'border-sky-300 bg-sky-900 text-white'
                                  : 'border-slate-600 bg-slate-950 text-slate-200 hover:border-sky-400 hover:text-white'
                              }`}
                              title={`${segmentLabel(segment, anchorsById)} · ${segment.mode}`}
                            >
                              {segmentModeLabel(segment.mode)}
                            </button>
                          </div>
                        )
                      })}
                      {designerAnchors.map((anchor, idx) => (
                        <div
                          key={anchor.id}
                          className={`absolute top-0 flex w-8 -translate-x-1/2 flex-col items-center gap-1 ${anchor.active ? '' : 'opacity-35 grayscale'} ${anchorsLocked ? 'pointer-events-none opacity-45' : ''}`}
                          style={{ left: `${anchorPositions.get(anchor.id) ?? anchorValuePercent(anchor, min, max)}%` }}
                        >
                          <input
                            type="number"
                            disabled={anchorsLocked}
                            value={anchorValueDrafts[anchor.id] ?? (Number.isFinite(anchor.value) ? formatScaleValue(anchor.value) : '')}
                            onFocus={() => {
                              setEditingAnchorId(anchor.id)
                              setAnchorValueDrafts(prev => ({ ...prev, [anchor.id]: Number.isFinite(anchor.value) ? formatScaleValue(anchor.value) : '' }))
                            }}
                            onChange={e => setAnchorValueDrafts(prev => ({ ...prev, [anchor.id]: e.target.value }))}
                            onBlur={e => commitScaleAnchorValue(anchor.id, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') {
                                cancelScaleAnchorValueDraft(anchor.id)
                                e.currentTarget.blur()
                              }
                            }}
                            className={`h-5 w-8 rounded border border-transparent bg-transparent px-0 text-center font-mono text-[10px] font-semibold text-slate-100 outline-none hover:border-slate-600 hover:bg-slate-800 focus:border-sky-400 focus:bg-slate-800 disabled:cursor-not-allowed ${numberInputClass} ${editingAnchorId === anchor.id ? 'bg-sky-900/70 text-white' : ''}`}
                            title="Edit anchor value"
                            aria-label={`Edit anchor ${idx + 1} value`}
                          />
                          <button
                            type="button"
                            disabled={anchorsLocked}
                            onClick={() => setEditingAnchorId(anchor.id)}
                            className={`block h-8 w-8 rounded border shadow-sm shadow-black/30 disabled:cursor-not-allowed ${
                              editingAnchorId === anchor.id ? 'border-sky-300 ring-2 ring-sky-400/35' : 'border-slate-500'
                            }`}
                            style={{ backgroundColor: anchor.color }}
                            aria-label={`Select anchor ${idx + 1}`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleScaleAnchor(anchor.id)}
                            disabled={anchorsLocked || (anchor.active && activeDesignerAnchors.length <= 2)}
                            className={`flex h-5 w-5 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-20 ${
                              anchor.active
	                                ? 'text-slate-300 hover:bg-slate-800 hover:text-sky-100'
	                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                            aria-label={`${anchor.active ? 'Disable' : 'Enable'} anchor ${idx + 1}`}
                            title={`${anchor.active ? 'Disable' : 'Enable'} anchor ${idx + 1}`}
                          >
                            {anchor.active ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                        </div>
                      ))}
                    </div>
	                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(30rem,1.35fr)]">
			                {selectedAnchor && (
		                  <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-2">
			                    <div className="mb-2 flex items-center gap-2">
			                      <span className="text-[10px] uppercase tracking-widest text-slate-300">Selected Anchor</span>
			                      <span className="text-[10px] font-mono text-slate-300">{formatScaleValue(selectedAnchor.value)} {scaleMeta.unit ?? ''}</span>
		                    </div>
		                    <div className="grid gap-3">
		                      <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
		                        <span className="mb-2 block text-[10px] uppercase tracking-widest text-slate-300">Endpoint</span>
		                        <div className="flex flex-wrap items-center gap-2">
		                          <input
		                            type="number"
		                            value={anchorValueDrafts[selectedAnchor.id] ?? (Number.isFinite(selectedAnchor.value) ? formatScaleValue(selectedAnchor.value) : '')}
                                onFocus={() => setAnchorValueDrafts(prev => ({ ...prev, [selectedAnchor.id]: Number.isFinite(selectedAnchor.value) ? formatScaleValue(selectedAnchor.value) : '' }))}
                                onChange={e => setAnchorValueDrafts(prev => ({ ...prev, [selectedAnchor.id]: e.target.value }))}
                                onBlur={e => commitScaleAnchorValue(selectedAnchor.id, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') {
                                    cancelScaleAnchorValueDraft(selectedAnchor.id)
                                    e.currentTarget.blur()
                                  }
                                }}
		                            className={`input h-9 w-14 px-1 text-center text-xs ${numberInputClass}`}
		                            aria-label="Selected anchor value"
		                          />
		                          <span
		                            className="h-9 w-9 rounded border border-slate-600 shadow-sm shadow-black/30"
		                            style={{ backgroundColor: selectedAnchor.color }}
		                            title="Selected anchor color"
		                          />
		                          <input
                                type="text"
                                value={anchorColorDrafts[selectedAnchor.id] ?? selectedAnchor.color}
                                onFocus={() => setAnchorColorDrafts(prev => ({ ...prev, [selectedAnchor.id]: selectedAnchor.color }))}
                                onChange={e => setAnchorColorDrafts(prev => ({ ...prev, [selectedAnchor.id]: e.target.value }))}
                                onBlur={e => commitScaleAnchorColor(selectedAnchor.id, e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') {
                                    setAnchorColorDrafts(prev => {
                                      const rest = { ...prev }
                                      delete rest[selectedAnchor.id]
                                      return rest
                                    })
                                    e.currentTarget.blur()
                                  }
                                }}
                                className="input h-9 w-24 px-2 font-mono text-xs"
                                aria-label="Selected anchor hex color"
                              />
		                          <label
		                            className="relative inline-flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
		                            aria-label="Edit selected anchor color"
		                            title="Edit color"
		                          >
		                            <Pencil size={14} />
		                            <input
		                              type="color"
		                              value={selectedAnchor.color}
		                              onChange={e => updateScaleAnchor(selectedAnchor.id, { color: e.target.value })}
		                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
		                              aria-label="Edit selected anchor color"
		                            />
		                          </label>
		                          <button
		                            type="button"
		                            onClick={() => toggleScaleAnchor(selectedAnchor.id)}
	                            disabled={selectedAnchor.active && activeDesignerAnchors.length <= 2}
	                            className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={selectedAnchor.active ? 'Disable selected anchor' : 'Enable selected anchor'}
                              title={selectedAnchor.active ? 'Disable selected anchor' : 'Enable selected anchor'}
	                          >
	                            {selectedAnchor.active ? <Eye size={13} /> : <EyeOff size={13} />}
	                          </button>
                            <button
                              type="button"
                              onClick={() => deleteScaleAnchor(selectedAnchor.id)}
                              disabled={designerAnchors.length <= 2 || (selectedAnchor.active && activeDesignerAnchors.length <= 2)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-red-900/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="Delete selected anchor"
                              title="Delete selected anchor"
                            >
                              <Trash2 size={13} />
                            </button>
		                        </div>
		                      </div>
		                    </div>
			                  </div>
			                )}
		                {selectedSegment && selectedSegmentFrom && selectedSegmentTo && (
	                  <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 p-2">
	                    <div className="mb-2 flex items-center gap-2">
	                      <span className="text-[10px] uppercase tracking-widest text-slate-300">Selected Segment</span>
	                      <span className="text-[10px] font-mono text-slate-300">{segmentLabel(selectedSegment, anchorsById)}</span>
                    </div>
                    <div className={`grid gap-3 lg:grid-cols-[13rem_minmax(22rem,1fr)] ${segmentsLocked ? 'pointer-events-none opacity-45' : ''}`}>
                      <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                        <span className="mb-2 block text-[10px] uppercase tracking-widest text-slate-300">Endpoints</span>
                        {[selectedSegmentFrom, selectedSegmentTo].map((anchor, endpointIdx) => (
                          <div key={anchor.id} className="mb-2 grid grid-cols-[1rem_3.5rem_2rem_minmax(4.5rem,1fr)] items-center gap-2 last:mb-0">
                            <span className="text-[10px] text-slate-300">{endpointIdx === 0 ? 'L' : 'R'}</span>
                            <input
                              type="number"
                              value={anchorValueDrafts[anchor.id] ?? (Number.isFinite(anchor.value) ? formatScaleValue(anchor.value) : '')}
                              onFocus={() => setAnchorValueDrafts(prev => ({ ...prev, [anchor.id]: Number.isFinite(anchor.value) ? formatScaleValue(anchor.value) : '' }))}
                              onChange={e => setAnchorValueDrafts(prev => ({ ...prev, [anchor.id]: e.target.value }))}
                              onBlur={e => commitScaleAnchorValue(anchor.id, e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                  cancelScaleAnchorValueDraft(anchor.id)
                                  e.currentTarget.blur()
                                }
                              }}
                              className={`input h-8 w-14 px-1 text-center text-xs ${numberInputClass}`}
                              aria-label={`${endpointIdx === 0 ? 'Left' : 'Right'} endpoint value`}
                            />
                            <input
                              type="color"
                              value={anchor.color}
                              onChange={e => updateScaleAnchor(anchor.id, { color: e.target.value })}
                              className="h-8 w-8 cursor-pointer rounded border border-slate-700 bg-slate-900 p-0.5"
                              aria-label={`${endpointIdx === 0 ? 'Left' : 'Right'} endpoint color`}
                            />
                            <span className="truncate font-mono text-[11px] text-slate-300">{anchor.color}</span>
                          </div>
                        ))}
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                        <span className="mb-2 block text-[10px] uppercase tracking-widest text-slate-300">Transition</span>
                        <div className="grid gap-2">
                          <div className="space-y-2">
                            <TabStrip
                              options={[
                                { value: 'linear_rgb', label: 'Linear' },
                                { value: 'discrete', label: 'Step' },
                                { value: 'bucket', label: 'Bucket' },
                                { value: 'palette', label: 'Palette' },
                              ]}
                              value={selectedSegment.mode}
                              onChange={v => updateScaleSegment(selectedSegment.id, { mode: v as ScaleSegmentMode })}
                              fullWidth
                            />
                            <div className="h-9 overflow-hidden rounded border border-slate-700" style={{ background: selectedSegmentGradient }} />
                          </div>
                          <div>
                            {selectedSegment.mode === 'palette' ? (
                              <div className="grid gap-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {SCALE_PALETTE_PRESETS.filter(preset => preset.id !== 'backend').map(preset => {
                                    const swatch = paletteSwatch(preset.colors, selectedSegment.reverse)
                                    return (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        disabled={segmentsLocked}
                                        onClick={() => updateScaleSegment(selectedSegment.id, { paletteId: preset.id })}
                                        className={`flex items-center overflow-hidden rounded border disabled:cursor-not-allowed ${selectedSegment.paletteId === preset.id ? 'border-sky-400' : 'border-slate-700'} hover:border-slate-400`}
                                        title={preset.label}
                                      >
                                        {(swatch ?? []).map((color, colorIdx) => (
                                          <span key={`${preset.id}-${colorIdx}`} className="h-5 w-5" style={{ backgroundColor: color }} />
                                        ))}
                                      </button>
                                    )
                                  })}
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="flex items-center gap-1 text-[10px] text-slate-300">
                                    <input type="checkbox" disabled={segmentsLocked} checked={selectedSegment.reverse} onChange={e => updateScaleSegment(selectedSegment.id, { reverse: e.target.checked })} />
                                    Reverse
                                  </label>
                                  <input type="number" disabled={segmentsLocked} min={2} max={12} value={selectedSegment.samples} onChange={e => updateScaleSegment(selectedSegment.id, { samples: Number(e.target.value) })} className={`input h-7 w-12 px-1 text-center text-[11px] ${numberInputClass}`} />
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-300">
                                {selectedSegment.mode === 'linear_rgb'
                                  ? 'The segment blends directly between the two endpoint colors.'
                                  : selectedSegment.mode === 'bucket'
                                    ? 'The segment holds the left endpoint color until the next endpoint.'
                                    : 'The segment splits into hard color steps between the two endpoints.'}
                              </div>
                            )}
                          </div>
                        </div>
	                      </div>
	                    </div>
	                  </div>
	                )}
	                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative bg-slate-900 border-b border-slate-700 px-5 py-2 flex items-center gap-3">
        <img src="/logo-mark.png" alt="" className="h-5 w-5 shrink-0" />
        <span className="font-bold tracking-tight text-sm">PyRe Weather</span>
        <span className="hidden sm:inline text-slate-400 text-sm font-light">Climate Reanalysis</span>
        <span className="hidden sm:inline text-[10px] text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">CORe / NCEP</span>

        {/* Time scale — far right of header */}
        <div className="ml-auto hidden md:flex items-center gap-3">
          {renderTimeScaleControls({ header: true })}
          {authEnabled && (
            <>
              <button type="button" onClick={handleSaveMap} disabled={saving}
                className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                title={user ? 'Save current map' : 'Sign in to save maps'}>
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              {user ? (
                <div className="relative">
                  <button type="button" onClick={() => setAccountMenuOpen(o => !o)}
                    className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                    title="Account">
                    <User size={14} />
                    <span className="max-w-[9rem] truncate">{user.email}</span>
                    <ChevronDown size={13} />
                  </button>
                  {accountMenuOpen && (
                    <>
                      <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setAccountMenuOpen(false)} />
                      <div className="absolute right-0 top-9 z-40 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl">
                        <button type="button" onClick={() => { setAccountMenuOpen(false); setLibraryOpen(true) }}
                          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                          <FolderOpen size={14} /> My Maps
                        </button>
                        {colorLabVisible && (adminMode ? (
                          <button type="button" onClick={() => { setAccountMenuOpen(false); openColorLab() }}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <SlidersHorizontal size={14} /> Color Lab
                          </button>
                        ) : (
                          <Link to="/admin" onClick={() => setAccountMenuOpen(false)}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <SlidersHorizontal size={14} /> Color Lab
                          </Link>
                        ))}
                        <button type="button" onClick={() => { setAccountMenuOpen(false); void signOut() }}
                          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                          <LogOut size={14} /> Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setAuthModalOpen(true)}
                  className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                  title="Sign in">
                  <LogIn size={14} /> Sign in
                </button>
              )}
            </>
          )}
          {!authEnabled && colorLabVisible && (adminMode ? (
            <button
              type="button"
              onClick={openColorLab}
              className="inline-flex h-7 items-center gap-2 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Open color lab"
            >
              Color Lab
            </button>
          ) : (
            <Link
              to="/admin"
              className="inline-flex h-7 items-center gap-2 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Open color lab"
            >
              Color Lab
            </Link>
          ))}
          <button type="button" onClick={() => setSettingsOpen(o => !o)}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
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
            {colorLabVisible && (adminMode ? (
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); openColorLab() }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
              >
                <SlidersHorizontal size={14} />
                Color Lab
              </button>
            ) : (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                <SlidersHorizontal size={14} />
                Color Lab
              </Link>
            ))}
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); setSettingsOpen(o => !o) }}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
            >
              <Settings size={14} />
              Settings
            </button>
            {authEnabled && (
              <>
                <div className="my-1 h-px bg-slate-800" />
                <button type="button" onClick={() => { setMobileMenuOpen(false); handleSaveMap() }} disabled={saving}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  <Save size={14} /> {saving ? 'Saving…' : 'Save map'}
                </button>
                {user ? (
                  <>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); setLibraryOpen(true) }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                      <FolderOpen size={14} /> My Maps
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); void signOut() }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                      <LogOut size={14} /> Sign out
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setMobileMenuOpen(false); setAuthModalOpen(true) }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                    <LogIn size={14} /> Sign in
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </header>

      <form onSubmit={handleGenerate}
        className={isVertical ? 'flex flex-1 min-h-0 overflow-x-auto' : 'p-4 flex flex-col gap-4'}>

        {/* ── Card panels ─────────────────────────────────────────────────── */}
        <div className={isVertical
          ? 'w-72 shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
          : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start'}>

          {/* Mobile · Time Scale */}
          <Section className="md:hidden">
            <CardRow>
              <VariableDisplayControl label="Time Scale">
                {renderTimeScaleControls()}
              </VariableDisplayControl>
            </CardRow>
          </Section>

          {/* 1 · Variable & Level */}
          <Section>
            <CardRow>
            <div className="flex gap-2 items-end">
              <SelectField
                label="Variable"
                value={variable === 'humidity' ? 'rel_humidity' : variable}
                options={VARIABLES}
                onChange={nextVariable => {
                    setVariable(nextVariable)
                    const nextLevel = levelOptionsForVariable(nextVariable)[0]?.value ?? '850'
                    setLevel(nextLevel)
                    if (shouldDefaultWindOverlay(apiVariableForSelection(nextVariable, nextLevel))) {
                      setWindOn(true)
                      setWindType('barbs')
                      setWindAnomalyOverlay('none')
                    }
                }}
                wrapperClassName="flex flex-col gap-1 flex-1 min-w-0"
              />
              <SelectField
                label={levelOptions.every(opt => SURFACE_LEVELS.has(opt.value)) ? 'Level' : 'Level (mb)'}
                value={level}
                options={levelOptions}
                onChange={nextLevel => {
                  setLevel(nextLevel)
                  if (shouldDefaultWindOverlay(apiVariableForSelection(variable, nextLevel))) {
                    setWindOn(true)
                    setWindType('barbs')
                    setWindAnomalyOverlay('none')
                  }
                }}
                className="input"
                wrapperClassName="flex flex-col gap-1 shrink-0"
              />

            </div>
            </CardRow>
            {(variable === 'wind_speed' || variable === 'temp' || variable === 'pressure' || variable === 'height' || variable === 'rel_humidity' || variable === 'humidity' || variable === 'precipitable_water') && (
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
                {variable === 'precipitable_water' && (
                  <VariableDisplayControl label="PWAT Units">
                    <TabStrip
                      options={[
                        { value: 'mm', label: 'mm' },
                        { value: 'in', label: 'inches' },
                      ]}
                      value={pwatUnit}
                      onChange={v => setPwatUnit(v as PwatUnit)}
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

          {/* 3 · Region */}
          <Section>
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
          <Section>
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
                  { value: 'anomaly',    label: 'Anomaly', disabled: rawOnlyVariable },
                  { value: 'normalized', label: 'Normalized', disabled: rawOnlyVariable },
                ]}
                value={displayMode}
                onChange={v => {
                  const next = v as DisplayMode
                  setDisplayMode(next)
                  if (next !== 'anomaly') setWindAnomalyOverlay('none')
                }}
                fullWidth
              />
            )}
            </VariableDisplayControl>
            </CardRow>
            {canUseWindAnomalyOverlay && (
              <CardRow>
                <VariableDisplayControl label="Anomaly Wind">
                  <TabStrip
                    options={[
                      { value: 'none', label: 'Shading' },
                      { value: 'vectors', label: 'Vectors' },
                      { value: 'barbs', label: 'Barbs' },
                    ]}
                    value={windAnomalyOverlay}
                    onChange={v => {
                      const next = v as WindAnomalyOverlay
                      setWindAnomalyOverlay(next)
                      if (next !== 'none') setWindOn(false)
                    }}
                    fullWidth
                  />
                </VariableDisplayControl>
              </CardRow>
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
              <Label>Overlays</Label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 pt-2 border-t border-slate-700/40">
              <Label>Actual Wind</Label>
              <button type="button" role="switch" aria-checked={windOn}
                onClick={() => {
                  setWindOn(o => {
                    const next = !o
                    if (next) setWindAnomalyOverlay('none')
                    return next
                  })
                }}
                className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors cursor-pointer ${windOn ? 'bg-sky-600' : 'bg-slate-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${windOn ? 'translate-x-3' : 'translate-x-0'}`} />
              </button>

              <div className={`flex items-center gap-6 ml-auto transition-opacity ${windOn ? '' : 'opacity-30 pointer-events-none'}`}>
                <div className="flex flex-col gap-0.5">
                  {(['barbs', 'vectors', 'isotachs'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setWindType(t)}
                              className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors leading-tight ${
                                  windType === t ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              }`}>
                        {t === 'barbs' ? 'Barbs' : t === 'vectors' ? 'Vectors' : 'Isotachs'}
                      </button>
                  ))}
                </div>
                {/* Density strides barbs/vectors; isotachs contour the full grid. */}
                <div className={`flex items-center gap-2 transition-opacity ${windType === 'isotachs' ? 'opacity-30 pointer-events-none' : ''}`}>
                  <Label>Density</Label>
                  <input type="number" min={1} max={20} value={windStep}
                    onChange={e => setWindStep(e.target.value)}
                    className="input w-10 text-center px-1" />
                </div>

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
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Layout</h3>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => setLayoutMode('horizontal')}
                    className={`flex items-center gap-2.5 rounded border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${!isVertical ? 'border-sky-500 bg-sky-950/40 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    <LayoutGrid size={15} className="shrink-0" />
                    <span>
                      Grid
                      <span className="block text-xs text-slate-400 font-normal">Controls above the map.</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setLayoutMode('vertical')}
                    className={`flex items-center gap-2.5 rounded border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${isVertical ? 'border-sky-500 bg-sky-950/40 text-slate-100' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    <PanelLeft size={15} className="shrink-0" />
                    <span>
                      Side-by-side
                      <span className="block text-xs text-slate-400 font-normal">Controls in a column beside the map.</span>
                    </span>
                  </button>
                </div>
              </section>
              <section>
                <h3 className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-4">Anomalies</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The climatology baseline is chosen automatically to match the map&rsquo;s
                  temporal resolution. The map title always shows the source actually used.
                </p>
              </section>
            </div>
          </div>
        </>
      )}

      <SiteFooter />

      {colorLabAccess && colorLabOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setColorLabOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(1120px,96vw)] shadow-2xl flex flex-col max-h-[96vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                <div>
                  <span className="font-semibold text-base">Color Lab</span>
                  <p className="text-xs text-slate-400 mt-1">Admin-only color-scale preview and experimental controls.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setColorLabOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto px-5 py-3">
                {renderScaleInspector()}
              </div>
            </div>
          </div>
        </>
      )}

      {authEnabled && authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {authEnabled && libraryOpen && user && (
        <LibraryModal onClose={() => setLibraryOpen(false)} onLoadMap={handleLoadMap} />
      )}
      {authEnabled && saveModalOpen && user && (
        <SaveMapModal
          suggestedName={suggestedMapName(currentMapRecipe())}
          initialTarget={saveTarget}
          onClose={() => setSaveModalOpen(false)}
          onSave={handleSaveMapConfirm}
        />
      )}

    </div>
  )
}
