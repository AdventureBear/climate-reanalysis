// Which wind-controls layout the Overlays card renders (#45 split test).
//
// This is a UI preference, not part of the map, so it deliberately stays out
// of MapRecipe: it must never ride in a share link or a saved recipe. It is
// set three ways, in priority order:
//   1. ?controls=buttons on any URL — how you hand a variant to a test group
//   2. the Settings drawer toggle
//   3. DEFAULT_WIND_LAYOUT
// A URL choice is written to localStorage so it survives navigation inside
// the app, which is what makes a handed-out link stick for that user.
//
// A module-level store rather than React state: the Overlays card and the
// Settings drawer sit in different subtrees, and neither owns the value.

import { useSyncExternalStore } from 'react'

export const WIND_LAYOUTS = ['switches', 'buttons'] as const
export type WindLayout = (typeof WIND_LAYOUTS)[number]

export const WIND_LAYOUT_LABELS: Record<WindLayout, string> = {
  switches: 'Switch rows',
  buttons: 'Button strips',
}

export const DEFAULT_WIND_LAYOUT: WindLayout = 'switches'
const STORAGE_KEY = 'pyre.windLayout'

function isWindLayout(value: string | null): value is WindLayout {
  return WIND_LAYOUTS.includes(value as WindLayout)
}

// Starts at the default so the server-rendered static export and the first
// client render agree; readStoredWindLayout() promotes it after mount.
let current: WindLayout = DEFAULT_WIND_LAYOUT
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setWindLayout(next: WindLayout) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch { /* private browsing or storage disabled: the choice is session-only */ }
  listeners.forEach(l => l())
}

/** Call once after mount. URL wins over storage; a URL choice is persisted. */
export function readStoredWindLayout() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('controls')
    if (isWindLayout(fromUrl)) {
      setWindLayout(fromUrl)
      return
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isWindLayout(stored)) setWindLayout(stored)
  } catch { /* keep the default */ }
}

export function useWindLayout(): WindLayout {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_WIND_LAYOUT)
}
