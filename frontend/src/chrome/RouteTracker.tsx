// Reports SPA route changes to GoatCounter. Renders nothing; must live inside
// the router so useLocation works. The initial page load is counted by
// count.js itself, so the first location is skipped.
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { countPageview } from '../lib/goatcounter'

export function RouteTracker() {
  const location = useLocation()
  const isFirstLocation = useRef(true)

  useEffect(() => {
    if (isFirstLocation.current) {
      isFirstLocation.current = false
      return
    }
    countPageview(location.pathname)
  }, [location.pathname])

  return null
}
