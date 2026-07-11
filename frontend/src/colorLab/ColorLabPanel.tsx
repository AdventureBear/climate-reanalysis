// The Color Lab modal: scale designer UI over a ScaleDesigner from
// useScaleDesigner. All state lives in the designer (owned by App) so edits
// survive close/reopen and the generate path can read them.
import { Check, CircleHelp, Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { DisplayMode, PwatUnit, WindUnit } from '../mapRecipe'
import { normalizeColorStep } from '../sharedOptions'
import { COLOR_LAB_VARIABLES, PRESSURE_LEVELS, RAW_ONLY_API_VARIABLES } from '../variableConfig'
import { SelectField, TabStrip } from '../ui/controls'
import {
  SCALE_PALETTE_PRESETS,
  activeAnchors,
  anchorRailPositions,
  anchorValuePercent,
  anchorsFromScaleMeta,
  formatScaleValue,
  getScaleFamilies,
  previewGradient,
  renderedScaleFromDesigner,
  renderedScaleGradient,
  resolveScaleFamily,
  segmentLabel,
  segmentsFromAnchors,
  sortedAnchors,
  type ScaleAnchor,
  type ScaleSegment,
  type ScaleSegmentMode,
} from './scaleModel'
import type { ScaleDesigner } from './useScaleDesigner'

const LEVELS = [...PRESSURE_LEVELS]

export default function ColorLabPanel({
  designer,
  colorStep,
  setColorStep,
  windUnit,
  setWindUnit,
  pwatUnit,
  setPwatUnit,
  onClose,
}: {
  designer: ScaleDesigner
  colorStep: string
  setColorStep: (value: string) => void
  windUnit: WindUnit
  setWindUnit: (unit: WindUnit) => void
  pwatUnit: PwatUnit
  setPwatUnit: (unit: PwatUnit) => void
  onClose: () => void
}) {
  const {
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
  } = designer

  const labFamilies = getScaleFamilies(labVariable, labMode)
  const activeFamily = labFamilies.find(f => f.key === labFamily) ?? labFamilies[0]

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
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(1120px,96vw)] shadow-2xl flex flex-col max-h-[96vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
            <div>
              <span className="font-semibold text-base">Color Lab</span>
              <p className="text-xs text-slate-400 mt-1">Admin-only color-scale preview and experimental controls.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-3">
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
          </div>
        </div>
      </div>
    </>
  )
}
