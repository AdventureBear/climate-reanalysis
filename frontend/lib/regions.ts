import { API_BASE } from './api'

const SERVER_API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

function apiPath(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path}`
}

export type RegionExtent = {
  west: number
  east: number
  south: number
  north: number
}

export type RegionFetchBounds = {
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
}

export type RegionProjection = {
  label: string
  kind: string
  parameters: Record<string, string | number | boolean | string[] | number[] | null>
}

export type Region = {
  name: string
  slug: string
  extent: RegionExtent
  extent_label: string
  fetch_bounds: RegionFetchBounds
  projection: RegionProjection
}

export function slugifyRegion(region: string) {
  return region.toLowerCase().replace(/\s+/g, '-')
}

export function regionBlankMapSrc(region: string) {
  const params = new URLSearchParams({ variable: 'blank_map', region })
  return `${apiPath(API_BASE, '/api/map')}?${params.toString()}`
}

export async function listRegions(): Promise<Region[]> {
  const res = await fetch(apiPath(SERVER_API_BASE, '/api/regions'))

  if (!res.ok) {
    throw new Error(`regions fetch failed: HTTP ${res.status}`)
  }

  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('regions fetch failed: expected an array')
  }
  return data
}
