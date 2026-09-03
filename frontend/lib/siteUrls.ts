// Single source of truth for the two production hostnames. The same static
// build is deployed to both Render sites; marketing pages are canonical on
// SITE_URL (www) and the app routes are canonical on APP_URL (app.).
export const SITE_URL = 'https://www.pyreweather.org'
export const APP_URL = 'https://app.pyreweather.org'

// Routes that canonically live on APP_URL. Everything else lives on SITE_URL.
const APP_ROUTE_PREFIXES = ['/map', '/auth', '/admin']

// Cross-host nav links are baked in at build time, so they must be off for
// local dev and local `next build` — otherwise every header click would jump
// to production. Set NEXT_PUBLIC_CROSS_HOST_NAV=1 on both Render static sites.
const CROSS_HOST_NAV = process.env.NEXT_PUBLIC_CROSS_HOST_NAV === '1'

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

// Href for a nav link: relative when the target lives on the same host as the
// current page (keeps Next's client-side navigation), absolute when the click
// crosses between www and app.
export function navHref(target: string, currentPathname: string): string {
  if (!CROSS_HOST_NAV) return target
  const targetIsApp = isAppRoute(target)
  if (targetIsApp === isAppRoute(currentPathname)) return target
  return (targetIsApp ? APP_URL : SITE_URL) + target
}