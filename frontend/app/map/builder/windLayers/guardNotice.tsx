import { useEffect, useState } from 'react'

export const WIND_MASTER_NOTICE = 'Cannot turn wind layer off for wind speed maps'
export const LAST_WIND_LAYER_NOTICE = 'At least one wind layer must be on for wind speed maps'

export function useWindLayerGuardNotice() {
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  return { notice, showNotice: setNotice }
}

export function WindLayerGuardNotice({ notice }: { notice: string | null }) {
  if (!notice) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-14 top-0 z-20 max-w-56 rounded border border-sky-500/50 bg-slate-950 px-2 py-1 text-[11px] leading-snug text-sky-100 shadow-lg shadow-black/30"
    >
      {notice}
    </div>
  )
}
