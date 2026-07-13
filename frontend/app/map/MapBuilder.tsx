'use client'

import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Settings, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../auth/authContext'
import { AuthModal } from '../auth/AuthModal'
import { LibraryModal } from './projects/LibraryModal'
import { saveMap, type SavedMap } from '../../lib/library'
import { SaveMapModal, type SaveTarget } from './projects/SaveMapModal'
import { signedUrl } from '../../lib/storage'
import { blobFromObjectUrl } from '../../lib/images'
import { suggestedMapName } from './mapName'
import { mapRecipeFromUrl, mapRecipeToParams, type MapRecipe } from '../../mapRecipe'
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
    apiVariable, apiLevel, isClimo,
    currentMapRecipe, applyRecipeToState,
  } = recipe

  const [regionsOpen, setRegionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [colorLabOpen, setColorLabOpen] = useState(false)

  const { mapSrc, loading, error, setError, generateFromParams, showImage } = useMapGeneration()

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const isVertical  = layoutMode === 'vertical'

  const { enabled: authEnabled, user, isAdmin } = useAuth()
  // Color Lab is admin-only tooling. With accounts enabled it needs the
  // profile admin flag; without accounts (local dev / dark launch) the /admin
  // route stays available as a dev escape hatch.
  const colorLabVisible = authEnabled ? isAdmin : true
  // Color Lab: admins via profiles.is_admin; always on in local no-accounts
  // dev. (The old /admin escape-hatch route is gone.)
  const colorLabAccess = colorLabVisible
  const scaleDesigner = useScaleDesigner({ enabled: colorLabAccess, colorStep, windUnit, pwatUnit })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  // Last save destination, remembered across saves (and reloads) so saving
  // repeatedly into the same project/folder is a single confirm.
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(() => {
    try { return JSON.parse(localStorage.getItem(SAVE_TARGET_STORAGE_KEY) ?? 'null') } catch { return null }
  })

  // URL → state synchronization. Runs for deep links and browser back/forward;
  // URL updates made by handleGenerate / library-load are skipped via the ref.
  const selfUpdatedParamsRef = useRef<string | null>(null)

  useEffect(() => {
    // Read the query string directly (no useSearchParams): the hook forces a
    // Suspense/CSR bailout on a statically exported page. Deep links apply on
    // mount; popstate covers back/forward.
    const applyFromLocation = () => {
      const params = new URLSearchParams(window.location.search)
      const paramsString = params.toString()
      if (paramsString === selfUpdatedParamsRef.current) return
      selfUpdatedParamsRef.current = paramsString

      const recipe = mapRecipeFromUrl(params)
      if (!recipe) return
      applyRecipeToState(recipe)

      // Shared/deep-linked URLs render immediately instead of showing an empty
      // panel until the user clicks Generate.
      const recipeParams = mapRecipeToParams(recipe)
      if (recipeParams.ok) void generateFromParams(recipeParams.params)
    }
    applyFromLocation()
    window.addEventListener('popstate', applyFromLocation)
    return () => window.removeEventListener('popstate', applyFromLocation)
    // Recipe/generation helpers are recreated every render by their hooks; this
    // effect must register once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openColorLab() {
    scaleDesigner.seedFrom(apiVariable, apiLevel, isClimo ? 'raw' : displayMode)
    setColorLabOpen(true)
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

  // -- Save / load library maps -------------------------------------------------
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
    showImage(url)
    const recipeParams = mapRecipeToParams(recipe)
    if (recipeParams.ok) {
      selfUpdatedParamsRef.current = new URLSearchParams(recipeParams.params).toString()
      window.history.replaceState(null, '', `?${new URLSearchParams(recipeParams.params).toString()}`)
    }
    setError(null)
    setLibraryOpen(false)
  }


  // -- Render --------------------------------------------------------------------
  return (
    <div className="flex flex-1 flex-col bg-slate-950">
      {/* Map toolbar: app-level controls, owned by this page (site navigation
          lives in the global header). Collapses to the Time Scale card on mobile. */}
      <div className="hidden md:flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-2">
        <TimeScaleControls recipe={recipe} header />
        <div className="ml-auto flex items-center gap-2">
          {authEnabled && user && (
            <button type="button" onClick={() => setLibraryOpen(true)}
              className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors">
              <FolderOpen size={14} /> My Maps
            </button>
          )}
          {colorLabAccess && (
            <button type="button" onClick={openColorLab}
              className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors">
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
          ? 'w-72 shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
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

          <AnalysisPanel recipe={recipe} loading={loading} />
        </div>

        {/* -- Advanced composition panels ----------------------------------- */}
        <div className={isVertical
          ? 'w-72 shrink-0 overflow-y-auto border-r border-slate-700/50 p-3 flex flex-col gap-3'
          : 'grid grid-cols-1 lg:grid-cols-2 gap-3'}>
          <OverlaysPanel recipe={recipe} />
          <PanelsSection />
        </div>

        {/* -- Map panel ----------------------------------------------------- */}
        <MapPanel mapSrc={mapSrc} error={error} loading={loading} isVertical={isVertical}
          onSave={authEnabled ? handleSaveMap : undefined} saving={saving} />
      </form>

      <RegionsModal
        open={regionsOpen}
        region={region}
        onSelect={regionKey => { setRegion(regionKey); setRegionsOpen(false) }}
        onClose={() => setRegionsOpen(false)}
      />

      {settingsOpen && (
        <SettingsDrawer isVertical={isVertical} setLayoutMode={setLayoutMode} onClose={() => setSettingsOpen(false)} />
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
          onClose={() => setColorLabOpen(false)}
        />
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
