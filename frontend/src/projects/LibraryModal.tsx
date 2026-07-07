import { useCallback, useEffect, useState } from 'react'
import { X, Plus, Trash2, Pencil, Folder, FolderPlus } from 'lucide-react'
import { useAuth } from '../auth/authContext'
import {
  createFolder, createProject, deleteFolder, deleteProject, deleteSavedMap,
  listFolders, listMaps, listProjects, moveMap, renameFolder, renameProject, renameSavedMap,
  type Folder as FolderRow, type Project, type SavedMap,
} from '../lib/library'
import { publicUrl } from '../lib/storage'

export function LibraryModal({ onClose, onLoadMap }: {
  onClose: () => void
  onLoadMap: (map: SavedMap) => void
}) {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [maps, setMaps] = useState<SavedMap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    const rows = await listProjects()
    setProjects(rows)
    setActiveProjectId(prev => prev && rows.some(p => p.id === prev) ? prev : rows[0]?.id ?? null)
    return rows
  }, [])

  const refreshProjectContents = useCallback(async (projectId: string) => {
    const [f, m] = await Promise.all([listFolders(projectId), listMaps(projectId)])
    setFolders(f)
    setMaps(m)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const rows = await refreshProjects()
        if (active && rows.length === 0) {
          setFolders([])
          setMaps([])
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [refreshProjects])

  useEffect(() => {
    if (!activeProjectId) return
    refreshProjectContents(activeProjectId).catch(err =>
      setError(err instanceof Error ? err.message : String(err)))
  }, [activeProjectId, refreshProjectContents])

  async function guard(fn: () => Promise<void>) {
    setError(null)
    try { await fn() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  async function handleNewProject() {
    if (!user) return
    const name = window.prompt('New project name')?.trim()
    if (!name) return
    await guard(async () => {
      const p = await createProject(user.id, name)
      await refreshProjects()
      setActiveProjectId(p.id)
    })
  }

  async function handleNewFolder() {
    if (!user || !activeProjectId) return
    const name = window.prompt('New folder name')?.trim()
    if (!name) return
    await guard(async () => {
      await createFolder(user.id, activeProjectId, name)
      await refreshProjectContents(activeProjectId)
    })
  }

  const rootMaps = maps.filter(m => m.folder_id === null)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,64rem)] h-[min(86vh,44rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
            <span className="font-semibold text-base">My Maps</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>

          {error && <div className="mx-6 mt-3 rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">{error}</div>}

          <div className="flex min-h-0 flex-1">
            {/* Projects sidebar */}
            <div className="w-56 shrink-0 border-r border-slate-700/60 flex flex-col">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Projects</span>
                <button type="button" onClick={handleNewProject} title="New project"
                  className="p-1 rounded text-sky-400 hover:bg-slate-800 cursor-pointer"><Plus size={14} /></button>
              </div>
              <div className="overflow-y-auto flex-1 px-2 pb-2 flex flex-col gap-1">
                {projects.map(p => (
                  <ProjectRow key={p.id} project={p} active={p.id === activeProjectId}
                    onSelect={() => setActiveProjectId(p.id)}
                    onRename={name => guard(async () => { await renameProject(p.id, name); await refreshProjects() })}
                    onDelete={() => guard(async () => { await deleteProject(p.id); await refreshProjects() })} />
                ))}
                {!loading && projects.length === 0 && (
                  <p className="px-2 py-3 text-xs text-slate-500">No projects yet. Create one to save maps into.</p>
                )}
              </div>
            </div>

            {/* Project contents */}
            <div className="flex-1 min-w-0 overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
              ) : !activeProjectId ? (
                <p className="text-sm text-slate-500">Create a project to get started.</p>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-end">
                    <button type="button" onClick={handleNewFolder}
                      className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer">
                      <FolderPlus size={13} /> New folder
                    </button>
                  </div>

                  {rootMaps.length > 0 && (
                    <MapGrid maps={rootMaps} projectId={activeProjectId} folders={folders}
                      onLoadMap={onLoadMap} onChanged={() => refreshProjectContents(activeProjectId)} guard={guard} />
                  )}

                  {folders.map(f => (
                    <div key={f.id} className="flex flex-col gap-2">
                      <FolderHeader folder={f}
                        onRename={name => guard(async () => { await renameFolder(f.id, name); await refreshProjectContents(activeProjectId) })}
                        onDelete={() => guard(async () => { await deleteFolder(f.id); await refreshProjectContents(activeProjectId) })} />
                      <MapGrid maps={maps.filter(m => m.folder_id === f.id)} projectId={activeProjectId} folders={folders}
                        onLoadMap={onLoadMap} onChanged={() => refreshProjectContents(activeProjectId)} guard={guard} />
                    </div>
                  ))}

                  {maps.length === 0 && folders.length === 0 && (
                    <p className="text-sm text-slate-500">No saved maps in this project yet. Build a map and click Save.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ProjectRow({ project, active, onSelect, onRename, onDelete }: {
  project: Project; active: boolean; onSelect: () => void
  onRename: (name: string) => void; onDelete: () => void
}) {
  return (
    <div className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm cursor-pointer ${active ? 'bg-sky-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
      onClick={onSelect}>
      <span className="flex-1 truncate">{project.name}</span>
      <button type="button" title="Rename" onClick={e => { e.stopPropagation(); const n = window.prompt('Rename project', project.name)?.trim(); if (n) onRename(n) }}
        className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-white"><Pencil size={12} /></button>
      <button type="button" title="Delete" onClick={e => { e.stopPropagation(); if (window.confirm(`Delete project "${project.name}" and all its maps?`)) onDelete() }}
        className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-300"><Trash2 size={12} /></button>
    </div>
  )
}

function FolderHeader({ folder, onRename, onDelete }: {
  folder: FolderRow; onRename: (name: string) => void; onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-2 border-b border-slate-700/50 pb-1">
      <Folder size={14} className="text-slate-400" />
      <span className="text-sm font-semibold text-slate-200">{folder.name}</span>
      <button type="button" title="Rename folder" onClick={() => { const n = window.prompt('Rename folder', folder.name)?.trim(); if (n) onRename(n) }}
        className="p-0.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white"><Pencil size={12} /></button>
      <button type="button" title="Delete folder" onClick={() => { if (window.confirm(`Delete folder "${folder.name}" and its maps?`)) onDelete() }}
        className="p-0.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-300"><Trash2 size={12} /></button>
    </div>
  )
}

function MapGrid({ maps, projectId, folders, onLoadMap, onChanged, guard }: {
  maps: SavedMap[]; projectId: string; folders: FolderRow[]
  onLoadMap: (map: SavedMap) => void; onChanged: () => void
  guard: (fn: () => Promise<void>) => Promise<void>
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {maps.map(m => (
        <MapCard key={m.id} map={m} folders={folders} projectId={projectId}
          onLoad={() => onLoadMap(m)}
          onRename={name => guard(async () => { await renameSavedMap(m.id, name); onChanged() })}
          onMove={folderId => guard(async () => { await moveMap(m.id, { projectId, folderId }); onChanged() })}
          onDelete={() => guard(async () => { await deleteSavedMap(m); onChanged() })} />
      ))}
    </div>
  )
}

function MapCard({ map, folders, onLoad, onRename, onMove, onDelete }: {
  map: SavedMap; folders: FolderRow[]; projectId: string
  onLoad: () => void; onRename: (name: string) => void
  onMove: (folderId: string | null) => void; onDelete: () => void
}) {
  const thumb = publicUrl(map.thumbnail_path)
  return (
    <div className="group relative rounded-lg border border-slate-700 bg-slate-950/40 overflow-hidden">
      <button type="button" onClick={onLoad} className="block w-full cursor-pointer" title="Load this map">
        <div className="aspect-[3/2] bg-slate-800 flex items-center justify-center overflow-hidden">
          {thumb
            ? <img src={thumb} alt={map.name} className="h-full w-full object-cover" />
            : <span className="text-[10px] text-slate-500">no preview</span>}
        </div>
        <div className="px-2 py-1.5 text-left">
          <div className="truncate text-xs font-medium text-slate-200">{map.name}</div>
        </div>
      </button>
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" title="Rename" onClick={() => { const n = window.prompt('Rename map', map.name)?.trim(); if (n) onRename(n) }}
          className="rounded bg-slate-900/90 p-1 text-slate-200 hover:text-white"><Pencil size={12} /></button>
        <button type="button" title="Delete" onClick={() => { if (window.confirm(`Delete "${map.name}"?`)) onDelete() }}
          className="rounded bg-slate-900/90 p-1 text-slate-200 hover:text-red-300"><Trash2 size={12} /></button>
      </div>
      {folders.length > 0 && (
        <select value={map.folder_id ?? ''} onChange={e => onMove(e.target.value || null)}
          title="Move to folder"
          className="w-full border-t border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 cursor-pointer">
          <option value="">— Unfiled —</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
    </div>
  )
}
