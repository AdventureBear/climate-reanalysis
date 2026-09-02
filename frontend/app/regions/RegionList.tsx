'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildRegionSections, filterRegionSections } from '../map/builder/regionCatalog'
import { REGION_THUMBNAILS } from '../../lib/regionThumbnails'
import type { Region } from '../../lib/regions'

function coordinateSummary(region: Region) {
  const { west, east, south, north } = region.extent
  return `${west} to ${east} longitude, ${south} to ${north} latitude`
}

export function RegionList({ regions }: { regions: Region[] }) {
  const [query, setQuery] = useState('')
  const regionByName = useMemo(
    () => new Map(regions.map(region => [region.name, region])),
    [regions],
  )
  const regionSections = useMemo(() => {
    const availableRegionKeys = new Set(regions.map(region => region.name))

    return buildRegionSections(availableRegionKeys)
      .map(section => ({
        ...section,
        rows: section.rows
          .map(row => row.filter(entry => entry.available))
          .filter(row => row.length > 0),
      }))
      .filter(section => section.rows.length > 0)
  }, [regions])
  const displayedRegionSections = useMemo(() => (
    filterRegionSections(regionSections, query, entry => {
      const region = regionByName.get(entry.key)
      return [
        entry.key,
        entry.label,
        region?.projection.label,
        region?.extent_label,
        region?.projection.kind,
      ].filter(Boolean).join(' ')
    })
  ), [query, regionByName, regionSections])
  const visibleRegionCount = useMemo(() => (
    new Set(displayedRegionSections.flatMap(section => section.rows.flat().map(entry => entry.key))).size
  ), [displayedRegionSections])

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
          Showing {visibleRegionCount} of {regions.length}
        </p>
      </div>

      {displayedRegionSections.length === 0 ? (
        <p className="mt-8 rounded-lg border border-[#2e4278]/70 bg-[#1b2a55]/70 p-5 text-sm text-slate-300">
          No regions match that search.
        </p>
      ) : (
        <div className="mt-6 space-y-10">
          {displayedRegionSections.map(section => (
            <section key={section.category}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-200">
                  {section.category}
                </h2>
                <div className="h-px flex-1 bg-[#2e4278]/70" />
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.rows.flat().map(entry => {
                  const region = regionByName.get(entry.key)
                  if (!region) return null

                  const thumbnail = REGION_THUMBNAILS[region.name]
                  const href = `/regions/${region.slug}/`

                  return (
                    <article
                      key={`${section.category}-${region.name}`}
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
                          <h3 className="text-lg font-semibold text-white">{region.name}</h3>
                          <p className="mt-1 text-sm font-medium text-cyan-200">{region.projection.label}</p>
                          <p className="mt-3 text-sm leading-5 text-slate-300">{region.extent_label}</p>
                          <p className="sr-only">{coordinateSummary(region)}</p>
                        </div>
                      </Link>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
