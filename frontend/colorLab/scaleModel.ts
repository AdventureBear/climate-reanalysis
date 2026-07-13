// Color Lab scale model: the pure data types and color math behind the scale
// designer. No React here — everything is a plain function so the designer UI
// and the map-generation path can share one source of truth.
import type { DisplayMode } from '../mapRecipe'
import { COLOR_LAB_SINGLE_LEVEL_VARIABLES, PRESSURE_LEVELS } from '../variableConfig'

const LEVELS = [...PRESSURE_LEVELS]

export type ScaleMeta = {
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
export type ScaleAnchor = { id: string; value: number; color: string; active: boolean }
export type ScaleSegmentMode = 'linear_rgb' | 'discrete' | 'bucket' | 'palette'
export type ScaleSegment = {
  id: string
  fromId: string
  toId: string
  mode: ScaleSegmentMode
  paletteId: string
  reverse: boolean
  samples: number
}
export type ScalePalettePreset = {
  id: string
  label: string
  family: 'PyRe' | 'Sequential' | 'Diverging' | 'Perceptual'
  colors: string[]
}
export type ScaleFamily = {
  key: string
  label: string
  levels: number[]
  description: string
}

export const SCALE_PALETTE_PRESETS: ScalePalettePreset[] = [
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

export function formatScaleValue(value: number): string {
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value))
  return value.toFixed(1).replace(/\.0$/, '')
}

export function scaleAnchorId(idx: number) {
  return `anchor-${idx}`
}

export function anchorsFromValues(values: number[], colors: string[]): ScaleAnchor[] {
  return values.map((value, idx) => ({
    id: scaleAnchorId(idx),
    value,
    color: colors[idx] ?? colors[colors.length - 1] ?? '#ffffff',
    active: true,
  }))
}

export function anchorsFromScaleMeta(meta: ScaleMeta | null): ScaleAnchor[] {
  const values = meta?.anchor_values ?? []
  const colors = meta?.anchor_hex ?? []
  if (!values.length || !colors.length) return []
  return anchorsFromValues(values, colors)
}

export function sortedAnchors(anchors: ScaleAnchor[]) {
  return [...anchors].sort((a, b) => a.value - b.value)
}

export function activeAnchors(anchors: ScaleAnchor[]) {
  return sortedAnchors(anchors).filter(anchor => anchor.active)
}

export function anchorValuePercent(anchor: ScaleAnchor, min: number, max: number) {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((anchor.value - min) / (max - min)) * 100))
}

export function anchorRailPositions(anchors: ScaleAnchor[], min: number, max: number, railWidthPx: number) {
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

export function segmentId(fromId: string, toId: string) {
  return `${fromId}--${toId}`
}

export function segmentLabel(segment: ScaleSegment, anchorsById: Map<string, ScaleAnchor>) {
  const from = anchorsById.get(segment.fromId)
  const to = anchorsById.get(segment.toId)
  return `${from ? formatScaleValue(from.value) : '?'} to ${to ? formatScaleValue(to.value) : '?'}`
}

export function segmentsFromAnchors(anchors: ScaleAnchor[], previous: ScaleSegment[] = [], defaultMode: ScaleSegmentMode = 'linear_rgb'): ScaleSegment[] {
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

export function colorsForSegment(segment: ScaleSegment, from: ScaleAnchor, to: ScaleAnchor): string[] {
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

export function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean, 16)
  if (!Number.isFinite(value) || clean.length !== 6) return [255, 255, 255] as const
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

export function mixHex(left: string, right: string, t: number) {
  const a = hexToRgb(left)
  const b = hexToRgb(right)
  return rgbToHex(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  )
}

export function colorAtScaleValue(value: number, anchors: ScaleAnchor[], segments: ScaleSegment[]) {
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

export function renderedScaleFromDesigner(anchors: ScaleAnchor[], segments: ScaleSegment[], step: number) {
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

export function renderedScaleGradient(boundaries: number[], colors: string[]) {
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

export function previewGradient(anchors: ScaleAnchor[], segments: ScaleSegment[]): string {
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

export function getScaleFamilies(variable: string, mode: DisplayMode): ScaleFamily[] {
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

export function resolveScaleFamily(variable: string, mode: DisplayMode, level: string): ScaleFamily {
  const families = getScaleFamilies(variable, mode)
  return families.find(f => f.levels.includes(Number(level))) ?? families[0]
}
