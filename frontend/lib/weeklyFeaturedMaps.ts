export type WeeklyFeaturedMap = {
  title: string
  description: string
  src: string
  alt: string
  href: string
}

export type WeeklyFeaturedMaps = {
  dateRangeLabel: string
  weekStart: string
  weekEnd: string
  generatedAt: string
  items: WeeklyFeaturedMap[]
}

export const FALLBACK_FEATURED_MAPS: WeeklyFeaturedMaps = {
  dateRangeLabel: 'Jul 6-12, 2026',
  weekStart: '2026-07-06',
  weekEnd: '2026-07-12',
  generatedAt: '2026-07-12T00:00:00.000Z',
  items: [
    {
      title: '500mb heights',
      description: 'The steering pattern aloft',
      src: '/examples/height-500.png',
      alt: '500mb geopotential height, shaded, over the continental United States',
      href: '/map?variable=height&level=500&region=CONUS&hour=00&date=20260708&date_mode=single&fill_mode=shaded&wind_step=0',
    },
    {
      title: 'Surface temperature',
      description: 'Afternoon heat, county by county',
      src: '/examples/temp-2m.png',
      alt: '2 meter temperature over the continental United States',
      href: '/map?variable=temp_2m&level=1000&region=CONUS&hour=21&date=20260708&date_mode=single&wind_step=0',
    },
    {
      title: '300mb winds',
      description: 'Where the jet stream lives',
      src: '/examples/wind-300.png',
      alt: '300mb wind speed over the continental United States',
      href: '/map?variable=wind_speed&level=300&region=CONUS&hour=00&date=20260708&date_mode=single&wind_step=0',
    },
  ],
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

export function weeklyFeaturedManifestUrl() {
  return SUPABASE_URL
    ? `${SUPABASE_URL}/storage/v1/object/public/post-images/last-week/manifest.json`
    : null
}

export function resolveWeeklyFeaturedImage(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src
  return SUPABASE_URL
    ? `${SUPABASE_URL}/storage/v1/object/public/${src}`
    : src
}

export function normalizeWeeklyFeaturedMaps(manifest: WeeklyFeaturedMaps): WeeklyFeaturedMaps {
  return {
    ...manifest,
    items: manifest.items.map(item => ({
      ...item,
      src: resolveWeeklyFeaturedImage(item.src),
    })),
  }
}
