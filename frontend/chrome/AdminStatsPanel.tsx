import { useEffect, useState } from 'react'
import { BarChart3, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type DayCount = { day: string; count: number }
type VisitorDay = {
  day: string
  visitors: number
  anon_visitors: number
  signed_in_visitors: number
  median_renders: number
  max_renders: number
}
type TopItem = { value: string; count: number }
type UserRow = {
  id: string
  email: string | null
  display_name: string | null
  tier: string | null
  is_admin: boolean
  created_at: string
  maps_count: number
  last_map_at: string | null
  storage_bytes: number
}
type Stats = {
  totals: { users: number; maps: number; projects: number; requests?: number; storage_bytes: number }
  signups_by_day: DayCount[]
  maps_by_day: DayCount[]
  // Anonymous map_requests counter; absent until the map_requests migrations
  // are applied, so the panel tolerates undefined.
  requests_by_day?: DayCount[]
  // Visitor analytics (#14); absent until its migration is applied.
  visitors_by_day?: VisitorDay[]
  top_variables?: TopItem[]
  top_regions?: TopItem[]
  top_modes?: TopItem[]
  users: UserRow[]
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Fill the last 30 days so quiet days render as gaps, not missing bars.
function last30Days(counts: DayCount[]): DayCount[] {
  const byDay = new Map(counts.map(c => [c.day, c.count]))
  const out: DayCount[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push({ day: key, count: byDay.get(key) ?? 0 })
  }
  return out
}

function MiniBars({ title, counts }: { title: string; counts: DayCount[] }) {
  const days = last30Days(counts)
  const max = Math.max(1, ...days.map(d => d.count))
  const total = days.reduce((s, d) => s + d.count, 0)
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</span>
        <span className="text-xs text-slate-300">{total} in 30 days</span>
      </div>
      <div className="flex h-16 items-end gap-[2px]">
        {days.map(d => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-sm ${d.count > 0 ? 'bg-sky-500' : 'bg-slate-800'}`}
              style={{ height: `${d.count > 0 ? Math.max(8, (d.count / max) * 100) : 4}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 group-hover:block">
              {formatDay(d.day)}: {d.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Unique visitors per day: stacked bars (anonymous + signed-in), with the
// per-visitor render distribution (median/max — the abuse radar) on hover.
function VisitorBars({ days }: { days: VisitorDay[] }) {
  const byDay = new Map(days.map(d => [d.day, d]))
  const filled: VisitorDay[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    filled.push(byDay.get(key) ?? { day: key, visitors: 0, anon_visitors: 0, signed_in_visitors: 0, median_renders: 0, max_renders: 0 })
  }
  const max = Math.max(1, ...filled.map(d => d.visitors))
  const total = filled.reduce((s, d) => s + d.visitors, 0)
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Unique visitors per day</span>
        <span className="text-xs text-slate-300">
          {total} visitor-days in 30
          <span className="ml-2 inline-block h-2 w-2 rounded-sm bg-sky-500" /> anon
          <span className="ml-2 inline-block h-2 w-2 rounded-sm bg-emerald-500" /> signed in
        </span>
      </div>
      <div className="flex h-16 items-end gap-[2px]">
        {filled.map(d => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div className="flex w-full flex-col justify-end" style={{ height: `${d.visitors > 0 ? Math.max(8, (d.visitors / max) * 100) : 4}%` }}>
              {d.signed_in_visitors > 0 && (
                <div className="w-full rounded-t-sm bg-emerald-500" style={{ height: `${(d.signed_in_visitors / Math.max(1, d.visitors)) * 100}%` }} />
              )}
              <div className={`w-full flex-1 rounded-sm ${d.visitors > 0 ? 'bg-sky-500' : 'bg-slate-800'}`} />
            </div>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 group-hover:block">
              {formatDay(d.day)}: {d.visitors} visitors ({d.signed_in_visitors} signed in) · renders median {Math.round(d.median_renders)}, max {d.max_renders}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopList({ title, items }: { title: string; items: TopItem[] }) {
  const max = Math.max(1, ...items.map(i => i.count))
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {items.length === 0 && <p className="text-xs text-slate-500">No data yet.</p>}
      <ul className="flex flex-col gap-1">
        {items.map(i => (
          <li key={i.value} className="relative flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-xs">
            <div className="absolute inset-y-0 left-0 rounded bg-sky-900/40" style={{ width: `${(i.count / max) * 100}%` }} />
            <span className="relative truncate text-slate-200">{i.value}</span>
            <span className="relative shrink-0 text-slate-400">{i.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AdminStatsPanel({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!supabase) {
      setError('Accounts are not configured.')
      return
    }
    supabase.rpc('admin_dashboard_stats').then(({ data, error: err }) => {
      if (!active) return
      if (err) setError(err.message)
      else setStats(data as Stats)
    })
    return () => { active = false }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-sky-400" />
            <h2 className="text-sm font-bold tracking-wide text-slate-100">Admin · Usage</h2>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</p>
        )}
        {!error && !stats && <p className="px-1 py-6 text-center text-xs text-slate-400 animate-pulse">Loading usage…</p>}

        {stats && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {([
                ['Users', String(stats.totals.users)],
                ['Map requests', String(stats.totals.requests ?? 0)],
                ['Saved maps', String(stats.totals.maps)],
                ['Projects', String(stats.totals.projects)],
                ['Storage', formatBytes(stats.totals.storage_bytes)],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="mt-1 text-xl font-bold text-slate-100">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <MiniBars title="Map requests per day" counts={stats.requests_by_day ?? []} />
              <MiniBars title="Signups per day" counts={stats.signups_by_day} />
              <MiniBars title="Maps saved per day" counts={stats.maps_by_day} />
            </div>

            <VisitorBars days={stats.visitors_by_day ?? []} />

            <div className="grid gap-2 sm:grid-cols-3">
              <TopList title="Top variables (30d)" items={stats.top_variables ?? []} />
              <TopList title="Top regions (30d)" items={stats.top_regions ?? []} />
              <TopList title="Top modes (30d)" items={stats.top_modes ?? []} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700/70">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Joined</th>
                    <th className="px-3 py-2 text-right">Maps</th>
                    <th className="px-3 py-2 text-right">Storage</th>
                    <th className="px-3 py-2">Last map</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {stats.users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-900/50">
                      <td className="max-w-[16rem] truncate px-3 py-2">
                        {u.email ?? u.display_name ?? u.id}
                        {u.is_admin && <span className="ml-1.5 rounded bg-sky-900/70 px-1 py-0.5 text-[9px] font-semibold text-sky-300">ADMIN</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{u.tier ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{formatDay(u.created_at)}</td>
                      <td className="px-3 py-2 text-right">{u.maps_count}</td>
                      <td className="px-3 py-2 text-right">{formatBytes(u.storage_bytes)}</td>
                      <td className="px-3 py-2 text-slate-400">{u.last_map_at ? formatDay(u.last_map_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
