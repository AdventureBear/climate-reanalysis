import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart3, Settings, X, Plus, Minus, ChevronRight, ChevronDown, PanelLeft, LayoutGrid, SlidersHorizontal, GalleryHorizontalEnd, Menu, Save, FolderOpen, LogIn, LogOut, User } from 'lucide-react'
import { useAuth } from './auth/authContext'
import { AuthModal } from './auth/AuthModal'
import { LibraryModal } from './projects/LibraryModal'
import { saveMap, type SavedMap } from './lib/library'
import { SaveMapModal, type SaveTarget } from './projects/SaveMapModal'
import { signedUrl } from './lib/storage'
import { blobFromObjectUrl } from './lib/images'
import { suggestedMapName } from './mapName'
import { SiteFooter } from './SiteFooter'
import { dateRange, mapRecipeFromUrl, mapRecipeToParams, monthRange, type ClimoSource, type DisplayMode, type FillMode, type MapRecipe, type PwatUnit, type SubMode, type TimeRecipe, type TimeScale, type WindAnomalyOverlay, type WindOverlayType, type WindUnit } from './mapRecipe'
import AdminStatsPanel from './admin/AdminStatsPanel'
import { REGION_THUMBNAILS } from './regionThumbnails'
import { normalizeColorStep } from './sharedOptions'
import {
  MONTHLY_UNAVAILABLE_API_VARIABLES,
  RAW_ONLY_API_VARIABLES,
  SURFACE_LEVELS,
  VARIABLES,
  apiLevelForSelection,
  apiVariableForSelection,
  levelOptionsForVariable,
  shouldDefaultWindOverlay,
} from './variableConfig'
import { REGION_SECTIONS, getRegionLabel } from './builder/regionCatalog'
import { RegionThumbnail } from './builder/RegionThumbnail'
import ColorLabPanel from './colorLab/ColorLabPanel'
import { useScaleDesigner } from './colorLab/useScaleDesigner'
import { CardRow, HourStepper, Label, Section, SelectField, TabStrip, ToggleButton, VariableDisplayControl } from './ui/controls'

// Same-origin by default so a missing VITE_API_URL doesn't produce
// requests to literally "undefined/api/..." in production builds.
const API_BASE = import.meta.env.VITE_API_URL ?? ''
const SAVE_TARGET_STORAGE_KEY = 'pyre.saveTarget'

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

type TemperatureUnit = 'auto' | 'F' | 'C'

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
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
  const [isotachsOn, setIsotachsOn] = useState(false)
  const [windShading, setWindShading] = useState(true)
  const [windMaster, setWindMaster] = useState(true)
  const [hlCenters, setHlCenters] = useState(false)
  const [contourOverlays, setContourOverlays] = useState<string[]>([])
  const [windUnit, setWindUnit] = useState<WindUnit>('kt')
  const [pwatUnit, setPwatUnit] = useState<PwatUnit>('in')
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>('auto')
  const [fillMode, setFillMode] = useState<FillMode>('contours')
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

  const [layoutMode, setLayoutMode] = useState<'horizontal' | 'vertical'>('horizontal')
  const isVertical  = layoutMode === 'vertical'

  const { enabled: authEnabled, user, isAdmin, signOut } = useAuth()
  // Color Lab is admin-only tooling. With accounts enabled it needs the
  // profile admin flag; without accounts (local dev / dark launch) the /admin
  // route stays available as a dev escape hatch.
  const colorLabVisible = authEnabled ? isAdmin : true
  const colorLabAccess = adminMode && colorLabVisible
  const scaleDesigner = useScaleDesigner({ enabled: colorLabAccess, colorStep, windUnit, pwatUnit })
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [adminStatsOpen, setAdminStatsOpen] = useState(false)
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
  const monthlyUnavailable = MONTHLY_UNAVAILABLE_API_VARIABLES.has(apiVariable)
  const rawOnlyVariable = RAW_ONLY_API_VARIABLES.has(apiVariable)
  // Wind maps style themselves (shaded/barbs/vectors/isotachs) — a separate
  // "wind overlay" on a wind map would draw the same data twice.
  const isWindVariable = apiVariable === 'wind_speed' || apiVariable === 'wind_10m'
  const canUseWindAnomalyOverlay = apiVariable === 'wind_speed' && !isClimo && displayMode === 'anomaly'

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
            on: activeWindAnomaly === 'none' && windMaster && windOn,
            step: windStep,
            type: windType,
            anomalyOverlay: activeWindAnomaly,
            isotachs: activeWindAnomaly === 'none' && windMaster && isotachsOn,
            // Master off = default rendering: wind maps keep their shading.
            shading: windMaster ? windShading : true,
          }
        : undefined,
      windUnit,
      pwatUnit,
      fillMode,
      tempUnit: temperatureUnit === 'auto' ? undefined : temperatureUnit,
      centers: hlCenters || undefined,
      contours: contourOverlays.length ? contourOverlays : undefined,
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
    if (recipe.fillMode) setFillMode(recipe.fillMode)
    if (recipe.tempUnit) setTemperatureUnit(recipe.tempUnit)
    setHlCenters(Boolean(recipe.centers))
    setContourOverlays(recipe.contours ?? [])
    if (recipe.colorStep) setColorStep(recipe.colorStep)
    if (recipe.time) applyTimeRecipe(recipe.time)
    if (recipe.wind) {
      setWindStep(recipe.wind.step)
      setWindType(recipe.wind.type)
      setWindOn(recipe.wind.on)
      setWindAnomalyOverlay(recipe.wind.anomalyOverlay)
      setIsotachsOn(Boolean(recipe.wind.isotachs))
      setWindShading(recipe.wind.shading !== false)
      setWindMaster(recipe.wind.on || Boolean(recipe.wind.isotachs) || recipe.wind.shading === false)
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
    // Monthly obs composites are not wired for most surface/named-level
    // fields (MSLP is exempt — its monthly archive record is wired).
    if (monthlyUnavailable && timeScale === 'monthly') setTimeScale('3-hourly')
  }, [displayMode, rawOnlyVariable, monthlyUnavailable, timeScale])

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

  function openColorLab() {
    scaleDesigner.seedFrom(apiVariable, apiLevel, isClimo ? 'raw' : displayMode)
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
    scaleDesigner.applyScaleToParams(params, {
      apiVariable,
      apiLevel,
      renderMode: isClimo ? 'raw' : displayMode,
      safeColorStep: normalizeColorStep(colorStep),
    })

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
          { value: 'monthly',     label: 'Monthly', disabled: monthlyUnavailable },
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
                        {isAdmin && (
                          <button type="button" onClick={() => { setAccountMenuOpen(false); setAdminStatsOpen(true) }}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <BarChart3 size={14} /> Admin Stats
                          </button>
                        )}
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
                  <VariableDisplayControl label="Temperature Units">
                    <TabStrip
                      options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'F', label: '°F' },
                        { value: 'C', label: '°C' },
                      ]}
                      value={temperatureUnit}
                      onChange={v => setTemperatureUnit(v as TemperatureUnit)}
                      fullWidth
                    />
                  </VariableDisplayControl>
                )}
                {variable === 'pressure' && (
                  <VariableDisplayControl label="Pressure Display">
                    <TabStrip
                      options={[
                        { value: 'contours', label: 'Contoured' },
                        { value: 'shaded', label: 'Shaded' },
                      ]}
                      value={fillMode}
                      onChange={v => setFillMode(v as FillMode)}
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
                  <VariableDisplayControl label="Height Display">
                    <TabStrip
                      options={[
                        { value: 'contours', label: 'Contoured' },
                        { value: 'shaded', label: 'Shaded' },
                      ]}
                      value={fillMode}
                      onChange={v => setFillMode(v as FillMode)}
                      fullWidth
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
            {/* WIND master switch gates all wind layers (off = no wind fetches;
                wind-variable maps keep their intrinsic shading). */}
            <div className={`flex flex-col gap-1 pt-2 border-t border-slate-700/40 transition-opacity ${canUseWindAnomalyOverlay && windAnomalyOverlay !== 'none' ? 'opacity-30 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-2">
                <Label>Wind</Label>
                <button type="button" role="switch" aria-checked={windMaster}
                  onClick={() => setWindMaster(o => !o)}
                  className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors cursor-pointer ${windMaster ? 'bg-sky-600' : 'bg-slate-600'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${windMaster ? 'translate-x-3' : 'translate-x-0'}`} />
                </button>
                <div className={`ml-auto flex items-center gap-1.5 transition-opacity ${windMaster && windOn ? '' : 'opacity-30 pointer-events-none'}`}>
                  <Label>Density</Label>
                  <input type="number" min={1} max={20} value={windStep}
                    onChange={e => setWindStep(e.target.value)}
                    className="input w-14 text-center px-1" />
                </div>
              </div>
              <div className={`flex flex-col gap-1 transition-opacity ${windMaster ? '' : 'opacity-30 pointer-events-none'}`}>
                <div className="grid grid-cols-3 gap-1">
                  <ToggleButton
                    active={isWindVariable && windShading}
                    disabled={!isWindVariable || displayMode !== 'raw'}
                    onClick={() => {
                      if (windShading && !isotachsOn && !windOn) return
                      setWindShading(o => !o)
                    }}
                  >
                    Shading
                  </ToggleButton>
                  {(['barbs', 'vectors'] as const).map(t => (
                    <ToggleButton
                      key={t}
                      active={windOn && windType === t}
                      onClick={() => {
                        if (windOn && windType === t) {
                          if (isWindVariable && displayMode === 'raw' && !windShading && !isotachsOn) return
                          setWindOn(false)
                          return
                        }
                        setWindOn(true)
                        setWindType(t)
                        setWindAnomalyOverlay('none')
                      }}
                    >
                      {t === 'barbs' ? 'Barbs' : 'Vectors'}
                    </ToggleButton>
                  ))}
                </div>
                <div className="grid grid-cols-1">
                  <ToggleButton
                    active={isotachsOn}
                    onClick={() => {
                      if (isotachsOn && isWindVariable && displayMode === 'raw' && !windShading && !windOn) return
                      setIsotachsOn(o => !o)
                    }}
                  >
                    Isotachs
                  </ToggleButton>
                </div>
              </div>
            </div>
              <VariableDisplayControl label="Contours">
                <div className="grid grid-cols-2 gap-1">
                  <ToggleButton active={hlCenters} onClick={() => setHlCenters(o => !o)}>H/L Centers</ToggleButton>
                  {([
                    { key: 'pressure', label: 'Pressure', redundant: apiVariable === 'surface_pressure' },
                    { key: 'height', label: 'Height', redundant: apiVariable === 'height' },
                    { key: 'temp', label: 'Temp', redundant: apiVariable === 'temp' || apiVariable === 'temp_2m' },
                  ] as const).map(({ key, label, redundant }) => (
                    <ToggleButton
                      key={key}
                      active={contourOverlays.includes(key)}
                      disabled={redundant}
                      onClick={() => setContourOverlays(prev =>
                        prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])}
                    >
                      {label}
                    </ToggleButton>
                  ))}
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
      {authEnabled && adminStatsOpen && isAdmin && <AdminStatsPanel onClose={() => setAdminStatsOpen(false)} />}
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
