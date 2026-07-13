import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  X, Plus, Trash2, Pencil, Folder, FolderPlus, FolderInput, Download, Link2, Check,
  LayoutGrid, Layers, List, Map as MapIcon, SlidersHorizontal, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../auth/authContext'
import {
  createFolder, createProject, deleteFolder, deleteProject, deleteSavedMap,
  listAllFolders, listAllMaps, listProjects, moveFolder, moveMap, renameFolder, renameProject, renameSavedMap,
  type Folder as FolderRow, type Project, type SavedMap,
} from '../lib/library'
import { downloadImageBlob, signedUrl, signedUrls } from '../lib/storage'
import { recipeShareUrl, type MapRecipe } from '../mapRecipe'
import { NameModal } from './NameModal'

// A move destination: a project (or My Maps' backing project) and optionally
// one of its folders.
type MoveTarget = { projectId: string; folderId: string | null }

// Config for the shared name-entry dialog (new/rename project/folder/map).
type NameDialog = { title: string; initial?: string; submitLabel?: string; onSubmit: (name: string) => void }

// Sidebar accordion key for the "My Maps" default location (its backing
// project id isn't stable enough — it may not exist yet on a new account).
const HOME_KEY = '__my_maps__'

type ViewMode = 'grid' | 'list'
const VIEW_STORAGE_KEY = 'pyre.libraryView'

export function LibraryModal({ onClose, onLoadMap }: {
  onClose: () => void
  onLoadMap: (map: SavedMap) => void
}) {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [maps, setMaps] = useState<SavedMap[]>([])
  // Private bucket: thumbnails render through short-lived signed URLs keyed by
  // path. Cached for the modal's lifetime (ref mirrors state for async reads):
  // refreshes only sign paths we haven't seen, so existing <img> srcs never
  // change and the background doesn't visibly redraw after rename/move/delete.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const thumbUrlsRef = useRef(thumbUrls)
  // Navigation: home ("My Maps") -> project -> folder. activeProjectId null =
  // home; activeFolderId set = inside that folder.
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  // Map open in the full-size viewer (stored PNG, no regeneration).
  const [viewerMap, setViewerMap] = useState<SavedMap | null>(null)
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  // Item being relocated via the move dialog.
  const [movingMap, setMovingMap] = useState<SavedMap | null>(null)
  const [movingFolder, setMovingFolder] = useState<FolderRow | null>(null)
  // Sidebar accordion: which locations show their folder list. Independent per
  // location — opening one never closes another.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Grid vs list presentation of the content area, remembered across sessions.
  const [view, setView] = useState<ViewMode>(() =>
    localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Everything loads up front (owner-scoped by RLS) and views filter client-side.
  const refresh = useCallback(async () => {
    const [p, f, m] = await Promise.all([listProjects(), listAllFolders(), listAllMaps()])
    setProjects(p)
    setFolders(f)
    setMaps(m)
    const missing = m
      .map(x => x.thumbnail_path)
      .filter((path): path is string => Boolean(path) && !(path! in thumbUrlsRef.current))
    if (missing.length > 0) {
      const fresh = await signedUrls(missing)
      thumbUrlsRef.current = { ...thumbUrlsRef.current, ...fresh }
      setThumbUrls(thumbUrlsRef.current)
    }
    setActiveProjectId(prev => prev && p.some(x => x.id === prev) ? prev : null)
    setActiveFolderId(prev => prev && f.some(x => x.id === prev) ? prev : null)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        await refresh()
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [refresh])

  async function guard(fn: () => Promise<void>) {
    setError(null)
    try { await fn() } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  function openProject(id: string | null) {
    setActiveProjectId(id)
    setActiveFolderId(null)
  }

  function setViewMode(mode: ViewMode) {
    setView(mode)
    localStorage.setItem(VIEW_STORAGE_KEY, mode)
  }

  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openFolder(folder: FolderRow) {
    setActiveProjectId(folder.project_id)
    setActiveFolderId(folder.id)
  }

  function handleNewProject() {
    if (!user) return
    setNameDialog({
      title: 'New project',
      onSubmit: name => void guard(async () => {
        const p = await createProject(user.id, name)
        await refresh()
        openProject(p.id)
      }),
    })
  }

  function handleNewFolder(projectId: string) {
    if (!user) return
    setNameDialog({
      title: 'New folder',
      onSubmit: name => void guard(async () => {
        await createFolder(user.id, projectId, name)
        await refresh()
      }),
    })
  }

  // Folders under "My Maps" live in the backing default project; a brand-new
  // account creates it on the fly.
  function handleNewFolderInAllMaps() {
    if (!user) return
    setNameDialog({
      title: 'New folder',
      onSubmit: name => void guard(async () => {
        const projectId = defaultProject?.id ?? (await createProject(user.id, 'My Maps')).id
        await createFolder(user.id, projectId, name)
        await refresh()
      }),
    })
  }

  function renameFolderDialog(folder: FolderRow) {
    setNameDialog({
      title: 'Rename folder', initial: folder.name, submitLabel: 'Rename',
      onSubmit: name => void guard(async () => { await renameFolder(folder.id, name); await refresh() }),
    })
  }

  function deleteFolderWithConfirm(folder: FolderRow) {
    if (!window.confirm(`Delete folder "${folder.name}" and its maps?`)) return
    void guard(async () => { await deleteFolder(folder.id); await refresh() })
  }

  // The oldest project is the auto-created catch-all where saves land when the
  // user doesn't pick anywhere specific. Its contents make up the "My Maps" home.
  const defaultProject = projects[0] ?? null
  const homeFolders = defaultProject ? folders.filter(f => f.project_id === defaultProject.id) : []
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null
  const activeFolder = folders.find(f => f.id === activeFolderId) ?? null
  // The project shown in the breadcrumb (a folder's own project when drilled
  // in). The default project never appears as a crumb — in the UI it IS the
  // "My Maps" root, not a project.
  const crumbProjectRaw = activeFolder
    ? projects.find(p => p.id === activeFolder.project_id) ?? null
    : activeProject
  const crumbProject = crumbProjectRaw && crumbProjectRaw.id !== defaultProject?.id ? crumbProjectRaw : null

  const gridProps = {
    view,
    thumbUrls,
    onOpen: setViewerMap,
    onRenameRequest: (m: SavedMap) => setNameDialog({
      title: 'Rename map', initial: m.name, submitLabel: 'Rename',
      onSubmit: name => void guard(async () => { await renameSavedMap(m.id, name); await refresh() }),
    }),
    onMoveRequest: setMovingMap,
    onChanged: refresh,
    guard,
  }

  function folderItem(f: FolderRow) {
    const itemProps = {
      folder: f,
      count: maps.filter(m => m.folder_id === f.id).length,
      onOpen: () => openFolder(f),
      onRenameRequest: () => renameFolderDialog(f),
      onMoveRequest: () => setMovingFolder(f),
      onDelete: () => deleteFolderWithConfirm(f),
    }
    return view === 'grid' ? <FolderCard key={f.id} {...itemProps} /> : <FolderListRow key={f.id} {...itemProps} />
  }

  // Section container class matching the active view mode.
  const sectionClass = view === 'grid'
    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'
    : 'flex flex-col gap-1'

  // Home ("My Maps") = the inside of the default project: loose maps on top,
  // folders in their own row below, then the real projects as cards. Maps
  // inside folders/projects never repeat here.
  function renderHomeContents() {
    const looseMaps = defaultProject
      ? maps.filter(m => m.project_id === defaultProject.id && m.folder_id === null)
      : []
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-end">
          <button type="button" onClick={handleNewFolderInAllMaps}
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer">
            <FolderPlus size={13} /> New folder
          </button>
        </div>

        {looseMaps.length > 0 && <MapGrid maps={looseMaps} {...gridProps} />}

        {homeFolders.length > 0 && (
          <div className={sectionClass}>
            {homeFolders.map(folderItem)}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Projects</h3>
          <div className={sectionClass}>
            {projects.filter(p => p.id !== defaultProject?.id).map(p => {
              const itemProps = {
                project: p,
                count: maps.filter(m => m.project_id === p.id).length,
                onOpen: () => openProject(p.id),
              }
              return view === 'grid'
                ? <ProjectCard key={p.id} {...itemProps} />
                : <ProjectListRow key={p.id} {...itemProps} />
            })}
            {view === 'grid' ? (
              <button type="button" onClick={handleNewProject}
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:border-sky-600 hover:text-sky-400 cursor-pointer transition-colors aspect-[3/2.4]">
                <Plus size={18} />
                <span className="text-xs">New project</span>
              </button>
            ) : (
              <button type="button" onClick={handleNewProject}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800/60 hover:text-sky-400 cursor-pointer transition-colors">
                <Plus size={14} /> New project
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Project root: loose maps on top, folders in their own row below — same
  // layout as the My Maps home.
  function renderProjectContents(project: Project) {
    const projectFolders = folders.filter(f => f.project_id === project.id)
    const projectMaps = maps.filter(m => m.project_id === project.id)
    const rootMaps = projectMaps.filter(m => m.folder_id === null)
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-end">
          <button type="button" onClick={() => handleNewFolder(project.id)}
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer">
            <FolderPlus size={13} /> New folder
          </button>
        </div>

        {rootMaps.length > 0 && <MapGrid maps={rootMaps} {...gridProps} />}

        {projectFolders.length > 0 && (
          <div className={sectionClass}>
            {projectFolders.map(folderItem)}
          </div>
        )}

        {projectMaps.length === 0 && projectFolders.length === 0 && (
          <p className="text-sm text-slate-500">No saved maps here yet. Build a map and click Save.</p>
        )}
      </div>
    )
  }

  function renderFolderContents(folder: FolderRow) {
    const folderMaps = maps.filter(m => m.folder_id === folder.id)
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => renameFolderDialog(folder)}
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer">
            <Pencil size={13} /> Rename folder
          </button>
          <button type="button" onClick={() => setMovingFolder(folder)}
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer">
            <FolderInput size={13} /> Move folder
          </button>
          <button type="button" onClick={() => deleteFolderWithConfirm(folder)}
            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 hover:text-red-300 cursor-pointer">
            <Trash2 size={13} /> Delete folder
          </button>
        </div>
        {folderMaps.length > 0
          ? <MapGrid maps={folderMaps} {...gridProps} />
          : <p className="text-sm text-slate-500">No maps in this folder yet. Save a map into it, or move one here.</p>}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,64rem)] h-[min(86vh,44rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
            <span className="font-semibold text-base">All Maps</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>

          {error && <div className="mx-6 mt-3 rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">{error}</div>}

          <div className="flex min-h-0 flex-1">
            {/* Sidebar: home + projects, each expandable to its folders */}
            <div className="w-56 shrink-0 border-r border-slate-700/60 flex flex-col">
              <div className="px-2 pt-2 flex flex-col gap-0.5">
                <button type="button" onClick={() => { openProject(null); toggleExpanded(HOME_KEY) }}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm cursor-pointer ${(activeProjectId === null || activeProjectId === defaultProject?.id) && !activeFolder ? 'bg-sky-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                  <ChevronRight size={12}
                    className={`shrink-0 transition-transform ${homeFolders.length > 0 ? (expanded.has(HOME_KEY) ? 'rotate-90' : '') : 'opacity-0'}`} />
                  <LayoutGrid size={14} className="shrink-0" /> My Maps
                </button>
                {expanded.has(HOME_KEY) && homeFolders.map(f => (
                  <SidebarFolderRow key={f.id} folder={f} active={activeFolderId === f.id} onSelect={() => openFolder(f)} />
                ))}
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Projects</span>
                <button type="button" onClick={handleNewProject} title="New project"
                  className="p-1 rounded text-sky-400 hover:bg-slate-800 cursor-pointer"><Plus size={14} /></button>
              </div>
              <div className="overflow-y-auto flex-1 px-2 pb-2 flex flex-col gap-1">
                {/* The default project is not listed — in the UI it IS "My Maps". */}
                {projects.filter(p => p.id !== defaultProject?.id).map(p => {
                  const projectFolders = folders.filter(f => f.project_id === p.id)
                  return (
                    <div key={p.id} className="flex flex-col gap-0.5">
                      <ProjectRow project={p} active={p.id === activeProjectId && !activeFolder}
                        expanded={expanded.has(p.id)} hasFolders={projectFolders.length > 0}
                        onSelect={() => { openProject(p.id); toggleExpanded(p.id) }}
                        onRenameRequest={() => setNameDialog({
                          title: 'Rename project', initial: p.name, submitLabel: 'Rename',
                          onSubmit: name => void guard(async () => { await renameProject(p.id, name); await refresh() }),
                        })}
                        onDelete={() => guard(async () => { await deleteProject(p.id); await refresh() })} />
                      {expanded.has(p.id) && projectFolders.map(f => (
                        <SidebarFolderRow key={f.id} folder={f} active={activeFolderId === f.id} onSelect={() => openFolder(f)} />
                      ))}
                    </div>
                  )
                })}
                {!loading && projects.filter(p => p.id !== defaultProject?.id).length === 0 && (
                  <p className="px-2 py-3 text-xs text-slate-500">No projects yet. Create one to organize maps.</p>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Breadcrumb: current location, with parent segments clickable */}
              <div className="flex items-center gap-2 px-4 pt-3 pb-2 text-sm border-b border-slate-700/40 shrink-0 min-w-0">
                {crumbProject ? (
                  activeFolder ? (
                    <button type="button" onClick={() => openProject(crumbProject.id)}
                      className="inline-flex min-w-0 items-center gap-1.5 text-slate-400 hover:text-white cursor-pointer transition-colors">
                      <Layers size={13} className="shrink-0 text-sky-400" />
                      <span className="truncate">{crumbProject.name}</span>
                    </button>
                  ) : (
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-slate-200">
                      <Layers size={13} className="shrink-0 text-sky-400" />
                      <span className="truncate">{crumbProject.name}</span>
                    </span>
                  )
                ) : activeFolder ? (
                  <button type="button" onClick={() => openProject(null)}
                    className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white cursor-pointer transition-colors">
                    <LayoutGrid size={13} className="shrink-0" />
                    My Maps
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                    <LayoutGrid size={13} className="shrink-0 text-slate-400" />
                    My Maps
                  </span>
                )}
                {activeFolder && (
                  <>
                    <ChevronRight size={14} className="shrink-0 text-slate-500" />
                    <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-slate-200">
                      <Folder size={13} className="shrink-0 text-amber-400" />
                      <span className="truncate">{activeFolder.name}</span>
                    </span>
                  </>
                )}
                <div className="ml-auto flex items-center gap-0.5">
                  <button type="button" title="Grid view" onClick={() => setViewMode('grid')}
                    className={`rounded p-1 cursor-pointer transition-colors ${view === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                    <LayoutGrid size={14} />
                  </button>
                  <button type="button" title="List view" onClick={() => setViewMode('list')}
                    className={`rounded p-1 cursor-pointer transition-colors ${view === 'list' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                    <List size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
              ) : activeFolder ? (
                renderFolderContents(activeFolder)
              ) : activeProjectId === null || activeProjectId === defaultProject?.id ? (
                renderHomeContents()
              ) : activeProject ? (
                renderProjectContents(activeProject)
              ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {viewerMap && (
        <MapViewer map={viewerMap} onClose={() => setViewerMap(null)} onOpenInBuilder={() => onLoadMap(viewerMap)} />
      )}
      {nameDialog && (
        <NameModal title={nameDialog.title} initial={nameDialog.initial} submitLabel={nameDialog.submitLabel}
          onClose={() => setNameDialog(null)} onSubmit={nameDialog.onSubmit} />
      )}
      {movingMap && (
        <MoveModal title={`Move "${movingMap.name}"`}
          projects={projects} folders={folders} defaultProjectId={defaultProject?.id}
          current={{ projectId: movingMap.project_id, folderId: movingMap.folder_id }}
          pickFolder
          onClose={() => setMovingMap(null)}
          onMove={target => {
            const map = movingMap
            setMovingMap(null)
            void guard(async () => { await moveMap(map.id, target); await refresh() })
          }} />
      )}
      {movingFolder && (
        <MoveModal title={`Move folder "${movingFolder.name}"`}
          projects={projects} folders={[]} defaultProjectId={defaultProject?.id}
          current={{ projectId: movingFolder.project_id, folderId: null }}
          pickFolder={false}
          onClose={() => setMovingFolder(null)}
          onMove={target => {
            const folder = movingFolder
            setMovingFolder(null)
            void guard(async () => { await moveFolder(folder.id, target.projectId); await refresh() })
          }} />
      )}
    </>
  )
}

function ProjectRow({ project, active, expanded, hasFolders, onSelect, onRenameRequest, onDelete }: {
  project: Project; active: boolean; expanded: boolean; hasFolders: boolean
  onSelect: () => void; onRenameRequest: () => void; onDelete: () => void
}) {
  return (
    <div className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm cursor-pointer ${active ? 'bg-sky-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
      onClick={onSelect}>
      <ChevronRight size={12}
        className={`shrink-0 transition-transform ${hasFolders ? (expanded ? 'rotate-90' : '') : 'opacity-0'}`} />
      <span className="flex-1 truncate">{project.name}</span>
      <button type="button" title="Rename" onClick={e => { e.stopPropagation(); onRenameRequest() }}
        className="rounded p-1 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><Pencil size={12} /></button>
      <button type="button" title="Delete" onClick={e => { e.stopPropagation(); if (window.confirm(`Delete project "${project.name}" and all its maps?`)) onDelete() }}
        className="rounded p-1 opacity-0 group-hover:opacity-100 hover:text-red-300 hover:bg-slate-600 cursor-pointer transition-colors"><Trash2 size={12} /></button>
    </div>
  )
}

function SidebarFolderRow({ folder, active, onSelect }: {
  folder: FolderRow; active: boolean; onSelect: () => void
}) {
  return (
    <button type="button" onClick={onSelect}
      className={`flex w-full items-center gap-1.5 rounded py-1 pl-7 pr-2 text-xs cursor-pointer ${active ? 'bg-sky-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
      <Folder size={11} className="shrink-0 text-amber-400" />
      <span className="truncate">{folder.name}</span>
    </button>
  )
}

// Projects render as calm tinted cards — a large icon, no thumbnails.
function ProjectCard({ project, count, onOpen }: {
  project: Project; count: number; onOpen: () => void
}) {
  return (
    <button type="button" onClick={onOpen} title={`Open project "${project.name}"`}
      className="group rounded-lg border border-sky-500/20 bg-sky-400/10 hover:bg-sky-400/20 overflow-hidden text-left cursor-pointer transition-colors">
      <div className="aspect-[3/2] flex items-center justify-center">
        <Layers size={38} className="text-sky-400/80" strokeWidth={1.5} />
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="truncate text-xs font-medium text-sky-100">{project.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-sky-200/50">{count}</span>
      </div>
    </button>
  )
}

// Folders look like folders: a solid folder glyph on a light amber card.
function FolderCard({ folder, count, onOpen, onRenameRequest, onMoveRequest, onDelete }: {
  folder: FolderRow; count: number
  onOpen: () => void; onRenameRequest: () => void
  onMoveRequest: () => void; onDelete: () => void
}) {
  return (
    <div className="group relative rounded-lg border border-amber-500/20 bg-amber-400/10 hover:bg-amber-400/20 overflow-hidden transition-colors">
      <button type="button" onClick={onOpen} className="block w-full text-left cursor-pointer" title={`Open folder "${folder.name}"`}>
        <div className="aspect-[3/2] flex items-center justify-center">
          <Folder size={38} className="text-amber-400/80" fill="currentColor" strokeWidth={1} />
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="truncate text-xs font-medium text-amber-100">{folder.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-amber-200/50">{count}</span>
        </div>
      </button>
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" title="Move folder" onClick={onMoveRequest}
          className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><FolderInput size={12} /></button>
        <button type="button" title="Rename folder" onClick={onRenameRequest}
          className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><Pencil size={12} /></button>
        <button type="button" title="Delete folder" onClick={onDelete}
          className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-red-300 hover:bg-slate-600 cursor-pointer transition-colors"><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

function MapGrid({ maps, view, thumbUrls, onOpen, onRenameRequest, onMoveRequest, onChanged, guard }: {
  maps: SavedMap[]
  view: ViewMode
  thumbUrls: Record<string, string>
  onOpen: (map: SavedMap) => void
  onRenameRequest: (map: SavedMap) => void
  onMoveRequest: (map: SavedMap) => void
  onChanged: () => void
  guard: (fn: () => Promise<void>) => Promise<void>
}) {
  const items = maps.map(m => {
    const itemProps = {
      map: m,
      thumb: m.thumbnail_path ? thumbUrls[m.thumbnail_path] : undefined,
      onOpen: () => onOpen(m),
      onRenameRequest: () => onRenameRequest(m),
      onMoveRequest: () => onMoveRequest(m),
      onDelete: () => guard(async () => { await deleteSavedMap(m); onChanged() }),
      onError: (msg: string) => guard(async () => { throw new Error(msg) }),
    }
    return view === 'grid' ? <MapCard key={m.id} {...itemProps} /> : <MapListRow key={m.id} {...itemProps} />
  })
  return view === 'grid'
    ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items}</div>
    : <div className="flex flex-col gap-1">{items}</div>
}

// Download the owner's own full-res PNG (fetched with auth, never a public URL).
async function downloadMapPng(map: SavedMap): Promise<void> {
  if (!map.image_path) throw new Error('This map has no stored image to download.')
  const blob = await downloadImageBlob(map.image_path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${map.name || 'map'}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type MapItemProps = {
  map: SavedMap; thumb?: string
  onOpen: () => void; onRenameRequest: () => void; onMoveRequest: () => void
  onDelete: () => void
  onError: (msg: string) => void
}

// The shared per-map action buttons (share link, download, move, rename, delete).
function MapActions({ map, onRenameRequest, onMoveRequest, onDelete, onError }: Omit<MapItemProps, 'thumb' | 'onOpen'>) {
  const [copied, setCopied] = useState(false)

  // "Share" a saved map = share its recipe (a text URL that regenerates it). The
  // stored image itself stays private; there is no public link to it.
  function handleCopyLink() {
    const url = recipeShareUrl(map.recipe as unknown as MapRecipe)
    if (!url) { onError('This map is missing data needed to build a share link.'); return }
    navigator.clipboard.writeText(url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
      () => onError('Could not copy the share link to the clipboard.'),
    )
  }

  return (
    <>
      <button type="button" title={copied ? 'Link copied' : 'Copy share link (regenerates this map)'} onClick={handleCopyLink}
        className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors">{copied ? <Check size={12} className="text-emerald-400" /> : <Link2 size={12} />}</button>
      <button type="button" title="Download PNG" onClick={() => downloadMapPng(map).catch(err => onError(err instanceof Error ? err.message : String(err)))}
        className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><Download size={12} /></button>
      <button type="button" title="Move" onClick={onMoveRequest}
        className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><FolderInput size={12} /></button>
      <button type="button" title="Rename" onClick={onRenameRequest}
        className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><Pencil size={12} /></button>
      <button type="button" title="Delete" onClick={() => { if (window.confirm(`Delete "${map.name}"?`)) onDelete() }}
        className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-red-300 hover:bg-slate-600 cursor-pointer transition-colors"><Trash2 size={12} /></button>
    </>
  )
}

// Square corners on purpose: maps are "files", visually distinct from the
// rounded, tinted folder/project cards.
function MapCard({ map, thumb, onOpen, onRenameRequest, onMoveRequest, onDelete, onError }: MapItemProps) {
  return (
    <div className="group relative border border-slate-700 bg-slate-950/40 overflow-hidden">
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer" title={map.name}>
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
        <MapActions map={map} onRenameRequest={onRenameRequest} onMoveRequest={onMoveRequest}
          onDelete={onDelete} onError={onError} />
      </div>
    </div>
  )
}

// List view: icon-sized rows matching folders/projects — full name, saved date.
function MapListRow({ map, onOpen, onRenameRequest, onMoveRequest, onDelete, onError }: MapItemProps) {
  return (
    <div className="group flex items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-800/60 transition-colors">
      <button type="button" onClick={onOpen} title={map.name}
        className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
        <MapIcon size={15} className="shrink-0 text-slate-400" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{map.name}</span>
        <span className="shrink-0 text-[10px] text-slate-500">{new Date(map.created_at).toLocaleDateString()}</span>
      </button>
      <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <MapActions map={map} onRenameRequest={onRenameRequest} onMoveRequest={onMoveRequest}
          onDelete={onDelete} onError={onError} />
      </div>
    </div>
  )
}

function FolderListRow({ folder, count, onOpen, onRenameRequest, onMoveRequest, onDelete }: {
  folder: FolderRow; count: number
  onOpen: () => void; onRenameRequest: () => void
  onMoveRequest: () => void; onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-800/60 transition-colors">
      <button type="button" onClick={onOpen} title={folder.name}
        className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">
        <Folder size={15} className="shrink-0 text-amber-400" fill="currentColor" strokeWidth={1} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{folder.name}</span>
        <span className="shrink-0 text-[10px] text-slate-500">{count}</span>
      </button>
      <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" title="Move folder" onClick={onMoveRequest}
          className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><FolderInput size={12} /></button>
        <button type="button" title="Rename folder" onClick={onRenameRequest}
          className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-white hover:bg-slate-600 cursor-pointer transition-colors"><Pencil size={12} /></button>
        <button type="button" title="Delete folder" onClick={onDelete}
          className="rounded bg-slate-900/90 p-1.5 text-slate-200 hover:text-red-300 hover:bg-slate-600 cursor-pointer transition-colors"><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

function ProjectListRow({ project, count, onOpen }: {
  project: Project; count: number; onOpen: () => void
}) {
  return (
    <button type="button" onClick={onOpen} title={`Open project "${project.name}"`}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left cursor-pointer hover:bg-slate-800/60 transition-colors">
      <Layers size={15} className="shrink-0 text-sky-400" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{project.name}</span>
      <span className="shrink-0 text-[10px] text-slate-500">{count}</span>
    </button>
  )
}

// Small pop-up for relocating a map (project then optional folder) or a whole
// folder (project only). Rendered above the library modal.
function MoveModal({ title, projects, folders, defaultProjectId, current, pickFolder, onClose, onMove }: {
  title: string
  projects: Project[]
  folders: FolderRow[]
  defaultProjectId?: string
  current: MoveTarget
  pickFolder: boolean
  onClose: () => void
  onMove: (target: MoveTarget) => void
}) {
  const [projectId, setProjectId] = useState(current.projectId)
  const [folderId, setFolderId] = useState(current.folderId ?? '')
  const projectFolders = folders.filter(f => f.project_id === projectId)
  const unchanged = projectId === current.projectId && (folderId || null) === current.folderId

  function handleProjectChange(id: string) {
    setProjectId(id)
    setFolderId(id === current.projectId ? current.folderId ?? '' : '')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (unchanged) return
    onMove({ projectId, folderId: folderId || null })
  }

  const fieldClass = 'w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500'
  const labelClass = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <form onSubmit={handleSubmit}
          className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,22rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700">
            <span className="truncate font-semibold text-sm">{title}</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Move to</span>
              <select value={projectId} onChange={e => handleProjectChange(e.target.value)}
                className={`${fieldClass} cursor-pointer`}>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.id === defaultProjectId ? 'My Maps' : p.name}</option>
                ))}
              </select>
            </label>

            {pickFolder && (
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Folder</span>
                <select value={folderId} onChange={e => setFolderId(e.target.value)}
                  disabled={projectFolders.length === 0}
                  className={`${fieldClass} cursor-pointer disabled:opacity-50`}>
                  <option value="">— No folder —</option>
                  {projectFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={unchanged}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer transition-colors">
              <FolderInput size={13} /> Move
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// Full-size viewer for the stored PNG. Nothing regenerates: the image is the
// exact render saved to object storage, fetched via a short-lived signed URL.
// The frame has fixed dimensions so the buttons don't jump when the image
// arrives (or fails).
function MapViewer({ map, onClose, onOpenInBuilder }: {
  map: SavedMap; onClose: () => void; onOpenInBuilder: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!map.image_path) { setError('This map has no stored image. Open it in the builder to regenerate it.'); return }
    let active = true
    signedUrl(map.image_path).then(
      u => { if (active) setUrl(u) },
      err => { if (active) setError(err instanceof Error ? err.message : String(err)) },
    )
    return () => { active = false }
  }, [map.image_path])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="truncate text-sm font-medium text-slate-100">{map.name}</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="relative h-[min(70vh,42rem)] w-[min(92vw,64rem)] overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-red-300">{error}</div>
            ) : url ? (
              <img src={url} alt={map.name} className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 animate-pulse">
                Loading full-size map…
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => downloadMapPng(map).catch(err => setError(err instanceof Error ? err.message : String(err)))}
              className="inline-flex items-center gap-1.5 rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors">
              <Download size={13} /> Download PNG
            </button>
            <button type="button" onClick={onOpenInBuilder}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 cursor-pointer transition-colors">
              <SlidersHorizontal size={13} /> Open in builder
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
