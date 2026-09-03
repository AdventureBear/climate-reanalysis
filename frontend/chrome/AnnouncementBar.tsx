'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { navHref } from '../lib/siteUrls'

// Thin dismissible bar above the header for the current giveaway/campaign.
// Dismissing hides it for RESURFACE_DAYS. To run a new campaign, change
// ANNOUNCEMENT — a new id resets everyone's dismissals.
const ANNOUNCEMENT = {
  id: 'mapping-guide-2026',
  message: 'Get your free 5-day mapping guide',
  target: '/#newsletter',
}
const RESURFACE_DAYS = 7

const DISMISSED_KEY = `pyre-announcement-dismissed:${ANNOUNCEMENT.id}`

export function AnnouncementBar() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  // Visibility is decided client-side from localStorage, so the bar mounts
  // hidden and appears after the check (no flash for dismissed visitors).
  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0)
    if (dismissedAt && Date.now() - dismissedAt < RESURFACE_DAYS * 86_400_000) return
    setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setVisible(false)
  }

  return (
    <div className="relative bg-amber-300">
      <a
        href={`${navHref('/', pathname)}${ANNOUNCEMENT.target.slice(1)}`}
        className="block w-full px-10 py-1.5 text-center text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-200"
      >
        {ANNOUNCEMENT.message}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-900/70 hover:bg-amber-200 hover:text-slate-900"
      >
        <X size={16} />
      </button>
    </div>
  )
}