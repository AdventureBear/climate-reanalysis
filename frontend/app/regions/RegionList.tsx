'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { REGION_THUMBNAILS } from '../../lib/regionThumbnails'
import type { Region } from '../../lib/regions'

function coordinateSummary(region: Region) {
  const { west, east, south, north } = region.extent
  return `${west} to ${east} longitude, ${south} to ${north} latitude`
}

export function RegionList({ regions }: { regions: Region[] }) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRegions = useMemo(() => {
    if (!normalizedQuery) return regions

    return regions.filter(region => {
      const searchable = [
        region.name,
        region.projection.label,
        region.extent_label,
        region.projection.kind,
      ].join(' ').toLowerCase()

      return searchable.includes(normalizedQuery)
    })
  }, [normalizedQuery, regions])

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">Search regions</span>
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search regions"
            className="h-11 w-full rounded border border-[#2e4278]/80 bg-slate-950/45 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />
        </label>
        <p className="text-sm text-slate-400">
          Showing {filteredRegions.length} of {regions.length}
        </p>
      </div>

      {filteredRegions.length === 0 ? (
        <p className="mt-8 rounded-lg border border-[#2e4278]/70 bg-[#1b2a55]/70 p-5 text-sm text-slate-300">
          No regions match that search.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRegions.map(region => {
            const thumbnail = REGION_THUMBNAILS[region.name]
            const href = `/regions/${region.slug}/`

            return (
              <article
                key={region.name}
                className="relative overflow-hidden rounded-lg border border-[#2e4278]/70 bg-[#1b2a55]/70 transition-colors hover:border-sky-500/60"
              >
                <Link href={href} className="grid h-full grid-cols-[6rem_minmax(0,1fr)] gap-4 p-4">
                  <div className="h-24 w-24 overflow-hidden rounded border border-slate-700 bg-slate-950/70">
                    {thumbnail ? (
                      <img src={thumbnail} alt="" aria-hidden="true" className="h-full w-full object-cover opacity-90" />
                    ) : (
                      <div className="h-full w-full bg-slate-900" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white">{region.name}</h2>
                    <p className="mt-1 text-sm font-medium text-cyan-200">{region.projection.label}</p>
                    <p className="mt-3 text-sm leading-5 text-slate-300">{region.extent_label}</p>
                    <p className="sr-only">{coordinateSummary(region)}</p>
                  </div>
                </Link>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
