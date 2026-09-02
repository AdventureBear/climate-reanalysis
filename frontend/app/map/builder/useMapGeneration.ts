// Map-request lifecycle: loading/error state, the streamed-PNG blob URL, and
// its cleanup. URL sync and recipe assembly stay with the caller.
import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'
import { DATA_AVAILABILITY_NOTE, observationDateAvailabilityError } from '../../../mapRecipe'
import type { DataGap } from './dataGap'

export type { DataGap, GapRetry } from './dataGap'
export { gapRetryFromGap } from './dataGap'

const IGNORED_PARAMS_HEADER = 'X-PyRe-Ignored-Params'

function timeScaleFromParams(params: Record<string, string>): string {
  if (params.mode === 'climatology') return 'climatology'
  if (params.months) return 'monthly'
  if (params.hour) return '3-hourly'
  return 'daily'
}

// Anonymous usage counter: one map_requests row per successful render. Recipe
// facts only (no user, no IP); RLS makes the table write-only via the API.
// Fire-and-forget — a failed insert must never affect the map.
function logMapRequest(params: Record<string, string>) {
  if (!supabase) return
  void supabase
    .from('map_requests')
    .insert({
      variable: params.variable ?? null,
      level: params.level ?? null,
      region: params.region ?? null,
      mode: params.mode ?? 'raw',
      time_scale: timeScaleFromParams(params),
    })
    .then(({ error }) => {
      if (error) console.debug('map_requests insert failed:', error.message)
    })
}

function ignoredParamsFromHeader(headerValue: string | null): string[] {
  return headerValue?.split(',').map(s => s.trim()).filter(Boolean) ?? []
}

function ignoredParamsNotice(ignored: string[]): string | null {
  if (!ignored.length) return null
  const names = ignored.map(key => `"${key}"`).join(', ')
  return ignored.length === 1
    ? `${names} is not a supported parameter and was ignored.`
    : `${names} are not supported parameters and were ignored.`
}

export function useMapGeneration() {
  const [mapSrc,  setMapSrc]  = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [dataGap, setDataGap] = useState<DataGap | null>(null)
  const [requestNotice, setRequestNotice] = useState<string | null>(null)

  // Release the last rendered blob URL when the component unmounts.
  const mapSrcRef = useRef<string | null>(null)
  useEffect(() => {
    mapSrcRef.current = mapSrc
  }, [mapSrc])
  useEffect(() => () => {
    if (mapSrcRef.current?.startsWith('blob:')) URL.revokeObjectURL(mapSrcRef.current)
  }, [])

  async function generateFromParams(params: Record<string, string>): Promise<string[]> {
    const availabilityError = observationDateAvailabilityError(params)
    if (availabilityError) {
      setLoading(false)
      setError(availabilityError)
      setDataGap(null)
      setRequestNotice(null)
      setMapSrc(prev => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return null
      })
      return []
    }

    setLoading(true)
    setError(null)
    setDataGap(null)
    setRequestNotice(null)
    setMapSrc(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })

    try {
      const res = await fetch(`${API_BASE}/api/map?${new URLSearchParams(params)}`)
      if (res.ok) {
        const ignoredParams = ignoredParamsFromHeader(res.headers.get(IGNORED_PARAMS_HEADER))
        const blob = await res.blob()
        setMapSrc(URL.createObjectURL(blob))
        setRequestNotice(ignoredParamsNotice(ignoredParams))
        logMapRequest(params)
        return ignoredParams
      } else {
        const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        const detail = body.detail
        if (detail && typeof detail === 'object' && Array.isArray(detail.missing)) {
          // Structured data-gap error: message for the banner, missing list
          // for the retry offer.
          const message = String(detail.message ?? `HTTP ${res.status}`)
          setError(message.includes('24-36 hours') ? message : `${message} ${DATA_AVAILABILITY_NOTE}`)
          setDataGap({
            missing: detail.missing,
            total: Number(detail.total) || detail.missing.length,
            params,
          })
        } else {
          const message = typeof detail === 'string' ? detail : `HTTP ${res.status}`
          setError(message.includes('CORe') && message.includes('not available') && !message.includes('24-36 hours')
            ? `${message} ${DATA_AVAILABILITY_NOTE}`
            : message)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
    return []
  }

  // Show an externally-hosted image (e.g. a saved map's signed URL) directly,
  // releasing any blob the previous render held.
  function showImage(url: string | null) {
    setMapSrc(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return url
    })
  }

  return { mapSrc, loading, error, setError, dataGap, requestNotice, setRequestNotice, generateFromParams, showImage }
}
