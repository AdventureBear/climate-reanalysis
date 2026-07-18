'use client'

// Draft preview (#36): opened in a new tab by the editor's Preview button.
// The editor hands the current (possibly unsaved) draft over via
// localStorage, so previewing never writes to the database. Rendered with
// the exact components and styling the public post page uses.
import { useEffect, useState } from 'react'
import { PostBody } from '../[slug]/PostBody'
import { PageShell } from '../../../ui/PageShell'
import { Lightbox } from '../[slug]/Lightbox'

type Draft = { title: string; description: string; body: string; at: number }

export default function DraftPreview() {
  const [draft, setDraft] = useState<Draft | null | 'missing'>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('synopsis-preview')
      setDraft(raw ? (JSON.parse(raw) as Draft) : 'missing')
    } catch {
      setDraft('missing')
    }
  }, [])

  if (draft === null) return null
  if (draft === 'missing') {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#16224a] py-24">
        <p className="text-slate-400">Nothing to preview — use the Preview button in the editor.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-[#16224a]">
      <div className="border-b border-amber-900/40 bg-amber-950/30 px-5 py-2 text-center text-xs text-amber-200/80">
        Preview — this is how the post will look. It is not published by viewing this page.
      </div>
      <PageShell>
        <article>
          <div className="text-xs uppercase tracking-wide text-sky-300/80">
            {new Date(draft.at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{draft.title || 'Untitled'}</h1>
          {draft.description && (
            <p className="mt-3 text-lg leading-relaxed text-slate-300">{draft.description}</p>
          )}
          <div className="faq-doc mt-8 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-6 md:p-8">
            <PostBody body={draft.body} />
          </div>
          <Lightbox />
        </article>
      </PageShell>
    </div>
  )
}
