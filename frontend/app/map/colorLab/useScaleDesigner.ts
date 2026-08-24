// State and lifecycle for the Color Lab scale designer. This hook lives in App
// (not inside the panel) because the generate path reads designer state: when
// the designer matches the map being rendered, its custom scale is attached to
// the /api/map request via applyScaleToParams.
import { useEffect, useRef, useState } from 'react'
import type { DisplayMode, PrecipUnit, PwatUnit, WindUnit } from '../../../mapRecipe'
import { API_BASE } from '../../../lib/api'
import { normalizeColorStep } from '../../../sharedOptions'
import { COLOR_LAB_VARIABLES, isWindUnitApiVariable } from '../../../variableConfig'
import {
  activeAnchors,
  anchorsFromValues,
  anchorsFromScaleMeta,
  renderedScaleFromDesigner,
  resolveScaleFamily,
  segmentId,
  segmentsFromAnchors,
  type ScaleAnchor,
  type ScaleMeta,
  type ScaleSegment,
  type ScaleSegmentMode,
} from './scaleModel'

// Everything about the designer state that affects the rendered scale, as a
// comparable string. Used to detect whether the admin actually edited the
// scale: an untouched designer equals the backend default, and attaching that
// to a request would only bloat the URL (the backend renders the same map
// without it).
function designerSignature(anchors: ScaleAnchor[], segments: ScaleSegment[]): string {
  const ordered = activeAnchors(anchors)
  const orderedSegments = segmentsFromAnchors(ordered, segments)
  return JSON.stringify({
    anchors: ordered.map(anchor => [anchor.value, anchor.color.toLowerCase()]),
    segments: orderedSegments.map(segment => [
      segment.mode,
      segment.mode === 'palette' ? segment.paletteId : null,
      segment.mode === 'palette' ? segment.reverse : null,
      segment.mode === 'palette' ? segment.samples : null,
    ]),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isScaleSegmentMode(value: unknown): value is ScaleSegmentMode {
  return value === 'linear_rgb' || value === 'discrete' || value === 'bucket' || value === 'palette'
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === 'raw' || value === 'anomaly' || value === 'normalized'
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

const COLOR_LAB_VARIABLE_KEYS = new Set(COLOR_LAB_VARIABLES.map(option => option.value))


export function useScaleDesigner({ enabled, colorStep, windUnit, pwatUnit, precipUnit }: {
  enabled: boolean
  colorStep: string
  windUnit: WindUnit
  pwatUnit: PwatUnit
  precipUnit: PrecipUnit
}) {
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
  const [scaleImportOpen, setScaleImportOpen] = useState(false)
  const [scaleImportDraft, setScaleImportDraft] = useState('')
  const [scaleImportError, setScaleImportError] = useState<string | null>(null)
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [anchorValueDrafts, setAnchorValueDrafts] = useState<Record<string, string>>({})
  const [anchorColorDrafts, setAnchorColorDrafts] = useState<Record<string, string>>({})
  const [showOriginalScale, setShowOriginalScale] = useState(false)
  const [scaleInfoOpen, setScaleInfoOpen] = useState(false)
  const scalePreviewRef = useRef<HTMLDivElement | null>(null)
  // Signature of the untouched backend-seeded scale; see designerSignature.
  const pristineSignatureRef = useRef<string | null>(null)
  const skipNextScaleMetaSeedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const safeColorStep = normalizeColorStep(colorStep)

    const params = new URLSearchParams({
      variable: labVariable,
      level: labLevel,
      color_step: String(safeColorStep),
      mode: labMode,
    })
    if (isWindUnitApiVariable(labVariable)) {
      params.set('wind_unit', windUnit)
    }
    if (labVariable === 'precipitable_water') params.set('pwat_unit', pwatUnit)
    if (labVariable === 'precip_rate' || labVariable === 'precip_total') {
      params.set('precip_unit', precipUnit)
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
      } finally {
        setScaleMetaLoading(false)
      }
    }

    void loadScaleMeta()

    return () => controller.abort()
  }, [enabled, colorStep, labLevel, labMode, labVariable, precipUnit, pwatUnit, windUnit])

  useEffect(() => {
    if (skipNextScaleMetaSeedRef.current) {
      skipNextScaleMetaSeedRef.current = false
      return
    }

    const backendAnchors = anchorsFromScaleMeta(scaleMeta)
    if (backendAnchors.length) {
      const defaultMode: ScaleSegmentMode = scaleMeta?.scale_kind === 'vector-anomaly-magnitude' ? 'bucket' : 'linear_rgb'
      const defaultSegments = segmentsFromAnchors(backendAnchors, [], defaultMode)
      setScaleAnchors(backendAnchors)
      setScaleSegments(defaultSegments)
      pristineSignatureRef.current = designerSignature(backendAnchors, defaultSegments)
      setScalePreset('backend')
      setAnchorValueDrafts({})
      setAnchorColorDrafts({})
      setShowOriginalScale(false)
    } else {
      pristineSignatureRef.current = null
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

  // Point the designer at the map currently configured in the builder.
  function seedFrom(variable: string, level: string, mode: DisplayMode) {
    setLabVariable(variable)
    setLabLevel(level)
    setLabMode(mode)
    setLabFamily(resolveScaleFamily(variable, mode, level).key)
  }

  function importScaleSpec(raw: string): { ok: boolean; colorStep?: number } {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      setScaleImportError('Paste a valid Color Lab JSON export.')
      return { ok: false }
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.anchors)) {
      setScaleImportError('Import needs an anchors array from a Color Lab export.')
      return { ok: false }
    }

    const importedAnchors = parsed.anchors
      .map(anchor => {
        if (!isRecord(anchor) || !isHexColor(anchor.color)) return null
        const value = Number(anchor.value)
        if (!Number.isFinite(value)) return null
        return { value, color: anchor.color.trim().toLowerCase() }
      })
      .filter((anchor): anchor is { value: number; color: string } => Boolean(anchor))

    if (importedAnchors.length < 2) {
      setScaleImportError('Import needs at least two valid anchors.')
      return { ok: false }
    }

    const nextVariable = typeof parsed.variable === 'string' ? parsed.variable : labVariable
    if (!COLOR_LAB_VARIABLE_KEYS.has(nextVariable)) {
      setScaleImportError(`Color Lab does not recognize variable "${nextVariable}".`)
      return { ok: false }
    }

    const nextMode = isDisplayMode(parsed.mode) ? parsed.mode : labMode
    const nextLevel = parsed.level === undefined || parsed.level === null ? labLevel : String(parsed.level)
    const nextFamily = resolveScaleFamily(nextVariable, nextMode, nextLevel)
    const safeLevel = nextFamily.levels.includes(Number(nextLevel)) ? nextLevel : String(nextFamily.levels[0])

    const nextAnchors = anchorsFromValues(
      importedAnchors.map(anchor => anchor.value),
      importedAnchors.map(anchor => anchor.color),
    )
    const importedSegments = Array.isArray(parsed.segments) ? parsed.segments : []
    const segmentSpecsByRange = new Map<string, Record<string, unknown>>()
    importedSegments.forEach(segment => {
      if (!isRecord(segment)) return
      const from = Number(segment.from)
      const to = Number(segment.to)
      if (!Number.isFinite(from) || !Number.isFinite(to)) return
      segmentSpecsByRange.set(`${from}:${to}`, segment)
    })
    const nextSegments = segmentsFromAnchors(nextAnchors).map(segment => {
      const from = nextAnchors.find(anchor => anchor.id === segment.fromId)
      const to = nextAnchors.find(anchor => anchor.id === segment.toId)
      const spec = from && to ? segmentSpecsByRange.get(`${from.value}:${to.value}`) : undefined
      if (!spec) return segment
      return {
        ...segment,
        id: segmentId(segment.fromId, segment.toId),
        mode: isScaleSegmentMode(spec.mode) ? spec.mode : segment.mode,
        paletteId: typeof spec.palette === 'string' ? spec.palette : segment.paletteId,
        reverse: typeof spec.reverse === 'boolean' ? spec.reverse : segment.reverse,
        samples: Number.isFinite(Number(spec.samples))
          ? Math.max(2, Math.min(24, Math.round(Number(spec.samples))))
          : segment.samples,
      }
    })

    skipNextScaleMetaSeedRef.current = nextVariable !== labVariable || nextMode !== labMode || safeLevel !== labLevel
    setLabVariable(nextVariable)
    setLabMode(nextMode)
    setLabLevel(safeLevel)
    setLabFamily(nextFamily.key)
    setScaleAnchors(nextAnchors)
    setScaleSegments(nextSegments)
    pristineSignatureRef.current = null
    setScalePreset('custom')
    setAnchorValueDrafts({})
    setAnchorColorDrafts({})
    setShowOriginalScale(false)
    setEditingAnchorId(nextAnchors[0]?.id ?? null)
    setEditingSegmentId(nextSegments[0]?.id ?? null)
    setScaleImportError(null)
    setScaleImportOpen(false)

    const importedColorStep = Number(parsed.color_step)
    return {
      ok: true,
      colorStep: Number.isFinite(importedColorStep) ? normalizeColorStep(importedColorStep) : undefined,
    }
  }

  // If the designer targets exactly the map being generated, attach the custom
  // scale to the request params. Mutates `params` in place, mirroring the
  // pre-extraction handleGenerate behavior.
  function applyScaleToParams(
    params: Record<string, string>,
    target: { apiVariable: string; apiLevel: string; renderMode: DisplayMode; safeColorStep: number },
  ) {
    const labScaleApplies =
      enabled &&
      labVariable === target.apiVariable &&
      labMode === target.renderMode &&
      String(labLevel) === String(target.apiLevel) &&
      activeAnchors(scaleAnchors).length > 1
    if (!labScaleApplies) return

    // Only an actually-edited scale is worth sending: the auto-seeded default
    // reproduces the backend's built-in scale, so skip it and keep request
    // params and share URLs short.
    if (designerSignature(scaleAnchors, scaleSegments) === pristineSignatureRef.current) return

    const labAnchors = activeAnchors(scaleAnchors)
    const labSegments = segmentsFromAnchors(labAnchors, scaleSegments)
    const renderedScale = renderedScaleFromDesigner(labAnchors, labSegments, scaleMeta?.step ?? target.safeColorStep)
    if (renderedScale.boundaries.length > 1 && renderedScale.colors.length === renderedScale.boundaries.length - 1) {
      params.scale_min = String(renderedScale.boundaries[0])
      params.scale_max = String(renderedScale.boundaries[renderedScale.boundaries.length - 1])
      params.scale_spec = JSON.stringify({
        variable: labVariable,
        mode: labMode,
        level: Number(labLevel),
        unit: scaleMeta?.unit ?? null,
        color_step: target.safeColorStep,
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

  return {
    labVariable, setLabVariable,
    labLevel, setLabLevel,
    labMode, setLabMode,
    labFamily, setLabFamily,
    scaleMeta,
    scaleMetaError,
    scaleMetaLoading,
    setScalePreset,
    scaleAnchors, setScaleAnchors,
    scaleSegments, setScaleSegments,
    scaleExportOpen, setScaleExportOpen,
    scaleExportCopied, setScaleExportCopied,
    scaleImportOpen, setScaleImportOpen,
    scaleImportDraft, setScaleImportDraft,
    scaleImportError, setScaleImportError,
    editingAnchorId, setEditingAnchorId,
    editingSegmentId, setEditingSegmentId,
    anchorValueDrafts, setAnchorValueDrafts,
    anchorColorDrafts, setAnchorColorDrafts,
    showOriginalScale, setShowOriginalScale,
    scaleInfoOpen, setScaleInfoOpen,
    scalePreviewRef,
    seedFrom,
    importScaleSpec,
    applyScaleToParams,
  }
}

export type ScaleDesigner = ReturnType<typeof useScaleDesigner>
