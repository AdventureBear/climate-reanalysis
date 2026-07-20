'use client'

// New AFD (#76): generate a Synopsis post from an Area Forecast Discussion.
// Pick a date and issuance, click Generate — the backend fetches that day's
// discussion, writes the post, renders the maps, and saves an unpublished
// draft. This page polls until the draft exists, then links to the editor.
// An AFD post is a historical forecast: the discussion as issued, with maps
// of the setup on that same day (dates are pinned server-side).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../auth/authContext'
import { EditorGate } from '../shared'
import { PageShell } from '../../../ui/PageShell'
import { API_BASE } from '../../../lib/api'
import { listAllPosts } from '../../../lib/postsAdmin'
import { supabase } from '../../../lib/supabase'

// Newest allowed day: reanalysis data lags real time by ~2 days.
function newestAllowed(): string {
  const d = new Date(Date.now() - 2 * 24 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

type RunState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; slug: string; startedAt: number }
  | { phase: 'done'; slug: string; postId: string }
  | { phase: 'error'; message: string }

export default function NewAfdPage() {
  const { enabled: authEnabled, user, isAdmin } = useAuth()
  const [date, setDate] = useState(newestAllowed())
  const [issuance, setIssuance] = useState<'morning' | 'afternoon'>('morning')
  const [run, setRun] = useState<RunState>({ phase: 'idle' })

  // Poll for the draft once a run starts; the backend told us its slug.
  useEffect(() => {
    if (run.phase !== 'running') return
    const timer = setInterval(async () => {
      const posts = await listAllPosts().catch(() => [])
      const hit = posts.find(
        p => p.slug === run.slug &&
          new Date(p.updated_at).getTime() >= run.startedAt - 60_000,
      )
      if (hit) {
        setRun({ phase: 'done', slug: run.slug, postId: hit.id })
      } else if (Date.now() - run.startedAt > 12 * 60_000) {
        setRun({
          phase: 'error',
          message: 'No draft appeared after 12 minutes — check the backend logs.',
        })
      }
    }, 10_000)
    return () => clearInterval(timer)
  }, [run])

  if (!authEnabled) return <EditorGate msg="Accounts are not configured." />
  if (!user) return <EditorGate msg="Sign in (header) to use admin tools." />
  if (!isAdmin) return <EditorGate msg="Admin only." />

  async function generate() {
    if (!supabase) return
    setRun({ phase: 'starting' })
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) {
      setRun({ phase: 'error', message: 'No session — sign in again.' })
      return
    }
    const startedAt = Date.now()
    try {
      const resp = await fetch(`${API_BASE}/api/synopsis/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: date.replaceAll('-', ''), issuance }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setRun({ phase: 'error', message: payload.detail ?? `HTTP ${resp.status}` })
        return
      }
      setRun({ phase: 'running', slug: payload.slug, startedAt })
    } catch (e) {
      setRun({ phase: 'error', message: String(e) })
    }
  }

  const busy = run.phase === 'starting' || run.phase === 'running'

  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell>
        <h1 className="text-xl font-semibold text-slate-200">New AFD post</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Generates a draft from the NWS Area Forecast Discussion for the day you pick —
          the discussion as issued, with maps of that day&apos;s setup. The draft appears
          under All Posts; nothing publishes without you.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Discussion date
            <input
              type="date"
              value={date}
              max={newestAllowed()}
              onChange={e => setDate(e.target.value)}
              className="h-9 rounded-md border border-slate-600 bg-slate-800 px-2.5 text-sm text-slate-200"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Issuance
            <select
              value={issuance}
              onChange={e => setIssuance(e.target.value as 'morning' | 'afternoon')}
              className="h-9 rounded-md border border-slate-600 bg-slate-800 px-2.5 text-sm text-slate-200"
            >
              <option value="morning">Morning (~4 AM ET)</option>
              <option value="afternoon">Afternoon (~4 PM ET)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="h-9 rounded-md border border-sky-700 bg-sky-900/60 px-4 text-sm text-sky-200 transition-colors hover:bg-sky-800/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>

        <div className="mt-5 text-sm">
          {run.phase === 'starting' && <p className="text-slate-400">Starting…</p>}
          {run.phase === 'running' && (
            <p className="text-slate-400">
              Started. Writing the post and rendering maps takes 2–4 minutes; this page
              checks every few seconds. You can also find it later under All Posts.
            </p>
          )}
          {run.phase === 'done' && (
            <p className="text-emerald-300/90">
              Draft ready —{' '}
              <Link href={`/admin/post/?id=${run.postId}`} className="underline hover:text-emerald-200">
                open it in the editor
              </Link>
              .
            </p>
          )}
          {run.phase === 'error' && <p className="text-red-300/90">{run.message}</p>}
        </div>
      </PageShell>
    </div>
  )
}
