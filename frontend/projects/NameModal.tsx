import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'

// Small name-entry dialog replacing window.prompt for creating/renaming
// projects, folders, and maps. Rendered above the library modal (z-40/50),
// hence the higher z indices.
export function NameModal({ title, initial = '', submitLabel = 'Create', onClose, onSubmit }: {
  title: string
  initial?: string
  submitLabel?: string
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <form onSubmit={handleSubmit}
          className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-2xl w-[min(96vw,20rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700">
            <span className="font-semibold text-sm">{title}</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="px-5 py-4">
            <input ref={inputRef} type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500" />
          </div>
          <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-700">
            <button type="button" onClick={onClose}
              className="rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50 cursor-pointer transition-colors">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
