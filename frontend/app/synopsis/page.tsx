import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublishedPosts } from '../../lib/posts'
import { EditorLink } from './EditorLink'
import { PageShell } from '../../ui/PageShell'

export const metadata: Metadata = {
  title: 'The Synopsis — PyRe Weather',
  description:
    'Weather stories and case studies: historical events explained with reanalysis maps you can explore yourself.',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function SynopsisIndex() {
  const posts = await listPublishedPosts()
  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell>
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-white">The Synopsis</h1>
          <EditorLink />
        </div>
        <p className="mt-2 text-base leading-relaxed text-slate-300">
          Weather stories and case studies, told with the maps themselves.
        </p>

        {posts.length === 0 && (
          <p className="mt-10 text-slate-400">No stories yet. Check back soon.</p>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {posts.map(p => (
            <div key={p.slug} className="relative">
              <Link
                href={`/synopsis/${p.slug}/`}
                className="block rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-6 transition-all hover:-translate-y-0.5 hover:border-sky-500/50"
              >
                <div className="text-xs uppercase tracking-wide text-sky-300/80">{formatDate(p.published_at)}</div>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">{p.title}</h2>
                {p.description && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{p.description}</p>
                )}
              </Link>
              <span className="absolute right-4 top-4">
                <EditorLink postId={p.id} />
              </span>
            </div>
          ))}
        </div>
      </PageShell>
    </div>
  )
}
