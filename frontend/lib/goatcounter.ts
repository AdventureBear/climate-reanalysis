// GoatCounter page-view analytics (privacy-friendly, no cookies, no PII).
// Activated only when VITE_GOATCOUNTER_URL is set at build time, e.g.
//   VITE_GOATCOUNTER_URL=https://<sitecode>.goatcounter.com/count
// Dev builds leave it unset, so local work never counts as traffic.
//
// Page views are recorded by pathname only — the recipe query string is
// deliberately stripped (it would explode path cardinality; per-map usage is
// already counted by the map_requests table).

type GoatCounter = {
  count?: (opts?: { path?: string; title?: string; event?: boolean }) => void
  path?: (path: string) => string
}

declare global {
  interface Window {
    goatcounter?: GoatCounter
  }
}

const ENDPOINT: string | undefined = import.meta.env.VITE_GOATCOUNTER_URL

export function initGoatCounter() {
  if (!ENDPOINT) return

  // Settings object must exist before count.js loads; it reads and extends it.
  window.goatcounter = { path: () => window.location.pathname }

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://gc.zgo.at/count.js'
  script.dataset.goatcounter = ENDPOINT
  document.head.appendChild(script)
}

// SPA navigations don't reload the page, so count.js only sees the first view;
// call this on router location changes for the rest.
export function countPageview(pathname: string) {
  if (!ENDPOINT) return
  window.goatcounter?.count?.({ path: pathname })
}
