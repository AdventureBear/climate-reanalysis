// Region browser catalogue: which regions the UI offers and how they are
// grouped. Region bounds themselves live in the backend REGIONS config; keys
// here must match those backend keys exactly.
export type RegionEntry = { key: string; label: string; available: boolean }
export type RegionSection = {
  category: string
  defaultOpen?: boolean
  rows: RegionEntry[][]
}

export const REGION_SECTIONS: RegionSection[] = [
  {
    category: 'US',
    defaultOpen: true,
    rows: [
      [
        { key: 'CONUS',         label: 'CONUS',         available: true },
        { key: 'North America', label: 'North America', available: true },
      ],
    ],
  },
  {
    category: 'US Regions',
    defaultOpen: true,
    rows: [
      [
        { key: 'Northwest US',    label: 'Pacific Northwest', available: true },
        { key: 'Northern Plains', label: 'Northern Plains',   available: true },
        { key: 'Northeast',       label: 'Northeast',         available: true },
      ],
      [
        { key: 'Western US',     label: 'Western US',        available: true },
        { key: 'Central Plains', label: 'Central Plains',    available: true },
        { key: 'Eastern US',     label: 'Eastern US',        available: true },
      ],
      [
        { key: 'Southwest US',  label: 'Southwest',       available: true },
        { key: 'South Central', label: 'Southern Plains', available: true },
        { key: 'Southeast US',  label: 'Southeast',       available: true },
      ],
      [
        { key: 'Alaska', label: 'Alaska', available: true },
        { key: 'Hawaii', label: 'Hawaii', available: true },
      ],
    ],
  },
  {
    category: 'World',
    rows: [
      [
        { key: 'World',               label: 'World',               available: true },
        { key: 'Northern Hemisphere', label: 'Northern Hemisphere', available: true },
        { key: 'Southern Hemisphere', label: 'Southern Hemisphere', available: true },
      ],
      [
        { key: 'North America', label: 'North America', available: true },
        { key: 'South America', label: 'South America', available: true },
        { key: 'Europe',        label: 'Europe',        available: true },
      ],
      [
        { key: 'Asia',      label: 'Asia',      available: true },
        { key: 'East Asia', label: 'East Asia', available: true },
        { key: 'Australia', label: 'Australia', available: true },
        { key: 'New Zealand', label: 'New Zealand', available: true },
      ],
      [
        { key: 'Northern Africa', label: 'Northern Africa', available: true },
        { key: 'Middle East',     label: 'Middle East',     available: true },
        { key: 'Southern Africa', label: 'Southern Africa', available: true },
      ],
      [
        { key: 'Western Canada',   label: 'Western Canada',   available: true },
        { key: 'Canada',           label: 'Canada',           available: true },
        { key: 'Southeast Canada', label: 'Southeast Canada', available: true },
      ],
      [
        { key: 'India', label: 'India', available: true },
      ],
    ],
  },
  {
    category: 'Tropical & Equatorial',
    rows: [
      [
        { key: 'India',           label: 'India',           available: true },
        { key: 'Southern Africa', label: 'Southern Africa', available: true },
        { key: 'Northern Africa', label: 'Northern Africa', available: true },
      ],
      [
        { key: 'Indian Ocean',      label: 'Indian Ocean',      available: true },
        { key: 'Tropical Atlantic', label: 'Tropical Atlantic', available: true },
        { key: 'Western Atlantic',  label: 'Western Atlantic',  available: true },
      ],
      [
        { key: 'Western Pacific', label: 'Western Pacific', available: true },
        { key: 'Central Pacific', label: 'Central Pacific', available: true },
        { key: 'Eastern Pacific', label: 'Eastern Pacific', available: true },
      ],
      [
        { key: 'Southwest Pacific', label: 'Southwest Pacific', available: true },
        { key: 'Southeast Pacific', label: 'Southeast Pacific', available: true },
      ],
    ],
  },
  {
    category: 'Ocean Basins',
    rows: [
      [
        { key: 'North Pacific',   label: 'North Pacific',   available: true },
        { key: 'Western Pacific', label: 'Western Pacific', available: true },
        { key: 'Central Pacific', label: 'Central Pacific', available: true },
      ],
      [
        { key: 'Eastern Pacific',   label: 'Eastern Pacific',   available: true },
        { key: 'Southwest Pacific', label: 'Southwest Pacific', available: true },
        { key: 'Southeast Pacific', label: 'Southeast Pacific', available: true },
      ],
      [
        { key: 'North Atlantic',    label: 'North Atlantic',    available: true },
        { key: 'Western Atlantic',  label: 'Western Atlantic',  available: true },
        { key: 'Tropical Atlantic', label: 'Tropical Atlantic', available: true },
        { key: 'Indian Ocean',      label: 'Indian Ocean',      available: true },
      ],
    ],
  },
]

export function getRegionLabel(regionKey: string) {
  for (const section of REGION_SECTIONS) {
    for (const row of section.rows) {
      const region = row.find(r => r.key === regionKey)
      if (region) return region.label
    }
  }
  return regionKey
}
