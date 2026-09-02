// Region browser modal. Stays mounted (open prop) so collapsed/expanded
// section state persists across open/close, as it did pre-extraction.
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { API_BASE } from '../../../lib/api'
import { REGION_THUMBNAILS } from '../../../lib/regionThumbnails'
import { buildRegionSections, REGION_SECTIONS } from './regionCatalog'
import { RegionThumbnail } from './RegionThumbnail'

type RegionMetadata = {
  name: string
}

function apiPath(base: string, path: string) {
  return `${base.replace(/\/$/, '')}${path}`
}

export function RegionsModal({ open, region, onSelect, onClose }: {
  open: boolean
  region: string
  onSelect: (regionKey: string) => void
  onClose: () => void
}) {
  const [availableRegions, setAvailableRegions] = useState<string[] | null>(null)
  const [openRegionSections, setOpenRegionSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REGION_SECTIONS.map(section => [section.category, section.defaultOpen ?? false]))
  )
  const regionSections = useMemo(() => buildRegionSections(availableRegions), [availableRegions])

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
          <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,72rem)] h-[min(84vh,48rem)] shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
                <span className="font-semibold text-base">Select Region</span>
                <button type="button" onClick={onClose}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5">
                {regionSections.map(section => (
                  <div
                    key={section.category}
                    className={`${openRegionSections[section.category] ? 'bg-slate-700/55' : ''} first:rounded-t-lg last:rounded-b-lg overflow-hidden`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRegionSection(section.category)}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                        openRegionSections[section.category] ? 'bg-transparent' : 'bg-slate-800/35 hover:bg-slate-800/55'
                      }`}
                      aria-expanded={openRegionSections[section.category] ?? false}
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        {openRegionSections[section.category] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span>{section.category}</span>
                      </span>
                      <span className="text-slate-500">
                        {openRegionSections[section.category] ? <Minus size={15} /> : <Plus size={15} />}
                      </span>
                    </button>
                    {openRegionSections[section.category] && (
                      <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
                        {section.rows.map((row, rowIndex) => (
                          <div key={`${section.category}-${rowIndex}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {row.map(r => {
                              const hasThumbnail = r.key in REGION_THUMBNAILS
                              return (
                                <button
                                  key={r.key}
                                  type="button"
                                  disabled={!r.available}
                                  onClick={() => onSelect(r.key)}
                                  className={`min-h-[52px] rounded-lg text-sm font-medium text-left transition-colors ${
                                    hasThumbnail ? 'flex items-center gap-3 overflow-hidden py-0 pl-0 pr-4' : 'px-4 py-3'
                                  } ${
                                    r.available
                                      ? region === r.key
                                        ? 'bg-sky-700 text-white cursor-pointer'
                                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white cursor-pointer'
                                      : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                  }`}
                                >
                                  <RegionThumbnail regionKey={r.key} selected={region === r.key} />
                                  <span>
                                    {r.label}
                                    {!r.available && (
                                      <span className="block text-xs text-slate-600 mt-0.5">coming soon</span>
                                    )}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
    </>
  )
}
