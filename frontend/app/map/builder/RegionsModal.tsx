// Region browser modal. Stays mounted (open prop) so collapsed/expanded
// section state persists across open/close, as it did pre-extraction.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, Minus, Plus, Search, X } from 'lucide-react'
import { API_BASE } from '../../../lib/api'
import { slugifyRegion } from '../../../lib/regions'
import { REGION_THUMBNAILS } from '../../../lib/regionThumbnails'
import { buildRegionSections, filterRegionSections, REGION_SECTIONS } from './regionCatalog'
import { RegionThumbnail } from './RegionThumbnail'

type RegionMetadata = {
  name: string
}

function apiPath(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path}`
}

function regionPreviewHref(regionKey: string) {
  return `/regions/${slugifyRegion(regionKey)}/`
}

export function RegionsModal({ open, region, onSelect, onClose }: {
  open: boolean
  region: string
  onSelect: (regionKey: string) => void
  onClose: () => void
}) {
  const [availableRegions, setAvailableRegions] = useState<string[] | null>(null)
  const [regionQuery, setRegionQuery] = useState('')
  const [openRegionSections, setOpenRegionSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REGION_SECTIONS.map(section => [section.category, section.defaultOpen ?? false]))
  )
  const regionSections = useMemo(() => buildRegionSections(availableRegions), [availableRegions])
  const displayedRegionSections = useMemo(() => (
    availableRegions ? filterRegionSections(regionSections, regionQuery) : regionSections
  ), [availableRegions, regionQuery, regionSections])
  const regionSearchActive = availableRegions ? regionQuery.trim().length > 0 : false
  const visibleRegionCount = useMemo(() => (
    new Set(displayedRegionSections.flatMap(section => section.rows.flat().map(entry => entry.key))).size
  ), [displayedRegionSections])

  useEffect(() => {
    if (!open || availableRegions) return

    let cancelled = false
    async function fetchRegions() {
      try {
        const res = await fetch(apiPath(API_BASE, '/api/regions'))
        if (!res.ok) return
        const data = await res.json()
        if (!Array.isArray(data)) return
        const regionNames = data
          .map((item: RegionMetadata) => item?.name)
          .filter((name): name is string => typeof name === 'string' && name.length > 0)

        if (!cancelled) setAvailableRegions(regionNames)
      } catch {
        // Keep the static fallback catalogue if the backend metadata endpoint is unavailable.
      }
    }

    void fetchRegions()
    return () => {
      cancelled = true
    }
  }, [availableRegions, open])

  useEffect(() => {
    setOpenRegionSections(openSections => ({
      ...Object.fromEntries(regionSections.map(section => [section.category, section.defaultOpen ?? false])),
      ...openSections,
    }))
  }, [regionSections])

  function toggleRegionSection(category: string) {
    setOpenRegionSections(openSections => ({
      ...openSections,
      [category]: !openSections[category],
    }))
  }

  if (!open) return null

  return (
    <>
        <>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-40" onClick={onClose} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-500/70 rounded-2xl w-[min(96vw,72rem)] h-[min(84vh,48rem)] shadow-[0_24px_90px_rgba(0,0,0,0.7)] ring-1 ring-white/5 flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-600 bg-slate-800/55 shrink-0">
                <span className="font-semibold text-base text-slate-50">Select Region</span>
                <button type="button" onClick={onClose}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/80 cursor-pointer transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto bg-slate-950/15 px-6 py-5">
                {availableRegions && (
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="relative block sm:w-[28rem]">
                      <span className="sr-only">Search regions</span>
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={regionQuery}
                        onChange={event => setRegionQuery(event.target.value)}
                        placeholder="Search regions"
                        className="w-full rounded-lg border border-slate-500/80 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25"
                      />
                    </label>
                    <span className="text-xs text-slate-500">
                      Showing {visibleRegionCount} of {availableRegions.length}
                    </span>
                  </div>
                )}

                {displayedRegionSections.length === 0 && (
                  <div className="rounded-lg border border-slate-700 bg-slate-800/45 px-4 py-6 text-center text-sm text-slate-400">
                    No regions match your search.
                  </div>
                )}

                {displayedRegionSections.map(section => {
                  const sectionOpen = regionSearchActive || (openRegionSections[section.category] ?? false)

                  return (
                    <div
                      key={section.category}
                      className={`mb-2 overflow-hidden rounded-lg border border-slate-700/70 ${
                        sectionOpen ? 'bg-slate-800/45' : 'bg-slate-900/35'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleRegionSection(section.category)}
                        className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                          sectionOpen ? 'bg-slate-800/90' : 'bg-slate-900/70 hover:bg-slate-800/80'
                        }`}
                        aria-expanded={sectionOpen}
                      >
                        <span className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-widest">
                          {sectionOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span>{section.category}</span>
                        </span>
                        <span className="text-slate-400">
                          {sectionOpen ? <Minus size={15} /> : <Plus size={15} />}
                        </span>
                      </button>
                      {sectionOpen && (
                        <div className="border-t border-slate-700/60 bg-slate-950/25 px-3 pb-3 pt-3 flex flex-col gap-2">
                          {section.rows.map((row, rowIndex) => (
                            <div key={`${section.category}-${rowIndex}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {row.map(r => {
                                const hasThumbnail = r.key in REGION_THUMBNAILS
                                const selected = region === r.key
                                return (
                                  <div
                                    key={r.key}
                                    className={`group flex min-h-[52px] overflow-visible rounded-lg border text-sm font-medium shadow-sm transition-colors ${
                                      r.available
                                        ? selected
                                          ? 'border-sky-300/50 bg-sky-700 text-white shadow-sky-950/30 cursor-pointer'
                                          : 'border-slate-700/70 bg-slate-900/85 text-slate-100 hover:border-slate-500 hover:bg-slate-800 hover:text-white'
                                        : 'border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      disabled={!r.available}
                                      onClick={() => onSelect(r.key)}
                                      className={`flex min-w-0 flex-1 items-center text-left ${
                                        r.available ? 'cursor-pointer' : 'cursor-not-allowed'
                                      } ${hasThumbnail ? 'gap-3 overflow-hidden rounded-l-lg py-0 pl-0 pr-2' : 'px-4 py-3'}`}
                                    >
                                      <RegionThumbnail regionKey={r.key} selected={selected} />
                                      <span className="min-w-0 truncate">
                                        {r.label}
                                        {!r.available && (
                                          <span className="block text-xs text-slate-600 mt-0.5">coming soon</span>
                                        )}
                                      </span>
                                    </button>
                                    {r.available && (
                                      <a
                                        href={regionPreviewHref(r.key)}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={`Preview ${r.label} in new window`}
                                        className={`group/preview relative m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors ${
                                          selected
                                            ? 'text-sky-100/75 hover:text-white'
                                            : 'text-slate-400 opacity-70 hover:text-slate-100 hover:opacity-100'
                                        }`}
                                      >
                                        <Eye size={15} className="transition-transform duration-75 group-hover/preview:scale-110" />
                                        <span
                                          role="tooltip"
                                          className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 whitespace-nowrap rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-900 opacity-0 shadow-lg invisible transition-opacity duration-75 group-hover/preview:visible group-hover/preview:opacity-100"
                                        >
                                          Preview {r.label} in new window
                                        </span>
                                      </a>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
    </>
  )
}
