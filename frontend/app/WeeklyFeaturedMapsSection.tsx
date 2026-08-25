'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FALLBACK_FEATURED_MAPS,
  normalizeWeeklyFeaturedMaps,
  weeklyFeaturedManifestUrl,
  type WeeklyFeaturedMaps,
} from '../lib/weeklyFeaturedMaps'

export function WeeklyFeaturedMapsSection() {
  const [weeklyFeaturedMaps, setWeeklyFeaturedMaps] =
    useState<WeeklyFeaturedMaps>(FALLBACK_FEATURED_MAPS)

  useEffect(() => {
    const url = weeklyFeaturedManifestUrl()
    if (!url) return

    const controller = new AbortController()
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((manifest: WeeklyFeaturedMaps | null) => {
        if (manifest?.items?.length) {
          setWeeklyFeaturedMaps(normalizeWeeklyFeaturedMaps(manifest))
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [])

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20">
      <h2 className="text-2xl font-bold text-slate-100 md:text-3xl">Last week in the Atmosphere</h2>
      <p className="mt-2 text-base text-slate-300">
        Click any map to open it in the builder and make it yours: change the variable, region,
        level, or overlays.
        <span className="ml-2 text-sm text-slate-400">{weeklyFeaturedMaps.dateRangeLabel}</span>
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {weeklyFeaturedMaps.items.map(map => (
          <Link
            key={map.src}
            href={map.href}
            className="group rounded-2xl border border-slate-600/40 bg-[#1b2a55]/70 p-4 transition-all hover:-translate-y-0.5 hover:border-sky-500/50"
          >
            <img src={map.src} alt={map.alt} className="rounded-lg" />
            <span className="mt-3 block text-base font-semibold text-slate-100">{map.title}</span>
            <span className="block text-sm text-slate-400">{map.description}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
