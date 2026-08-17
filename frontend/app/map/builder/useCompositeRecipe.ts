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
  type PwatUnit,
  type SubMode,
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
  apiLevelForSelection,
  apiVariableForSelection,
  levelForVariableChange,
  levelOptionsForVariable,
  shouldDefaultWindOverlay,
} from '../../../variableConfig'

export type TemperatureUnit = 'auto' | 'F' | 'C'

const CORE_CLIMO_STORAGE_KEY = 'pyre.preferCoreClimo'

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
  const [pwatUnit, setPwatUnit] = useState<PwatUnit>('in')
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>('auto')
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

  const apiVariable = apiVariableForSelection(variable, level, humidityType)
  const apiLevel = apiLevelForSelection(variable, level)
  const levelOptions = levelOptionsForVariable(variable, humidityType)
  const isClimo     = timeScale === 'climatology'
  const isMonthly   = timeScale === 'monthly'
  const isThreeHourly = timeScale === '3-hourly'
  const monthlyUnavailable = MONTHLY_UNAVAILABLE_API_VARIABLES.has(apiVariable)
  const rawOnlyVariable = RAW_ONLY_API_VARIABLES.has(apiVariable)
  // Wind maps style themselves (shaded/barbs/vectors/isotachs) — a separate
  // "wind overlay" on a wind map would draw the same data twice. The map mode
  // decides the glyph quantity (raw → actual wind, anomaly → anomaly wind, #47).
  const isWindVariable = apiVariable === 'wind_speed' || apiVariable === 'wind_10m'
  const isWindControlActive = isWindVariable || windMaster

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

  /** True when turning this layer off would leave a wind map with nothing drawn. */
  const isLastWindLayer = (layer: keyof typeof windLayersOn) =>
    isWindVariable && windLayersOn[layer] && windLayerCount === 1

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
    return {
      variable,
      level,
      humidityType: variable === 'humidity' ? humidityType : undefined,
      region,
      displayMode,
      climoSource,
      time: currentTimeRecipe(),
      wind: windStep
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

    if (recipe.variable) {
      setVariable(recipe.variable === 'rel_humidity' || recipe.variable === 'rel_humidity_2m' ? 'humidity' : recipe.variable)
    }
    if (recipe.level) setLevel(recipe.level)
    if (recipe.humidityType) setHumidityType(recipe.humidityType)
    else if (recipe.variable === 'rel_humidity' || recipe.variable === 'rel_humidity_2m') setHumidityType('relative')
    else if (recipe.variable === 'humidity') setHumidityType('specific')
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
    const recipeVariable =
      recipe.variable === 'rel_humidity' || recipe.variable === 'rel_humidity_2m'
        ? 'humidity'
        : recipe.variable ?? variable
    const recipeApiVariable = apiVariableForSelection(
      recipeVariable,
      recipe.level ?? level,
      recipe.humidityType ?? humidityType,
    )
    const recipeIsWindVariable = recipeApiVariable === 'wind_speed' || recipeApiVariable === 'wind_10m'
    if (recipe.wind) {
      // Legacy saved recipes may hold step '0'; state never holds a
      // sub-minimum density (#57).
      setWindStep(Number(recipe.wind.step) > 0 ? recipe.wind.step : '2')
      // Pre-#47 recipes stored the anomaly glyph choice in a separate field;
      // fold it into the single wind model (the map mode picks the quantity).
      const legacyAnomalyGlyph =
        recipe.wind.anomalyOverlay && recipe.wind.anomalyOverlay !== 'none'
          ? recipe.wind.anomalyOverlay
          : null
      setWindType(legacyAnomalyGlyph ?? recipe.wind.type)
      const glyphsOn = recipe.wind.on || Boolean(legacyAnomalyGlyph)
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
    // A 3-hourly map is compared against the normal for that hour, which is a
    // mean with no standard deviation, so there is nothing to divide by (#72).
    // Switching to 3-Hourly while Normalized is selected falls back to Anomaly.
    if (isThreeHourly && displayMode === 'normalized') setDisplayMode('anomaly')
    // Monthly obs composites are not wired for most surface/named-level
    // fields (MSLP is exempt — its monthly archive record is wired).
    if (monthlyUnavailable && timeScale === 'monthly') setTimeScale('3-hourly')
  }, [displayMode, rawOnlyVariable, monthlyUnavailable, timeScale, isThreeHourly])

  useEffect(() => {
    if (!levelOptions.some(opt => opt.value === level)) {
      setLevel(levelForVariableChange(variable, level, humidityType))
    }
  }, [humidityType, level, levelOptions, variable])

  useEffect(() => {
    if (shouldDefaultWindOverlay(apiVariable)) {
      setWindOn(true)
      setWindType('barbs')
    }
  }, [apiVariable])

  return {
    timeScale, setTimeScale,
    dateSubMode, setDateSubMode,
    monthSubMode, setMonthSubMode,
    date, setDate,
    startDate, setStartDate,
    endDate, setEndDate,
    hour, setHour,
    customDates, setCustomDates,
    month, setMonth,
    monthStart, setMonthStart,
    monthEnd, setMonthEnd,
    customMonths, setCustomMonths,
    climoMonth, setClimoMonth,
    variable, setVariable,
    humidityType, setHumidityType,
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
    temperatureUnit, setTemperatureUnit,
    fillMode, setFillMode,
    colorStep, setColorStep,
    climoSource, setClimoSource,
    preferCoreClimo, chooseCoreClimoPreference,
    apiVariable, apiLevel, levelOptions,
    isClimo, isMonthly, isThreeHourly,
    monthlyUnavailable, rawOnlyVariable, isWindVariable,
    isWindControlActive,
    isLastWindLayer,
    currentMapRecipe, applyRecipeToState,
  }
}

export type CompositeRecipeState = ReturnType<typeof useCompositeRecipe>
