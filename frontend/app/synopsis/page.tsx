import type { Metadata } from 'next'
import Link from 'next/link'
import { bylineDate, displayHeadline, leadImagePath, listPublishedPosts, resolvePostImage } from '../../lib/posts'
import { EditorLink } from './EditorLink'
import { PageShell } from '../../ui/PageShell'

export const metadata: Metadata = {
  title: 'The Synopsis — PyRe Weather',
  description:
    'Weather stories and case studies: historical events explained with reanalysis maps you can explore yourself.',
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
          {posts.map(p => {
            const thumb = leadImagePath(p.body_md, p.slug)
            // The whole card links to the post via a stretched headline link,
            // so the admin Edit control can sit in normal flow (a nested <a>
            // would be invalid) and still be clickable above the overlay.
            return (
              <div
                key={p.slug}
                className="relative flex gap-5 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-5 transition-all hover:-translate-y-0.5 hover:border-sky-500/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-wide text-sky-300/80">{bylineDate(p)}</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-100">
                    <Link href={`/synopsis/${p.slug}/`} className="after:absolute after:inset-0">
                      {displayHeadline(p)}
                    </Link>
                  </h2>
                  {p.description && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">{p.description}</p>
                  )}
                  <div className="relative z-10 mt-3 empty:mt-0">
                    <EditorLink postId={p.id} />
                  </div>
                </div>
                {thumb && (
                  <img
                    src={resolvePostImage(thumb)}
                    alt=""
                    loading="lazy"
                    className="hidden h-24 w-36 shrink-0 self-center rounded-lg object-cover sm:block"
                  />
                )}
              </div>
            )
          })}
        </div>
      </PageShell>
    </div>
  )
}
