'use client'

// GoatCounter wiring for the App Router: inject count.js once on mount, then
// report SPA route changes (count.js only sees the initial page load).
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { countPageview, initGoatCounter } from '../lib/goatcounter'

export function Analytics() {
  const pathname = usePathname()
  const isFirstLocation = useRef(true)

  useEffect(() => {
    initGoatCounter()
  }, [])

  useEffect(() => {
    if (isFirstLocation.current) {
      isFirstLocation.current = false
      return
    }
    countPageview(pathname)
  }, [pathname])

  return null
}
