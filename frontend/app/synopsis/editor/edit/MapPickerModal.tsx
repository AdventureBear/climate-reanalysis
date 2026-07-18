'use client'

// Thumbnail map picker for the Synopsis editor (#36): browse projects and
// folders exactly like My Maps, click a thumbnail to insert. Thumbnails come
// through the same signed-URL system the library uses (private bucket).
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { listAllFolders, listAllMaps, listProjects } from '../../../../lib/library'
import type { Folder, Project, SavedMap } from '../../../../lib/database.types'
import { signedUrls } from '../../../../lib/storage'
import { IMAGE_PRESETS } from './EditorApp'

export function MapPickerModal({ onPick, onClose, linkToBuilder, setLinkToBuilder, initialSizePx, title = 'Insert a saved map' }: {
  onPick: (map: SavedMap, sizePx: number) => void
  onClose: () => void
  linkToBuilder: boolean
  setLinkToBuilder: (v: boolean) => void
  initialSizePx?: number
  title?: string
}) {
  // WordPress-style: the insert size is chosen here, before the click.
  // When replacing, it starts at the image's current size.
  const [sizePx, setSizePx] = useState<number>(initialSizePx ?? IMAGE_PRESETS[IMAGE_PRESETS.length - 1].px)
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [maps, setMaps] = useState<SavedMap[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [projectId, setProjectId] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listProjects(), listAllFolders(), listAllMaps()])
      .then(([p, f, m]) => { setProjects(p); setFolders(f); setMaps(m) })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  const visibleMaps = useMemo(() => {
    if (!projectId) return []
    return maps.filter(m => m.project_id === projectId && (m.folder_id ?? null) === folderId)
  }, [maps, projectId, folderId])

  const visibleFolders = useMemo(
    () => (projectId && !folderId ? folders.filter(f => f.project_id === projectId) : []),
    [folders, projectId, folderId],
  )

  // Fetch signed thumbnail addresses for whatever is on screen.
  useEffect(() => {
    const missing = visibleMaps
      .map(m => m.thumbnail_path)
      .filter((p): p is string => Boolean(p) && !(p! in thumbs))
    if (missing.length === 0) return
    signedUrls(missing).then(fresh => setThumbs(t => ({ ...t, ...fresh }))).catch(() => {})
  }, [visibleMaps, thumbs])

  const projectName = projects.find(p => p.id === projectId)?.name
  const folderName = folders.find(f => f.id === folderId)?.name

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="pointer-events-auto flex max-h-[85vh] w-[min(96vw,42rem)] flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-slate-700/60 px-5 py-3.5">
            <span className="text-sm font-medium text-slate-300">{title}</span>
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={linkToBuilder} onChange={e => setLinkToBuilder(e.target.checked)} />
              link it to the builder
            </label>
            <button type="button" onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200">
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-b border-slate-700/60 px-5 py-2">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">insert size</span>
            {IMAGE_PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => setSizePx(p.px)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  sizePx === p.px
                    ? 'border-sky-600 bg-sky-900/60 text-sky-200'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}>
                {p.label}{p.px === 1020 ? '' : ` · ${p.px}px`}
              </button>
            ))}
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 px-5 py-2 text-xs text-slate-500">
            <button type="button" onClick={() => { setProjectId(null); setFolderId(null) }}
              className={projectId ? 'hover:text-slate-300' : 'text-slate-300'}>
              Projects
            </button>
            {projectName && (
              <>
                <ChevronRight size={12} />
                <button type="button" onClick={() => setFolderId(null)}
                  className={folderId ? 'hover:text-slate-300' : 'text-slate-300'}>
                  {projectName}
                </button>
              </>
            )}
            {folderName && (
              <>
                <ChevronRight size={12} />
                <span className="text-slate-300">{folderName}</span>
              </>
            )}
          </div>

          <div className="overflow-y-auto px-5 pb-5">
            {loading && <p className="py-6 text-sm text-slate-500">Loading your maps…</p>}
            {error && <p className="py-6 text-sm text-red-300/90">{error}</p>}

            {/* Project level */}
            {!loading && !projectId && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {projects.map(p => (
                  <button key={p.id} type="button" onClick={() => setProjectId(p.id)}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-left text-sm text-slate-200 transition-colors hover:bg-slate-700">
                    {p.name}
                    <span className="mt-1 block text-xs text-slate-500">
                      {maps.filter(m => m.project_id === p.id).length} maps
                    </span>
                  </button>
                ))}
                {projects.length === 0 && <p className="col-span-full py-4 text-sm text-slate-500">No saved maps yet — save one in the builder first.</p>}
              </div>
            )}

            {/* Folder + map level */}
            {!loading && projectId && (
              <>
                {visibleFolders.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {visibleFolders.map(f => (
                      <button key={f.id} type="button" onClick={() => setFolderId(f.id)}
                        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-200">
                        {f.name} / {maps.filter(m => m.folder_id === f.id).length}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {visibleMaps.map(m => (
                    <button key={m.id} type="button" onClick={() => onPick(m, sizePx)}
                      className="group overflow-hidden rounded-lg border border-slate-700 bg-slate-800 text-left transition-colors hover:border-slate-500">
                      {m.thumbnail_path && thumbs[m.thumbnail_path] ? (
                        <img src={thumbs[m.thumbnail_path]} alt={m.name}
                          className="aspect-[4/3] w-full bg-white object-contain" />
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center text-xs text-slate-600">no preview</div>
                      )}
                      <span className="block truncate px-2.5 py-2 text-xs text-slate-400 group-hover:text-slate-300">{m.name}</span>
                    </button>
                  ))}
                  {visibleMaps.length === 0 && (
                    <p className="col-span-full py-4 text-sm text-slate-500">
                      {visibleFolders.length > 0 ? 'No loose maps here — open a folder above.' : 'No maps in this spot.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
