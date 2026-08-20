import type { Metadata } from 'next'
import { Suspense } from 'react'
import { listPublishedPosts } from '../../lib/posts'
import { EditorLink } from './EditorLink'
import { PageShell } from '../../ui/PageShell'
import { SynopsisPostList } from './SynopsisPostList'

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

        {posts.length > 0 && (
          <Suspense fallback={<p className="mt-8 text-slate-400">Loading stories…</p>}>
            <SynopsisPostList posts={posts} />
          </Suspense>
        )}
      </PageShell>
    </div>
  )
}
