import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X, Save } from 'lucide-react'
import { useAuth } from '../auth/authContext'
import {
  createFolder, createProject, listFolders, listProjects,
  type Folder, type Project,
} from '../lib/library'

// Where a map gets saved. Every map lives in a project at the data level; the
// oldest project is the auto-created default that the UI presents as "My
// Maps" (loose files, never shown as a project). Remembered by the app between
// saves so repeat saves into the same place are a single confirm.
export type SaveTarget = { projectId: string; folderId: string | null }

// Sentinel select values — real ids are UUIDs so these can't collide.
const ALL_MAPS = '__all_maps__'
const NEW = '__new__'
const NONE = ''

export function SaveMapModal({ suggestedName, initialTarget, onClose, onSave }: {
  suggestedName: string
  initialTarget: SaveTarget | null
  onClose: () => void
  // Performs the actual save; thrown errors render inside the modal.
  onSave: (input: { name: string; target: SaveTarget }) => Promise<void>
}) {
  const { user } = useAuth()
  const [name, setName] = useState(suggestedName)
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [destination, setDestination] = useState<string>(ALL_MAPS)
  const [folderId, setFolderId] = useState<string>(NONE)
  const [newProjectName, setNewProjectName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // The default project backing "My Maps" (oldest; may not exist yet on a
  // brand-new account — it gets created on first save).
  const defaultProject = projects[0] ?? null
  const realProjects = projects.slice(1)

  useEffect(() => {
    nameRef.current?.select()
  }, [])

  // Load projects once; pre-select the remembered target when it still exists,
  // otherwise "My Maps".
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const rows = await listProjects()
        if (!active) return
        setProjects(rows)
        const remembered = initialTarget && rows.slice(1).some(p => p.id === initialTarget.projectId)
          ? initialTarget.projectId
          : ALL_MAPS
        setDestination(remembered)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load folders for the selected destination; pre-select the remembered
  // folder. "My Maps" folders live in the backing default project (none yet
  // on a brand-new account).
  useEffect(() => {
    const projectId = destination === ALL_MAPS ? defaultProject?.id : destination
    if (!projectId || destination === NEW) {
      setFolders([])
      setFolderId(NONE)
      return
    }
    let active = true
    ;(async () => {
      try {
        const rows = await listFolders(projectId)
        if (!active) return
        setFolders(rows)
        const remembered = initialTarget?.projectId === projectId
          && initialTarget.folderId
          && rows.some(f => f.id === initialTarget.folderId)
          ? initialTarget.folderId
          : NONE
        setFolderId(remembered)
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, defaultProject?.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || saving || loading) return
    const trimmedName = name.trim()
    if (!trimmedName) { setError('Enter a map name.'); return }
    setSaving(true)
    setError(null)
    try {
      let targetProjectId: string
      if (destination === ALL_MAPS) {
        // First-ever save on this account creates the backing default project.
        targetProjectId = defaultProject?.id ?? (await createProject(user.id, 'My Maps')).id
      } else if (destination === NEW) {
        const projectName = newProjectName.trim()
        if (!projectName) throw new Error('Enter a project name.')
        targetProjectId = (await createProject(user.id, projectName)).id
      } else {
        targetProjectId = destination
      }
      let targetFolderId: string | null = folderId === NONE || folderId === NEW ? null : folderId
      if (folderId === NEW) {
        const folderName = newFolderName.trim()
        if (!folderName) throw new Error('Enter a folder name.')
        targetFolderId = (await createFolder(user.id, targetProjectId, folderName)).id
      }
      await onSave({ name: trimmedName, target: { projectId: targetProjectId, folderId: targetFolderId } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const fieldClass = 'w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500'
  const labelClass = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
        <form onSubmit={handleSubmit}
          className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,26rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <span className="font-semibold text-base">Save map</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>

          {error && <div className="mx-6 mt-3 rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">{error}</div>}

          <div className="flex flex-col gap-4 px-6 py-4">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Map name</span>
              <input ref={nameRef} type="text" value={name} onChange={e => setName(e.target.value)}
                className={fieldClass} />
            </label>

            {/* Both selects render from the start (disabled while loading) and
                conditional inputs stay hidden until loading settles, so the
                modal keeps a stable height — no flash / button jump on open. */}
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Save to</span>
              <select value={destination} onChange={e => setDestination(e.target.value)} disabled={loading}
                className={`${fieldClass} cursor-pointer disabled:opacity-50`}>
                <option value={ALL_MAPS}>My Maps</option>
                {realProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value={NEW}>+ New project…</option>
              </select>
            </label>
            {!loading && destination === NEW && (
              <input type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                placeholder="Project name" className={fieldClass} />
            )}

            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Folder</span>
              <select value={folderId} onChange={e => setFolderId(e.target.value)} disabled={loading}
                className={`${fieldClass} cursor-pointer disabled:opacity-50`}>
                <option value={NONE}>— No folder —</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                {!loading && <option value={NEW}>+ New folder…</option>}
              </select>
            </label>
            {!loading && folderId === NEW && (
              <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name" className={fieldClass} />
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer transition-colors">
              <Save size={13} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
