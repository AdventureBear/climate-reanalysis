// State and lifecycle for the Color Lab scale designer. This hook lives in App
// (not inside the panel) because the generate path reads designer state: when
// the designer matches the map being rendered, its custom scale is attached to
// the /api/map request via applyScaleToParams.
import { useEffect, useRef, useState } from 'react'
import type { DisplayMode, PwatUnit, WindUnit } from '../../../mapRecipe'
import { API_BASE } from '../../../lib/api'
import { normalizeColorStep } from '../../../sharedOptions'
import {
  activeAnchors,
  anchorsFromScaleMeta,
  renderedScaleFromDesigner,
  resolveScaleFamily,
  segmentsFromAnchors,
  type ScaleAnchor,
  type ScaleMeta,
  type ScaleSegment,
  type ScaleSegmentMode,
} from './scaleModel'


export function useScaleDesigner({ enabled, colorStep, windUnit, pwatUnit }: {
  enabled: boolean
  colorStep: string
  windUnit: WindUnit
  pwatUnit: PwatUnit
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
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null)
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [anchorValueDrafts, setAnchorValueDrafts] = useState<Record<string, string>>({})
  const [anchorColorDrafts, setAnchorColorDrafts] = useState<Record<string, string>>({})
  const [showOriginalScale, setShowOriginalScale] = useState(false)
  const [scaleInfoOpen, setScaleInfoOpen] = useState(false)
  const scalePreviewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
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
  }, [enabled, colorStep, labLevel, labMode, labVariable, pwatUnit, windUnit])

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

  // Point the designer at the map currently configured in the builder.
  function seedFrom(variable: string, level: string, mode: DisplayMode) {
    setLabVariable(variable)
    setLabLevel(level)
    setLabMode(mode)
    setLabFamily(resolveScaleFamily(variable, mode, level).key)
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

    const labAnchors = activeAnchors(scaleAnchors)
    const labSegments = segmentsFromAnchors(labAnchors, scaleSegments)
    const renderedScale = renderedScaleFromDesigner(labAnchors, labSegments, target.safeColorStep)
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
    editingAnchorId, setEditingAnchorId,
    editingSegmentId, setEditingSegmentId,
    anchorValueDrafts, setAnchorValueDrafts,
    anchorColorDrafts, setAnchorColorDrafts,
    showOriginalScale, setShowOriginalScale,
    scaleInfoOpen, setScaleInfoOpen,
    scalePreviewRef,
    seedFrom,
    applyScaleToParams,
  }
}

export type ScaleDesigner = ReturnType<typeof useScaleDesigner>
