// All Composite Builder recipe state in one hook: time selection, variable/
// level, region, display mode, wind and overlay controls, units, and the
// conversions between that state and a typed MapRecipe. App (and, later,
// extracted panels) consume this instead of holding ~35 useState hooks inline.
import { useEffect, useState } from 'react'
import {
  type ClimoSource,
  type DisplayMode,
  type FillMode,
  type MapRecipe,
  type PrecipUnit,
  type PrecipWindow,
  type PwatUnit,
  type SubMode,
  type TempUnit,
  type TimeRecipe,
  type TimeScale,
  type WindOverlayType,
  type WindUnit,
  type IsotachInterval,
  AUTO_DENSITY,
} from '../../../mapRecipe'
import {
  MONTHLY_UNAVAILABLE_API_VARIABLES,
  RAW_ONLY_API_VARIABLES,
  type HumidityType,
  type RadiationDirection,
  type RadiationWaveband,
  type VorticityType,
  apiLevelForSelection,
  apiVariableForSelection,
  isWindUnitApiVariable,
  levelForVariableChange,
  levelOptionsForVariable,
  shouldDefaultWindOverlay,
} from '../../../variableConfig'

export type TemperatureUnit = TempUnit

const CORE_CLIMO_STORAGE_KEY = 'pyre.preferCoreClimo'
const PRECIP_WINDOW_PRESETS = new Set(['3', '6', '12', '24'])
const FAHRENHEIT_SURFACE_TEMP_REGIONS = new Set([
  'US',
  'AS',
  'BS',
  'BZ',
  'FM',
  'GU',
  'KY',
  'LR',
  'MH',
  'MP',
  'PR',
  'PW',
  'UM',
  'VI',
])

function browserRegion(): string | null {
  if (typeof navigator === 'undefined') return null
  const locale = navigator.languages?.[0] ?? navigator.language
  try {
    const region = new Intl.Locale(locale).region
    return region?.toUpperCase() ?? null
  } catch {
    const match = locale.match(/[-_]([A-Za-z]{2})\b/)
    return match?.[1].toUpperCase() ?? null
  }
}

function defaultSurfaceTemperatureUnit(): TemperatureUnit {
  const region = browserRegion()
  return region && FAHRENHEIT_SURFACE_TEMP_REGIONS.has(region) ? 'F' : 'C'
}

export function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
}

export function useCompositeRecipe() {
  const [timeScale,    setTimeScale]    = useState<TimeScale>('3-hourly')
  const [dateSubMode,  setDateSubMode]  = useState<SubMode>('single')
  const [monthSubMode, setMonthSubMode] = useState<SubMode>('single')

  const [date,        setDate]        = useState(defaultDate)
  const [startDate,   setStartDate]   = useState(defaultDate)
  const [endDate,     setEndDate]     = useState(defaultDate)
  const [startHour,   setStartHour]   = useState('21')
  const [hour,        setHour]        = useState('00')
  const [customDates, setCustomDates] = useState<string[]>([defaultDate()])

  const [month,        setMonth]        = useState(() => new Date().toISOString().slice(0, 7))
  const [monthStart,   setMonthStart]   = useState(() => new Date().toISOString().slice(0, 7))
  const [monthEnd,     setMonthEnd]     = useState(() => new Date().toISOString().slice(0, 7))
  const [customMonths, setCustomMonths] = useState<string[]>([new Date().toISOString().slice(0, 7)])

  const [climoMonth, setClimoMonth] = useState(() => new Date().toISOString().slice(5, 7))

  const [variable, setVariable] = useState('wind_speed')
  const [level,    setLevel]    = useState('850')
  const [humidityType, setHumidityType] = useState<HumidityType>('relative')
  const [vorticityType, setVorticityType] = useState<VorticityType>('relative')
  const [radiationWaveband, setRadiationWaveband] = useState<RadiationWaveband>('shortwave')
  const [radiationDirection, setRadiationDirection] = useState<RadiationDirection>('down')

  const [region,      setRegion]      = useState('CONUS')

  const [displayMode, setDisplayMode] = useState<DisplayMode>('raw')

  const [windOn,    setWindOn]    = useState(true)
  // Auto by default: the backend applies its calibrated density, so
  // retuning it later reaches every Auto map without editing recipes.
  const [windStep,  setWindStep]  = useState<string>(AUTO_DENSITY)
  const [windType,  setWindType]  = useState<WindOverlayType>('barbs')
  const [isotachsOn, setIsotachsOn] = useState(false)
  // 0 = auto: the backend picks the spacing from the level's wind scale.
  const [isotachInterval, setIsotachInterval] = useState<IsotachInterval | 0>(0)
  const [windShading, setWindShading] = useState(true)
  const [windMaster, setWindMaster] = useState(true)
  const [hlCenters, setHlCenters] = useState(false)
  const [contourOverlays, setContourOverlays] = useState<string[]>([])
  const [windUnit, setWindUnit] = useState<WindUnit>('kt')
  const [pwatUnit, setPwatUnitState] = useState<PwatUnit>('in')
  const [precipUnit, setPrecipUnitState] = useState<PrecipUnit>('in')
  const [precipWindow, setPrecipWindowState] = useState<PrecipWindow>('3')
  const [surfaceTemperatureUnit, setSurfaceTemperatureUnit] = useState<TemperatureUnit>(defaultSurfaceTemperatureUnit)
  const [elevatedTemperatureUnit, setElevatedTemperatureUnit] = useState<TemperatureUnit>('C')
  const [fillMode, setFillMode] = useState<FillMode>('contours')
  const [colorStep, setColorStep] = useState('1')
  // Baseline preference (#127). R2 monthly is the default, matching every map
  // and share link made before the CORe option was reachable. Turning the
  // preference on asks for CORe; climo_policy substitutes R2 wherever CORe has
  // no baseline (surface variables, and all daily and 3-hourly maps), so the
  // preference is a no-op outside monthly pressure-level maps.
  const [preferCoreClimo, setPreferCoreClimo] = useState(false)
  const climoSource: ClimoSource = preferCoreClimo ? 'monthly-pgb' : 'r2-monthly'
  // Loading a recipe (share link, saved map) sets the source without changing
  // the stored preference: that map's baseline is part of the map, not a
  // standing choice.
  const setClimoSource = (source: ClimoSource) => setPreferCoreClimo(source === 'monthly-pgb')

  function setPrecipUnit(next: PrecipUnit) {
    setPrecipUnitState(next)
    setPwatUnitState(next)
  }

  function setPwatUnit(next: PwatUnit) {
    setPrecipUnitState(next)
    setPwatUnitState(next)
  }

  // Restored after mount rather than in the initializer: localStorage does not
  // exist during the static build, so reading it there would mismatch hydration.
  useEffect(() => {
    try {
      setPreferCoreClimo(localStorage.getItem(CORE_CLIMO_STORAGE_KEY) === '1')
    } catch { /* private browsing or storage disabled: keep the default */ }
  }, [])

  /** The settings toggle. Persists, unlike loading a recipe. */
  function chooseCoreClimoPreference(next: boolean) {
    setPreferCoreClimo(next)
    try {
      localStorage.setItem(CORE_CLIMO_STORAGE_KEY, next ? '1' : '0')
    } catch { /* nothing to do if storage is unavailable */ }
  }

  const apiVariable = apiVariableForSelection(variable, level, humidityType, radiationWaveband, radiationDirection, vorticityType)
  const apiLevel = apiLevelForSelection(variable, level)
  const levelOptions = levelOptionsForVariable(variable, humidityType)
  const isClimo     = timeScale === 'climatology'
  const isMonthly   = timeScale === 'monthly'
  const isThreeHourly = timeScale === '3-hourly'
  const monthlyUnavailable = MONTHLY_UNAVAILABLE_API_VARIABLES.has(apiVariable)
  const rawOnlyVariable = RAW_ONLY_API_VARIABLES.has(apiVariable)
  const precipTotalVariable = apiVariable === 'precip_total'
  const precipTotalDailyWindow = precipTotalVariable && precipWindow === '24'
  const isBlankMap = apiVariable === 'blank_map'
  // Wind maps style themselves (shaded/barbs/vectors/isotachs) — a separate
  // "wind overlay" on a wind map would draw the same data twice. The map mode
  // decides the glyph quantity (raw → actual wind, anomaly → anomaly wind, #47).
  const isWindVariable = apiVariable === 'wind_speed' || apiVariable === 'wind_10m'
  const isWindControlActive = !isBlankMap && (isWindVariable || windMaster)

  // A wind map has to draw at least one wind layer, or the backend returns 422
  // and the user gets an error instead of a map. Which layers a mode actually
  // offers differs: an anomaly map has no isotachs (#45) and its shading switch
  // is disabled, so glyphs can be the only layer the user can reach. Derived
  // once here rather than restated in each control: the guard used to be
  // written out per switch and gated on displayMode === 'raw', which made it
  // inert in exactly the mode with the fewest layers available.
  const windLayersOn = {
    shading: isWindVariable && windShading,
    glyphs: isWindControlActive && windOn,
    isotachs: isWindControlActive && isotachsOn && displayMode === 'raw',
  }
  const windLayerCount = Object.values(windLayersOn).filter(Boolean).length

  function shiftDateHour(dateValue: string, hourValue: string, deltaHours: number) {
    const parsed = new Date(`${dateValue}T${hourValue}:00:00Z`)
    if (Number.isNaN(parsed.valueOf())) return null
    parsed.setUTCHours(parsed.getUTCHours() + deltaHours)
    return {
      date: parsed.toISOString().slice(0, 10),
      hour: parsed.toISOString().slice(11, 13),
    }
  }

  function applyPrecipWindowRange(windowHours: PrecipWindow) {
    const hours = Number(windowHours)
    if (!Number.isFinite(hours)) return
    const end = endDate || date
    const start = shiftDateHour(end, hour, -hours)
    if (!start) return
    setStartDate(start.date)
    setStartHour(start.hour)
    setEndDate(end)
    setDate(end)
  }

  function setPrecipWindow(next: PrecipWindow) {
    setPrecipWindowState(next)
    if (apiVariableForSelection(variable, level, humidityType, radiationWaveband, radiationDirection) === 'precip_total') {
      setTimeScale(next === '24' ? 'daily' : '3-hourly')
      if (dateSubMode === 'range') applyPrecipWindowRange(next)
    }
  }

  function chooseTimeScale(next: TimeScale) {
    setTimeScale(next)
    if (apiVariableForSelection(variable, level, humidityType, radiationWaveband, radiationDirection) === 'precip_total' && next === 'daily') {
      setPrecipWindowState('24')
      if (dateSubMode === 'range') applyPrecipWindowRange('24')
    }
    if (apiVariableForSelection(variable, level, humidityType, radiationWaveband, radiationDirection) === 'precip_total' && next === '3-hourly') {
      const nextWindow = precipWindow === '24' || !PRECIP_WINDOW_PRESETS.has(precipWindow) ? '12' : precipWindow
      setPrecipWindowState(nextWindow)
      if (dateSubMode === 'range') applyPrecipWindowRange(nextWindow)
    }
  }

  function precipRangeWindowHours() {
    const start = new Date(`${startDate}T${startHour}:00:00Z`)
    const end = new Date(`${endDate}T${hour}:00:00Z`)
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return null
    const rangeHours = (end.valueOf() - start.valueOf()) / 3_600_000
    return Number.isInteger(rangeHours) && rangeHours > 0 && rangeHours % 3 === 0 ? String(rangeHours) : null
  }

  const precipWindowSelection =
    precipTotalVariable && dateSubMode === 'range'
      ? (() => {
          const rangeWindow = precipRangeWindowHours()
          return rangeWindow && PRECIP_WINDOW_PRESETS.has(rangeWindow) ? rangeWindow : '__custom__'
        })()
      : precipWindow

  /** True when turning this layer off would leave a wind map with nothing drawn. */
  const isLastWindLayer = (layer: keyof typeof windLayersOn) =>
    isWindVariable && windLayersOn[layer] && windLayerCount === 1

  function currentTimeRecipe(): TimeRecipe {
    if (precipTotalVariable) {
      const scale = timeScale === 'daily' ? 'daily' : '3-hourly'
      if (dateSubMode === 'single') return { scale, subMode: 'single', date, hour }
      if (dateSubMode === 'range') return { scale, subMode: 'range', startDate, endDate, startHour, hour }
      return { scale, subMode: 'list', customDates, hour }
    }
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
      if (dateSubMode === 'range') return { scale: '3-hourly', subMode: 'range', startDate, endDate, startHour, hour }
      return { scale: '3-hourly', subMode: 'list', customDates, hour }
    }
    if (dateSubMode === 'single') return { scale: 'daily', subMode: 'single', date }
    if (dateSubMode === 'range') return { scale: 'daily', subMode: 'range', startDate, endDate }
    return { scale: 'daily', subMode: 'list', customDates }
  }

  function currentMapRecipe(): MapRecipe {
    return {
      variable,
      level,
      humidityType: variable === 'humidity' ? humidityType : undefined,
      vorticityType: variable === 'vorticity' ? vorticityType : undefined,
      radiationWaveband: variable === 'radiation' ? radiationWaveband : undefined,
      radiationDirection: variable === 'radiation' ? radiationDirection : undefined,
      region,
      displayMode,
      climoSource,
      time: currentTimeRecipe(),
      wind: !isBlankMap && windStep
        ? {
            on: isWindControlActive && windOn,
            step: windStep,
            type: windType,
            // Isotachs contour the raw wind field and are not drawn on
            // anomaly maps (#45), so they never enter the recipe there.
            isotachs: isWindControlActive && isotachsOn && displayMode === 'raw',
            isotachInterval: isotachInterval || undefined,
            // Master off = default rendering: wind maps keep their shading.
            shading: isWindControlActive ? windShading : true,
          }
        : undefined,
      windUnit,
      pwatUnit,
      precipUnit,
      precipWindow: apiVariable === 'precip_total' ? precipWindow : undefined,
      fillMode,
      tempUnit: apiVariable === 'temp_2m'
        ? surfaceTemperatureUnit
        : apiVariable === 'temp'
          ? elevatedTemperatureUnit
          : undefined,
      centers: !isBlankMap && hlCenters || undefined,
      contours: !isBlankMap && contourOverlays.length ? contourOverlays : undefined,
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
          if ('hour' in time && time.hour) setHour(time.hour)
          if (time.subMode === 'single') setDate(time.date)
          if (time.subMode === 'range') {
            setStartDate(time.startDate)
            setEndDate(time.endDate)
            if (time.startHour) setStartHour(time.startHour)
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
            if (time.startHour) setStartHour(time.startHour)
          }
          if (time.subMode === 'list') setCustomDates(time.customDates)
          return
      }
    }

    const normalizedRecipeVariable =
      recipe.variable === 'rel_humidity' || recipe.variable === 'rel_humidity_2m'
        ? 'humidity'
        : recipe.variable === 'olr'
          ? 'radiation'
          : recipe.variable === 'absv' || recipe.variable === 'rel_vorticity'
            ? 'vorticity'
            : recipe.variable
    if (recipe.variable) setVariable(normalizedRecipeVariable ?? recipe.variable)
    if (recipe.level) setLevel(recipe.variable === 'olr' ? 'toa_radiation' : recipe.level)
    if (recipe.humidityType) setHumidityType(recipe.humidityType)
    else if (recipe.variable === 'rel_humidity' || recipe.variable === 'rel_humidity_2m') setHumidityType('relative')
    else if (recipe.variable === 'humidity') setHumidityType('specific')
    if (recipe.vorticityType) setVorticityType(recipe.vorticityType)
    else if (recipe.variable === 'absv') setVorticityType('absolute')
    else if (recipe.variable === 'rel_vorticity') setVorticityType('relative')
    if (recipe.radiationWaveband) setRadiationWaveband(recipe.radiationWaveband)
    if (recipe.radiationDirection) setRadiationDirection(recipe.radiationDirection)
    if (recipe.variable === 'olr') {
      setRadiationWaveband('longwave')
      setRadiationDirection('up')
    }
    if (recipe.region) setRegion(recipe.region)
    if (recipe.displayMode) setDisplayMode(recipe.displayMode)
    if (recipe.climoSource) setClimoSource(recipe.climoSource)
    if (recipe.windUnit) setWindUnit(recipe.windUnit)
    if (recipe.pwatUnit) setPwatUnit(recipe.pwatUnit)
    if (recipe.precipUnit) setPrecipUnit(recipe.precipUnit)
    if (recipe.precipWindow) setPrecipWindowState(recipe.precipWindow)
    if (recipe.fillMode) setFillMode(recipe.fillMode)
    setHlCenters(Boolean(recipe.centers))
    setContourOverlays(recipe.contours ?? [])
    if (recipe.colorStep) setColorStep(recipe.colorStep)
    if (recipe.time) applyTimeRecipe(recipe.time)
    const recipeVariable =
      recipe.variable === 'rel_humidity' || recipe.variable === 'rel_humidity_2m'
        ? 'humidity'
        : recipe.variable === 'olr'
          ? 'radiation'
          : recipe.variable === 'absv' || recipe.variable === 'rel_vorticity'
            ? 'vorticity'
            : recipe.variable ?? variable
    const recipeApiVariable = apiVariableForSelection(
      recipeVariable,
      recipe.variable === 'olr' ? 'toa_radiation' : recipe.level ?? level,
      recipe.humidityType ?? humidityType,
      recipe.radiationWaveband ?? radiationWaveband,
      recipe.radiationDirection ?? radiationDirection,
      recipe.vorticityType ?? (recipe.variable === 'absv' ? 'absolute' : recipe.variable === 'rel_vorticity' ? 'relative' : vorticityType),
    )
    const recipeIsWindVariable = recipeApiVariable === 'wind_speed' || recipeApiVariable === 'wind_10m'
    if (recipe.tempUnit) {
      if (recipeApiVariable === 'temp_2m') setSurfaceTemperatureUnit(recipe.tempUnit)
      if (recipeApiVariable === 'temp') setElevatedTemperatureUnit(recipe.tempUnit)
    }
    if (recipe.wind) {
      // Legacy saved recipes may hold step '0'; state never holds a
      // sub-minimum density (#57).
      setWindStep(Number(recipe.wind.step) > 0 ? recipe.wind.step : '2')
      setWindType(recipe.wind.type)
      const glyphsOn = recipe.wind.on
      setWindOn(glyphsOn)
      setIsotachsOn(Boolean(recipe.wind.isotachs))
      setIsotachInterval(recipe.wind.isotachInterval ?? 0)
      setWindShading(recipe.wind.shading !== false)
      setWindMaster(recipeIsWindVariable || glyphsOn || Boolean(recipe.wind.isotachs) || recipe.wind.shading === false)
    } else if (recipeIsWindVariable) {
      setWindOn(false)
      setIsotachsOn(false)
      setIsotachInterval(0)
      setWindShading(true)
      setWindMaster(true)
    }
  }

  useEffect(() => {
    if (rawOnlyVariable) {
      if (displayMode !== 'raw') setDisplayMode('raw')
      if (timeScale === 'climatology') setTimeScale('3-hourly')
    }
    // PWAT uses the R2 daily 15-day mean/std path; other 3-hourly normalized
    // maps still lack a usable sigma path.
    if (isThreeHourly && displayMode === 'normalized' && apiVariable !== 'precipitable_water') setDisplayMode('anomaly')
    // Monthly obs composites are not wired for most surface/named-level
    // fields (MSLP is exempt — its monthly archive record is wired).
    if (monthlyUnavailable && timeScale === 'monthly') setTimeScale('3-hourly')
    if (variable === 'radiation' && level === 'toa_radiation' && radiationWaveband === 'longwave' && radiationDirection === 'down') {
      setRadiationDirection('up')
    }
  }, [
    displayMode,
    rawOnlyVariable,
    monthlyUnavailable,
    timeScale,
    isThreeHourly,
    apiVariable,
    variable,
    level,
    radiationWaveband,
    radiationDirection,
  ])

  useEffect(() => {
    if (!levelOptions.some(opt => opt.value === level)) {
      setLevel(levelForVariableChange(variable, level, humidityType))
    }
  }, [humidityType, level, levelOptions, variable])

  useEffect(() => {
    if (!precipTotalVariable || dateSubMode === 'range') return
    if (timeScale === 'daily' && precipWindow !== '24') {
      setPrecipWindowState('24')
      return
    }
    if (timeScale === '3-hourly' && (precipWindow === '24' || !PRECIP_WINDOW_PRESETS.has(precipWindow))) {
      setPrecipWindowState('12')
    }
  }, [precipTotalVariable, dateSubMode, timeScale, precipWindow])

  useEffect(() => {
    if (!precipTotalVariable || dateSubMode !== 'range') return
    const start = new Date(`${startDate}T${startHour}:00:00Z`)
    const end = new Date(`${endDate}T${hour}:00:00Z`)
    if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return
    const rangeHours = (end.valueOf() - start.valueOf()) / 3_600_000
    const next = Number.isInteger(rangeHours) && rangeHours > 0 && rangeHours % 3 === 0 ? String(rangeHours) : null
    if (next) {
      if (PRECIP_WINDOW_PRESETS.has(next) && next !== precipWindow) setPrecipWindowState(next)
      return
    }

    const fallbackHours = Number(precipWindow)
    if (!Number.isInteger(fallbackHours) || fallbackHours <= 0 || fallbackHours % 3 !== 0) return
    const fallbackEnd = endDate || date
    const fallbackStart = new Date(`${fallbackEnd}T${hour}:00:00Z`)
    if (Number.isNaN(fallbackStart.valueOf())) return
    fallbackStart.setUTCHours(fallbackStart.getUTCHours() - fallbackHours)
    setStartDate(fallbackStart.toISOString().slice(0, 10))
    setStartHour(fallbackStart.toISOString().slice(11, 13))
    setEndDate(fallbackEnd)
    setDate(fallbackEnd)
  }, [precipTotalVariable, dateSubMode, startDate, startHour, endDate, hour, precipWindow, date])

  useEffect(() => {
    if (shouldDefaultWindOverlay(apiVariable)) {
      setWindOn(true)
      setWindType('barbs')
    }
  }, [apiVariable])

  return {
    timeScale, setTimeScale: chooseTimeScale,
    dateSubMode, setDateSubMode,
    monthSubMode, setMonthSubMode,
    date, setDate,
    startDate, setStartDate,
    endDate, setEndDate,
    startHour, setStartHour,
    hour, setHour,
    customDates, setCustomDates,
    month, setMonth,
    monthStart, setMonthStart,
    monthEnd, setMonthEnd,
    customMonths, setCustomMonths,
    climoMonth, setClimoMonth,
    variable, setVariable,
    humidityType, setHumidityType,
    vorticityType, setVorticityType,
    radiationWaveband, setRadiationWaveband,
    radiationDirection, setRadiationDirection,
    level, setLevel,
    region, setRegion,
    displayMode, setDisplayMode,
    windOn, setWindOn,
    windStep, setWindStep,
    windType, setWindType,
    isotachsOn, setIsotachsOn,
    isotachInterval, setIsotachInterval,
    windShading, setWindShading,
    windMaster, setWindMaster,
    hlCenters, setHlCenters,
    contourOverlays, setContourOverlays,
    windUnit, setWindUnit,
    pwatUnit, setPwatUnit,
    precipUnit, setPrecipUnit,
    precipWindow, setPrecipWindow,
    precipWindowSelection,
    surfaceTemperatureUnit, setSurfaceTemperatureUnit,
    elevatedTemperatureUnit, setElevatedTemperatureUnit,
    fillMode, setFillMode,
    colorStep, setColorStep,
    climoSource, setClimoSource,
    preferCoreClimo, chooseCoreClimoPreference,
    apiVariable, apiLevel, levelOptions,
    isClimo, isMonthly, isThreeHourly,
    monthlyUnavailable, rawOnlyVariable, precipTotalVariable, precipTotalDailyWindow, isWindVariable,
    isBlankMap,
    isWindUnitVariable: isWindUnitApiVariable(apiVariable),
    isWindControlActive,
    isLastWindLayer,
    currentMapRecipe, applyRecipeToState,
  }
}

export type CompositeRecipeState = ReturnType<typeof useCompositeRecipe>
