import { Fragment, useEffect, useState } from 'react'
import { BarChart3, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TabStrip } from '../ui/controls'

type DayCount = { day: string; count: number }
type RenderEvent = {
  at: string
  variable: string | null
  level: string | null
  region: string | null
  mode: string | null
  time_scale: string | null
}
type VisitorLogEntry = {
  day: string
  visitor: string
  signed_in: boolean
  renders: number
  first_seen: string
  last_seen: string
  render_list: RenderEvent[]
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
  // Per-visitor activity log (#14 follow-up); absent until its migration runs.
  visitor_log?: VisitorLogEntry[]
  untracked_by_day?: DayCount[]
  projects_by_day?: DayCount[]
  storage_by_day?: DayCount[]
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
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Days are UTC buckets (matches the database's date_trunc).
function dayKey(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

// A visitor who rendered this many maps in one day is worth a second look.
const RENDERS_CAUTION = 30
const RENDERS_ALARM = 100

function renderTone(renders: number): string {
  if (renders >= RENDERS_ALARM) return 'text-red-400'
  if (renders >= RENDERS_CAUTION) return 'text-amber-300'
  return 'text-slate-100'
}

// The at-a-glance numbers, all derived from the visitor log.
function TodayStrip({ log, requestDays }: { log: VisitorLogEntry[]; requestDays: DayCount[] }) {
  const todayEntries = log.filter(e => e.day === dayKey(0))
  const rByDay = new Map(requestDays.map(d => [d.day, d.count]))
  const rendersToday = rByDay.get(dayKey(0)) ?? 0
  const rendersYesterday = rByDay.get(dayKey(1)) ?? 0
  let thisWeek = 0
  let lastWeek = 0
  for (const e of log) {
    const age = Math.round((Date.parse(dayKey(0)) - Date.parse(e.day)) / 86400000)
    if (age < 7) thisWeek++
    else if (age < 14) lastWeek++
  }
  const heaviest = Math.max(0, ...todayEntries.map(e => e.renders))
  const delta = (now: number, before: number) =>
    before === 0 ? (now > 0 ? 'new' : '—') : `${now >= before ? '+' : ''}${now - before}`

  const tiles: Array<{ label: string; value: string; sub: string; subClass?: string }> = [
    {
      label: 'Visitors today',
      value: String(todayEntries.length),
      sub: `${todayEntries.filter(e => !e.signed_in).length} anon · ${todayEntries.filter(e => e.signed_in).length} signed in`,
    },
    {
      label: 'Renders today',
      value: String(rendersToday),
      sub: `yesterday ${rendersYesterday} (${delta(rendersToday, rendersYesterday)})`,
    },
    {
      label: 'Visitor-days this week',
      value: String(thisWeek),
      sub: `last week ${lastWeek} (${delta(thisWeek, lastWeek)})`,
    },
    {
      label: 'Heaviest visitor today',
      value: String(heaviest),
      sub: heaviest >= RENDERS_CAUTION ? 'renders · worth a look' : 'renders',
      subClass: heaviest >= RENDERS_CAUTION ? renderTone(heaviest) + ' font-semibold' : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map(t => (
        <div key={t.label} className="rounded-lg border border-sky-800/60 bg-sky-950/40 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">{t.label}</div>
          <div className="mt-1 text-2xl font-bold text-slate-100">{t.value}</div>
          <div className={`mt-0.5 text-[11px] ${t.subClass ?? 'text-slate-400'}`}>{t.sub}</div>
        </div>
      ))}
    </div>
  )
}

// Flat, scannable: one row per visitor per day; click a row to list every
// render under that visitor's hash.
function VisitorTable({ log, untracked }: { log: VisitorLogEntry[]; untracked: DayCount[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const rows = [...log].sort((a, b) => b.day.localeCompare(a.day) || b.renders - a.renders)
  const untrackedRows = [...untracked].sort((a, b) => b.day.localeCompare(a.day))

  function toggle(key: string) {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function timeOnSite(e: VisitorLogEntry): string {
    const mins = Math.round((Date.parse(e.last_seen) - Date.parse(e.first_seen)) / 60000)
    if (mins < 1) return '<1 min'
    if (mins < 60) return `${mins} min`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/70">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2">Visitor</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2 text-right">Renders</th>
            <th className="px-3 py-2 text-center">Member</th>
            <th className="px-3 py-2 text-right">Time on site</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {rows.map(e => {
            const key = `${e.day}-${e.visitor}`
            const expanded = open.has(key)
            return (
              <Fragment key={key}>
                <tr className="cursor-pointer hover:bg-slate-900/50" onClick={() => toggle(key)}>
                  <td className="px-3 py-1.5 font-mono">
                    <ChevronRight size={11} className={`mr-1 inline transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    {e.visitor.slice(0, 8)}
                  </td>
                  <td className="px-3 py-1.5">{formatDay(e.day)}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${renderTone(e.renders)}`}>{e.renders}</td>
                  <td className="px-3 py-1.5 text-center">{e.signed_in ? <span className="text-emerald-400">{'\u2713'}</span> : <span className="text-slate-600">{'\u2014'}</span>}</td>
                  <td className="px-3 py-1.5 text-right text-slate-300">{timeOnSite(e)}</td>
                </tr>
                {expanded && (e.render_list ?? []).map((r, i) => (
                  <tr key={`${key}-r${i}`} className="bg-slate-900/40 text-slate-400">
                    <td className="py-1 pl-9 pr-3 font-mono text-[11px]">{formatTime(r.at)}</td>
                    <td className="px-3 py-1" colSpan={4}>
                      {[r.variable && (r.level ? `${r.variable} @ ${r.level}` : r.variable), r.region, r.mode, r.time_scale]
                        .filter(Boolean).join(' \u00b7 ')}
                    </td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
          {untrackedRows.map(d => (
            <tr key={`untracked-${d.day}`} className="text-slate-500">
              <td className="px-3 py-1.5 font-mono">(pre-tracking)</td>
              <td className="px-3 py-1.5">{formatDay(d.day)}</td>
              <td className="px-3 py-1.5 text-right">{d.count}</td>
              <td className="px-3 py-1.5 text-center">{'\u2014'}</td>
              <td className="px-3 py-1.5 text-right">{'\u2014'}</td>
            </tr>
          ))}
          {rows.length === 0 && untrackedRows.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-500">No visitors in the last 14 days.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Total + how it got there: a 30-day cumulative sparkline built by walking
// back from the current total using the per-day additions.
// One metric as a row: label, total, 30-day delta, cumulative sparkline, all
// on a shared grid so every row aligns. Expands to a daily added-per-day chart.
function MetricRow({ label, total, series, format }: {
  label: string
  total: number
  series: DayCount[]
  format?: (n: number) => string
}) {
  const [open, setOpen] = useState(false)
  const fmt = format ?? String
  const addsByDay = new Map(series.map(d => [d.day, d.count]))

  const points: number[] = []
  let running = total
  for (let i = 0; i < 30; i++) {
    points.unshift(running)
    running -= addsByDay.get(dayKey(i)) ?? 0
  }
  const added = total - points[0]
  const min = Math.min(...points)
  const range = Math.max(1, Math.max(...points) - min)
  const coords = points.map((v, i) => `${(i / 29) * 100},${26 - ((v - min) / range) * 22 - 2}`)

  const days: DayCount[] = []
  for (let i = 29; i >= 0; i--) days.push({ day: dayKey(i), count: addsByDay.get(dayKey(i)) ?? 0 })
  const dayMax = Math.max(1, ...days.map(d => d.count))

  return (
    <div className="border-b border-slate-800 last:border-b-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="grid w-full cursor-pointer grid-cols-[1rem_7.5rem_1fr_7.5rem_8rem] items-center gap-3 px-3 py-2 text-left hover:bg-slate-900/60">
        <ChevronRight size={12} className={`text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="text-right text-base font-bold text-slate-100">{fmt(total)}</span>
        <span className="whitespace-nowrap text-right text-[11px] text-slate-400">{added > 0 ? `+${fmt(added)} in 30d` : 'no change in 30d'}</span>
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
          <polyline points={coords.join(' ')} className="fill-none stroke-sky-400" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1">
          <div className="flex h-20 items-end gap-[2px]">
            {days.map(d => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end">
                <div
                  className={`w-full rounded-sm ${d.count > 0 ? 'bg-sky-500' : 'bg-slate-800'}`}
                  style={{ height: `${d.count > 0 ? Math.max(8, (d.count / dayMax) * 100) : 3}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-200 group-hover:block">
                  {formatDay(d.day)}: +{fmt(d.count)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-500">
            <span>{formatDay(days[0].day)}</span>
            <span>added per day</span>
            <span>{formatDay(days[days.length - 1].day)}</span>
          </div>
        </div>
      )}
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

type AdminTab = 'visitors' | 'rendering' | 'members'

export default function AdminStatsPanel({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<AdminTab>('visitors')

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
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-sky-400" />
            <h2 className="text-sm font-bold tracking-wide text-slate-100">Admin · Usage</h2>
          </div>
          <TabStrip
            value={tab}
            onChange={v => setTab(v as AdminTab)}
            options={[
              { value: 'visitors', label: 'Visitors' },
              { value: 'rendering', label: 'Rendering' },
              { value: 'members', label: 'Members & site' },
            ]}
          />
          <button type="button" onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</p>
        )}
        {!error && !stats && <p className="px-1 py-6 text-center text-xs text-slate-400 animate-pulse">Loading usage…</p>}

        {stats && (
          <div className="flex flex-col gap-4">
            {tab === 'visitors' && (
              <>
                <TodayStrip log={stats.visitor_log ?? []} requestDays={stats.requests_by_day ?? []} />
                <VisitorTable log={stats.visitor_log ?? []} untracked={stats.untracked_by_day ?? []} />
              </>
            )}

            {tab === 'rendering' && (
              <div className="grid gap-2 sm:grid-cols-3">
                <TopList title="Top variables (30d)" items={stats.top_variables ?? []} />
                <TopList title="Top regions (30d)" items={stats.top_regions ?? []} />
                <TopList title="Top modes (30d)" items={stats.top_modes ?? []} />
              </div>
            )}

            {tab === 'members' && (
            <>
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
                      <td className="px-3 py-2 text-slate-400">{formatDay(u.created_at.slice(0, 10))}</td>
                      <td className="px-3 py-2 text-right">{u.maps_count}</td>
                      <td className="px-3 py-2 text-right">{formatBytes(u.storage_bytes)}</td>
                      <td className="px-3 py-2 text-slate-400">{u.last_map_at ? formatDay(u.last_map_at.slice(0, 10)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-700/70 bg-slate-900/60">
              <MetricRow label="Users" total={stats.totals.users} series={stats.signups_by_day} />
              <MetricRow label="Map requests" total={stats.totals.requests ?? 0} series={stats.requests_by_day ?? []} />
              <MetricRow label="Saved maps" total={stats.totals.maps} series={stats.maps_by_day} />
              <MetricRow label="Projects" total={stats.totals.projects} series={stats.projects_by_day ?? []} />
              <MetricRow label="Storage" total={stats.totals.storage_bytes} series={stats.storage_by_day ?? []} format={formatBytes} />
            </div>
            </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
