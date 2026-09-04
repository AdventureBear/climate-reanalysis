'use client'

import { useEffect, useRef, useState } from 'react'
import { Settings, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../auth/authContext'
import { AuthModal } from '../auth/AuthModal'
import { SaveAccountPrompt } from './builder/SaveAccountPrompt'
import { saveMap } from '../../lib/library'
import { SaveMapModal, type SaveTarget } from './projects/SaveMapModal'
import { blobFromObjectUrl } from '../../lib/images'
import { suggestedMapName } from './mapName'
import { mapRecipeFromUrl, mapRecipeToParams, normalizedUnavailableInUrl, type MapRecipeRetry } from '../../mapRecipe'
import { gapRetryFromGap } from './builder/useMapGeneration'
import { normalizeColorStep } from '../../sharedOptions'
import { getRegionLabel } from './builder/regionCatalog'
import { useCompositeRecipe } from './builder/useCompositeRecipe'
import { AnalysisPanel } from './builder/AnalysisPanel'
import { MapPanel } from './builder/MapPanel'
import { OverlaysPanel } from './builder/OverlaysPanel'
import { PanelsSection } from './builder/PanelsSection'
import { RegionsModal } from './builder/RegionsModal'
import { TemporalPanel } from './builder/TemporalPanel'
import { TimeScaleControls } from './builder/TimeScaleControls'
import { VariableLevelPanel } from './builder/VariableLevelPanel'
import { SettingsDrawer } from './SettingsDrawer'
import { useMapGeneration } from './builder/useMapGeneration'
import ColorLabPanel from './colorLab/ColorLabPanel'
import { useScaleDesigner } from './colorLab/useScaleDesigner'
import { CardRow, Section, VariableDisplayControl } from '../../ui/controls'

const SAVE_TARGET_STORAGE_KEY = 'pyre.saveTarget'

// -- Main component ------------------------------------------------------------

export default function MapBuilder() {

  const recipe = useCompositeRecipe()
  const {
    region, setRegion,
    displayMode,
    colorStep, setColorStep,
    windUnit, setWindUnit,
    pwatUnit, setPwatUnit,
    precipUnit, setPrecipUnit,
    surfaceTemperatureUnit, setSurfaceTemperatureUnit,
    elevatedTemperatureUnit, setElevatedTemperatureUnit,
    apiVariable, apiLevel, isClimo,
    preferCoreClimo, chooseCoreClimoPreference,
    currentMapRecipe, applyRecipeToState,
    isBlankMap,
  } = recipe

  const [regionsOpen, setRegionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorLabOpen, setColorLabOpen] = useState(false)

  const { mapSrc, loading, error, setError, dataGap, requestNotice, setRequestNotice, generateFromParams } = useMapGeneration()

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const [sideBySideAvailable, setSideBySideAvailable] = useState(false)
  const isVertical = layoutMode === 'vertical' && sideBySideAvailable

  const { enabled: authEnabled, user, isAdmin } = useAuth()
  // Color Lab is admin-only tooling. With accounts enabled it needs the
  // profile admin flag; without accounts (local dev / dark launch) the /admin
  // route stays available as a dev escape hatch.
  const colorLabVisible = authEnabled ? isAdmin : true
  // Color Lab: admins via profiles.is_admin; always on in local no-accounts
  // dev. (The old /admin escape-hatch route is gone.)
  const colorLabAccess = colorLabVisible
  const scaleDesigner = useScaleDesigner({ enabled: colorLabAccess, colorStep, windUnit, pwatUnit, precipUnit })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login')
  const [savePromptOpen, setSavePromptOpen] = useState(false)
  // Explains a mode the builder had to change when opening a link (#72).
  const [modeNotice, setModeNotice] = useState<string | null>(null)
  const [preflightRetry, setPreflightRetry] = useState<MapRecipeRetry | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  // Last save destination, remembered across saves (and reloads) so saving
  // repeatedly into the same project/folder is a single confirm.
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(() => {
    try { return JSON.parse(localStorage.getItem(SAVE_TARGET_STORAGE_KEY) ?? 'null') } catch { return null }
  })

  // URL → state synchronization. Runs for deep links and browser back/forward;
  // URL updates made by handleGenerate are skipped via the ref.
  const selfUpdatedParamsRef = useRef<string | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setSideBySideAvailable(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    // Read the query string directly (no useSearchParams): the hook forces a
    // Suspense/CSR bailout on a statically exported page. Deep links apply on
    // mount; popstate covers back/forward.
    const applyFromLocation = () => {
      const params = new URLSearchParams(window.location.search)
      const originalParamsString = params.toString()
      if (originalParamsString === selfUpdatedParamsRef.current) return
      selfUpdatedParamsRef.current = originalParamsString

      const recipe = mapRecipeFromUrl(params)
      if (!recipe) return
      applyRecipeToState(recipe)
      // A link asking for normalized on a single-hour map loads as anomaly
      // (#72). Say so rather than quietly handing over a different map.
      const normalizedNotice = normalizedUnavailableInUrl(params)
        ? 'Normalized maps are not available for a single hour, so this opened as an anomaly map. Switch to Daily for a normalized map.'
        : null
      // Decision 2 (docs/TIME_SELECTION_PLAN.md): a legacy link with a date
      // but no hour at all used to render a 00z snapshot; it now renders the
      // full-day composite. Say so once instead of silently changing the map.
      const bareDateNotice =
        !params.get('time_scale') && !params.get('hour') && !params.get('hours')
        && !params.get('months') && params.get('mode') !== 'climatology'
        && Boolean(params.get('date') ?? params.get('dates'))
          ? 'This link now shows a full-day composite (the average of 00z, 06z, 12z, and 18z). For a single time, switch to 3-hourly and pick an hour.'
          : null
      setModeNotice([normalizedNotice, bareDateNotice].filter(Boolean).join(' ') || null)

      // Shared/deep-linked URLs render immediately instead of showing an empty
      // panel until the user clicks Generate.
      const recipeParams = mapRecipeToParams(recipe)
      if (recipeParams.ok) {
        setPreflightRetry(null)
        const paramsForRender = recipeParams.params
        void generateFromParams(paramsForRender).then(ignoredParams => {
          const cleanedParams = new URLSearchParams(paramsForRender)
          ignoredParams.forEach(key => cleanedParams.delete(key))
          const cleanedParamsString = cleanedParams.toString()
          if (cleanedParamsString === originalParamsString) return
          selfUpdatedParamsRef.current = cleanedParamsString
          window.history.replaceState(null, '', cleanedParamsString ? `?${cleanedParamsString}` : window.location.pathname)
        })
      } else {
        setError(recipeParams.error)
        setPreflightRetry(recipeParams.retry ?? null)
      }
    }
    applyFromLocation()

    window.addEventListener('popstate', applyFromLocation)
    return () => window.removeEventListener('popstate', applyFromLocation)
    // Recipe/generation helpers are recreated every render by their hooks; this
    // effect must register once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openColorLab() {
    if (isBlankMap) return
    scaleDesigner.seedFrom(apiVariable, apiLevel, isClimo ? 'raw' : displayMode)
    setColorLabOpen(true)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPreflightRetry(null)

    const recipeParams = mapRecipeToParams(currentMapRecipe())
    if (!recipeParams.ok) {
      setError(recipeParams.error)
      setPreflightRetry(recipeParams.retry ?? null)
      return
    }
    const params = recipeParams.params
    scaleDesigner.applyScaleToParams(params, {
      apiVariable,
      apiLevel,
      renderMode: isClimo ? 'raw' : displayMode,
      safeColorStep: normalizeColorStep(colorStep),
    })

    // Mark this URL update as our own so the URL-sync effect doesn't re-apply
    // it (and re-render the map a second time).
    selfUpdatedParamsRef.current = new URLSearchParams(params).toString()
    window.history.replaceState(null, '', `?${new URLSearchParams(params).toString()}`)
    await generateFromParams(params)
  }

  // One-click retry for a composite with missing data (#95): the offer is
  // just a new request — a truncated range (title stays honest via the
  // params) or the same range with skip_missing=1 (the map's margin
  // discloses the skipped times). Recipe state and URL follow the params.
  const gapRetry = gapRetryFromGap(dataGap)
  const mapRetry = gapRetry ?? preflightRetry
  function handleMapRetry() {
    if (!mapRetry) return
    const params = mapRetry.params
    setPreflightRetry(null)
    const retryRecipe = mapRecipeFromUrl(new URLSearchParams(params))
    if (retryRecipe) applyRecipeToState(retryRecipe)
    selfUpdatedParamsRef.current = new URLSearchParams(params).toString()
    window.history.replaceState(null, '', `?${new URLSearchParams(params).toString()}`)
    void generateFromParams(params)
  }

  // -- Save / load library maps -------------------------------------------------
  function handleSaveMap() {
    if (!user) { setSavePromptOpen(true); return }
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

  // -- Render --------------------------------------------------------------------
  return (
    <div className="flex flex-1 flex-col bg-slate-950">
      {/* Map toolbar: app-level controls, owned by this page (site navigation
          lives in the global header). Collapses to the Time Scale card on mobile. */}
      <div className="hidden md:flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-2">
        <TimeScaleControls recipe={recipe} header />
        <div className="ml-auto flex items-center gap-2">
          {colorLabAccess && (
            <button type="button" onClick={openColorLab} disabled={isBlankMap}
              className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 text-xs transition-colors ${
                isBlankMap
                  ? 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-600'
                  : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}>
              <SlidersHorizontal size={14} /> Color Lab
            </button>
          )}
          <button type="button" onClick={() => setSettingsOpen(o => !o)}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            title="Settings">
            <Settings size={16} />
          </button>
        </div>
      </div>

      <form onSubmit={handleGenerate}
        className={isVertical ? 'flex flex-1 min-h-0 overflow-x-auto' : 'p-4 flex flex-col gap-4'}>

        {/* -- Card panels --------------------------------------------------- */}
        <div className={isVertical
          ? 'w-[calc(((100vw-68px)/4)+24px)] shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
          : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start'}>

          {/* Mobile · Time Scale */}
          <Section className="md:hidden">
            <CardRow>
              <VariableDisplayControl label="Time Scale">
                <TimeScaleControls recipe={recipe} />
              </VariableDisplayControl>
            </CardRow>
          </Section>

          <VariableLevelPanel recipe={recipe} />
          <TemporalPanel recipe={recipe} isVertical={isVertical} />

          {/* Region */}
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

          <OverlaysPanel recipe={recipe} />
          {isVertical && <AnalysisPanel recipe={recipe} loading={loading} />}
        </div>

        {/* -- Advanced composition panels ----------------------------------- */}
        {!isVertical && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
          <AnalysisPanel recipe={recipe} loading={loading} />
          <PanelsSection className="max-lg:hidden xl:col-start-3 xl:col-span-2 xl:h-full" />
        </div>}

        {/* -- Map panel ----------------------------------------------------- */}
        <MapPanel mapSrc={mapSrc} error={error} loading={loading} isVertical={isVertical}
          retry={mapRetry ? { label: mapRetry.label, question: mapRetry.question, onClick: handleMapRetry } : null}
          notice={[requestNotice, modeNotice].filter(Boolean).join(' ') || null}
          onDismissNotice={() => { setRequestNotice(null); setModeNotice(null) }}
          onDismissError={() => { setError(null); setPreflightRetry(null) }}
          onSave={authEnabled ? handleSaveMap : undefined} saving={saving} />
      </form>

      <RegionsModal
        open={regionsOpen}
        region={region}
        onSelect={regionKey => { setRegion(regionKey); setRegionsOpen(false) }}
        onClose={() => setRegionsOpen(false)}
      />

      {settingsOpen && (
        <SettingsDrawer isVertical={isVertical} setLayoutMode={setLayoutMode}
          windUnit={windUnit} onWindUnit={setWindUnit}
          surfaceTemperatureUnit={surfaceTemperatureUnit} onSurfaceTemperatureUnit={setSurfaceTemperatureUnit}
          elevatedTemperatureUnit={elevatedTemperatureUnit} onElevatedTemperatureUnit={setElevatedTemperatureUnit}
          precipitationUnit={precipUnit} onPrecipitationUnit={setPrecipUnit}
          preferCoreClimo={preferCoreClimo} onPreferCoreClimo={chooseCoreClimoPreference}
          onClose={() => setSettingsOpen(false)} />
      )}


      {colorLabAccess && colorLabOpen && (
        <ColorLabPanel
          designer={scaleDesigner}
          colorStep={colorStep}
          setColorStep={setColorStep}
          windUnit={windUnit}
          setWindUnit={setWindUnit}
          pwatUnit={pwatUnit}
          setPwatUnit={setPwatUnit}
          precipUnit={precipUnit}
          setPrecipUnit={setPrecipUnit}
          onClose={() => setColorLabOpen(false)}
        />
      )}

      {authEnabled && authModalOpen && (
        <AuthModal initialMode={authModalMode} onClose={() => { setAuthModalOpen(false); setAuthModalMode('login') }} />
      )}
      {authEnabled && savePromptOpen && !user && (
        <SaveAccountPrompt
          onClose={() => setSavePromptOpen(false)}
          onCreateAccount={() => { setSavePromptOpen(false); setAuthModalMode('signup'); setAuthModalOpen(true) }}
          onSignIn={() => { setSavePromptOpen(false); setAuthModalMode('login'); setAuthModalOpen(true) }}
        />
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
