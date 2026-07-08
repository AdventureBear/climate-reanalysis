import { type DisplayMode, type MapRecipe, type TimeRecipe } from './mapRecipe'
import { SURFACE_LEVELS, VARIABLES, levelOptionsForVariable } from './variableConfig'

// Builds a filename-safe suggested name for a saved map from the same
// information shown in the rendered map title: level, variable, composite type
// (raw/anomaly/normalized), region, and the selected date / range. Used to
// pre-fill the save-map modal. Purely derived from the recipe — no network or
// state.
//
// Examples:
//   850mb_wind_speed_anomaly_conus_2024-06-15_00z
//   surface_2m_temperature_northeast_2024-06-01_to_2024-06-10
//   500mb_geopotential_height_normalized_anomaly_europe_jun-2024

const MODE_LABEL: Record<DisplayMode, string> = {
  raw: '',
  anomaly: 'anomaly',
  normalized: 'normalized anomaly',
}

const MONTH_NAMES = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

// Lowercase and collapse anything that isn't filename-friendly into "_".
// Keeps "-" so ISO dates ("2024-06-15") survive intact.
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9-]+/g, '_').replace(/^_+|_+$/g, '')
}

function variableLabel(variable: string | undefined): string {
  if (!variable) return ''
  return VARIABLES.find(option => option.value === variable)?.label ?? variable
}

function levelLabel(variable: string | undefined, level: string | undefined): string {
  if (!variable || !level) return ''
  const options = levelOptionsForVariable(variable)
  // Single-level variables (MSLP, precipitable water) already say it all in the
  // variable name; a level token would just duplicate it.
  if (options.length <= 1) return ''
  const label = options.find(option => option.value === level)?.label ?? level
  // Numeric pressure levels render as bare numbers ("850"); add units. Named
  // surface levels ("Surface (10m)") are already self-descriptive.
  if (!SURFACE_LEVELS.has(level) && /^\d+$/.test(label)) return `${label}mb`
  return label
}

// "2024-06" → "jun-2024"
function formatMonth(iso: string): string {
  const [year, month] = iso.split('-')
  const idx = Number(month) - 1
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]}-${year}` : iso
}

// Date/month lists can be arbitrarily long; keep names bounded.
function formatList(items: string[]): string {
  if (items.length <= 3) return items.join('_')
  return `${items[0]}_plus_${items.length - 1}_more`
}

function formatTime(time: TimeRecipe | undefined): string {
  if (!time) return ''
  switch (time.scale) {
    case 'climatology': {
      const idx = Number(time.climoMonth) - 1
      return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]}_climatology` : 'climatology'
    }
    case 'monthly':
      if (time.subMode === 'single') return formatMonth(time.month)
      if (time.subMode === 'range') return `${formatMonth(time.monthStart)}_to_${formatMonth(time.monthEnd)}`
      return formatList(time.customMonths.map(formatMonth))
    case 'daily':
      if (time.subMode === 'single') return time.date
      if (time.subMode === 'range') return `${time.startDate}_to_${time.endDate}`
      return formatList(time.customDates)
    case '3-hourly':
      if (time.subMode === 'single') return `${time.date}_${time.hour}z`
      if (time.subMode === 'range') return `${time.startDate}_to_${time.endDate}_${time.hour}z`
      return `${formatList(time.customDates)}_${time.hour}z`
  }
}

export function suggestedMapName(recipe: MapRecipe): string {
  const parts = [
    slug(levelLabel(recipe.variable, recipe.level)),
    slug(variableLabel(recipe.variable)),
    slug(MODE_LABEL[recipe.displayMode ?? 'raw']),
    slug(recipe.region ?? ''),
    formatTime(recipe.time),
  ]
  return parts.filter(Boolean).join('_')
}
