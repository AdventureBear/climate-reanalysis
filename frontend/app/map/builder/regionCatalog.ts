// Region browser catalogue. Backend REGIONS remains the availability source;
// this file only owns grouping, labels, and hard-coded preference ordering
// until those become user-configurable metadata.
export type RegionEntry = { key: string; label: string; available: boolean }
export type RegionSection = {
  category: string
  defaultOpen?: boolean
  rows: RegionEntry[][]
}

type RegionPreference = 'US'
type RegionCategoryDefinition = {
  category: string
  defaultOpen?: boolean
  regions: string[]
}

const REGION_PICKER_COLUMNS = 3
export const REGION_PICKER_REGION_PREFERENCE: RegionPreference = 'US'

const REGION_LABELS: Record<string, string> = {
  'Northwest US': 'Pacific Northwest',
  'Southwest US': 'Southwest',
  'South Central': 'Southern Plains',
  'Southeast US': 'Southeast',
}

const REGION_CATEGORY_DEFINITIONS: RegionCategoryDefinition[] = [
  {
    category: 'US',
    defaultOpen: true,
    regions: [
      'CONUS',
      'North America',
    ],
  },
  {
    category: 'US Regions',
    defaultOpen: true,
    regions: [
      'Northwest US',
      'Northern Plains',
      'Northeast',
      'Western US',
      'Central Plains',
      'Eastern US',
      'Southwest US',
      'South Central',
      'Southeast US',
      'Caribbean',
      'Alaska',
      'Hawaii',
    ],
  },
  {
    category: 'World',
    regions: [
      'World',
      'Northern Hemisphere',
      'Southern Hemisphere',
      'North America',
      'South America',
      'Europe',
      'Asia',
      'East Asia',
      'Australia',
      'New Zealand',
      'Northern Africa',
      'Middle East',
      'Southern Africa',
      'Western Canada',
      'Canada',
      'Southeast Canada',
      'India',
    ],
  },
  {
    category: 'Tropical & Equatorial',
    regions: [
      'India',
      'Southern Africa',
      'Northern Africa',
      'Caribbean',
      'Indian Ocean',
      'Tropical Atlantic',
      'Western Atlantic',
      'Western Pacific',
      'Central Pacific',
      'Eastern Pacific',
      'Southwest Pacific',
      'Southeast Pacific',
    ],
  },
  {
    category: 'Ocean Basins',
    regions: [
      'North Pacific',
      'Western Pacific',
      'Central Pacific',
      'Eastern Pacific',
      'Southwest Pacific',
      'Southeast Pacific',
      'North Atlantic',
      'Caribbean',
      'Western Atlantic',
      'Tropical Atlantic',
      'Indian Ocean',
    ],
  },
]

const REGION_CATEGORY_ORDER_BY_PREFERENCE: Record<RegionPreference, string[]> = {
  US: ['US', 'US Regions', 'Tropical & Equatorial', 'World', 'Ocean Basins', 'Other Regions'],
}

const CATEGORIZED_REGION_KEYS = new Set(
  REGION_CATEGORY_DEFINITIONS.flatMap(section => section.regions)
)

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}

function categoryRank(category: string) {
  const order = REGION_CATEGORY_ORDER_BY_PREFERENCE[REGION_PICKER_REGION_PREFERENCE]
  const index = order.indexOf(category)
  return index === -1 ? order.length : index
}

function regionEntry(key: string, availableRegionKeys: Set<string> | null): RegionEntry {
  return {
    key,
    label: getRegionLabel(key),
    available: availableRegionKeys ? availableRegionKeys.has(key) : true,
  }
}

export function buildRegionSections(availableRegions?: Iterable<string> | null): RegionSection[] {
  const availableRegionKeys = availableRegions ? new Set(availableRegions) : null
  const sections: RegionSection[] = REGION_CATEGORY_DEFINITIONS.map(section => ({
    category: section.category,
    defaultOpen: section.defaultOpen,
    rows: chunk(section.regions.map(region => regionEntry(region, availableRegionKeys)), REGION_PICKER_COLUMNS),
  }))

  if (availableRegionKeys) {
    const uncategorizedRegions = [...availableRegionKeys]
      .filter(region => !CATEGORIZED_REGION_KEYS.has(region))
      .sort((a, b) => a.localeCompare(b))

    if (uncategorizedRegions.length > 0) {
      sections.push({
        category: 'Other Regions',
        rows: chunk(uncategorizedRegions.map(region => regionEntry(region, availableRegionKeys)), REGION_PICKER_COLUMNS),
      })
    }
  }

  return sections.sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
}

export const REGION_SECTIONS: RegionSection[] = buildRegionSections()

export function filterRegionSections(
  sections: RegionSection[],
  query: string,
  getSearchText?: (entry: RegionEntry) => string,
): RegionSection[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return sections

  return sections
    .map(section => {
      const categoryMatches = section.category.toLowerCase().includes(normalizedQuery)
      const entries = section.rows.flat().filter(entry => (
        categoryMatches ||
        (getSearchText
          ? getSearchText(entry)
          : `${entry.key} ${entry.label}`
        ).toLowerCase().includes(normalizedQuery)
      ))

      return {
        ...section,
        rows: chunk(entries, REGION_PICKER_COLUMNS),
      }
    })
    .filter(section => section.rows.length > 0)
}

export function getRegionLabel(regionKey: string) {
  return REGION_LABELS[regionKey] ?? regionKey
}
