'use client'

// Synopsis editor, posts list (#36): one row per post, click to edit.
// Cool-slate palette: calm gray-blue surfaces, one text tone, muted accents.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../auth/authContext'
import { listAllPosts, type PostRow } from '../../../lib/postsAdmin'
import { EditorGate, statusOf } from './shared'
import { PageShell } from '../../../ui/PageShell'

const STATUS_DOT: Record<string, string> = {
  published: 'bg-emerald-600/80',
  scheduled: 'bg-amber-600/80',
  draft: 'bg-slate-500',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PostsList() {
  const { enabled: authEnabled, user, isAdmin } = useAuth()
  const [posts, setPosts] = useState<PostRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ready = authEnabled && user && isAdmin

  useEffect(() => {
    if (!ready) return
    listAllPosts().then(setPosts).catch(e => setError(String(e.message ?? e)))
  }, [ready])

  if (!authEnabled) return <EditorGate msg="Accounts are not configured." />
  if (!user) return <EditorGate msg="Sign in (header) to use the editor." />
  if (!isAdmin) return <EditorGate msg="The Synopsis editor is admin-only." />

  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell>
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-slate-200">Posts</h1>
          <Link href="/synopsis/editor/edit/"
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700">
            New post
          </Link>
        </div>

        {error && <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300/90">{error}</p>}
        {!error && posts === null && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
        {posts?.length === 0 && <p className="mt-6 text-sm text-slate-500">No posts yet — start with New post.</p>}

        <ul className="mt-5 divide-y divide-[#2e4278]/40 rounded-lg border border-[#2e4278]/60 bg-[#1b2a55]/70">
          {posts?.map(p => {
            const st = statusOf(p)
            return (
              <li key={p.id}>
                <Link href={`/synopsis/editor/edit/?id=${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#22335f]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[st]}`} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-slate-300">{p.title}</span>
                  <span className="shrink-0 text-xs capitalize text-slate-500">{st}</span>
                  <span className="w-28 shrink-0 text-right text-xs text-slate-500">
                    {formatDate(p.published_at ?? p.publish_at ?? p.updated_at)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </PageShell>
    </div>
  )
}
