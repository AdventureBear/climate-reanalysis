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
  type WindAnomalyOverlay,
  type WindOverlayType,
  type WindUnit,
} from '../mapRecipe'
import {
  MONTHLY_UNAVAILABLE_API_VARIABLES,
  RAW_ONLY_API_VARIABLES,
  apiLevelForSelection,
  apiVariableForSelection,
  levelOptionsForVariable,
  shouldDefaultWindOverlay,
} from '../variableConfig'

export type TemperatureUnit = 'auto' | 'F' | 'C'

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

  const [region,      setRegion]      = useState('CONUS')

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
  const [climoSource,  setClimoSource]  = useState<ClimoSource>('r2-monthly')

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
    level, setLevel,
    region, setRegion,
    displayMode, setDisplayMode,
    windOn, setWindOn,
    windStep, setWindStep,
    windType, setWindType,
    windAnomalyOverlay, setWindAnomalyOverlay,
    isotachsOn, setIsotachsOn,
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
    apiVariable, apiLevel, levelOptions,
    isClimo, isMonthly, isThreeHourly,
    monthlyUnavailable, rawOnlyVariable, isWindVariable, canUseWindAnomalyOverlay,
    currentMapRecipe, applyRecipeToState,
  }
}

export type CompositeRecipeState = ReturnType<typeof useCompositeRecipe>
