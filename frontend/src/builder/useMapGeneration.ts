// Map-request lifecycle: loading/error state, the streamed-PNG blob URL, and
// its cleanup. URL sync and recipe assembly stay with the caller.
import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../lib/api'

export function useMapGeneration() {
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

  // Show an externally-hosted image (e.g. a saved map's signed URL) directly,
  // releasing any blob the previous render held.
  function showImage(url: string | null) {
    setMapSrc(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return url
    })
  }

  return { mapSrc, loading, error, setError, generateFromParams, showImage }
}
