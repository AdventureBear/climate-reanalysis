'use client'

// BlockNote needs the browser (it touches window during setup), so the
// editor loads client-side only; the static export ships a shell for this
// route and the editor appears on mount.
import dynamic from 'next/dynamic'

const EditorApp = dynamic(() => import('./EditorApp'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[#16224a] py-24">
      <p className="text-slate-400">Loading editor…</p>
    </div>
  ),
})

export default function EditPostPage() {
  return <EditorApp />
}
