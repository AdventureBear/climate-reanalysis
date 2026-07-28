'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  ImageIcon,
  Loader2,
  MapPin,
  Play,
  Sparkles,
  X,
} from 'lucide-react'
import { API_BASE } from '../../lib/api'

type SingleDateJobStatus = 'queued' | 'running' | 'done' | 'failed'

type SingleDateMap = {
  slug: string
  title: string
  filename: string
  live_url: string
  size_kb: number
  url: string
}

type SingleDateResult = {
  id: string
  date: string
  place: string
  place_display: string
  lat: number
  lon: number
  timezone: string
  valid_label: string
  maps: SingleDateMap[]
  animation_url?: string
  download_url: string
  summary_url: string
  links_url: string
  summary_text: string
  highlights: string[]
}

type SingleDateJob = {
  id: string
  status: SingleDateJobStatus
  step: number
  total: number
  message: string
  status_url: string
  error?: string
  result?: SingleDateResult
}

type FormState = {
  date: string
  place: string
  name: string
  time: string
  animate: boolean
}

const initialForm: FormState = {
  date: '',
  place: '',
  name: '',
  time: '',
  animate: false,
}

const generationMessages = [
  'Unfolding a very wrinkled weather map from the archives...',
  'Asking 1960s pressure systems to speak clearly into the microphone...',
  'Dusting off the isobars and pretending this is a normal hobby...',
  'Convincing the jet stream to hold still for one flattering portrait...',
  'Sorting clouds by dramatic potential...',
  'Checking whether the atmosphere had main-character energy that day...',
  'Polishing the location marker until it looks historically important...',
  'Interviewing every nearby contour line for relevance...',
  'Shaking the snow-depth drawer to see if anything interesting falls out...',
  'Measuring wind barbs with unnecessary confidence...',
  'Giving sea-level pressure a small clipboard and a serious expression...',
  'Persuading the temperature anomaly scale to use its indoor voice...',
  'Running a tiny background check on the 500mb pattern...',
  'Looking for atmospheric plot twists within ten degrees...',
  'Making the map margins behave themselves...',
  'Untangling the calendar from UTC, local time, and historical time zones...',
  'Checking whether the date sky was doing jazz...',
  "Letting the diagnostics rummage through the day's pockets...",
  'Trying to determine if the dewpoint was being weird on purpose...',
  'Putting the contour labels through finishing school...',
  'Asking the CAPE field if it would like to make a scene...',
  'Searching for a low pressure system with excellent timing...',
  'Straightening the coastlines before guests arrive...',
  'Making sure the archive did not put the good stuff on the top shelf...',
  'Turning reanalysis into something gift-shaped...',
  'Checking for suspiciously dramatic vorticity...',
  'Consulting the synoptic hours like a tiny weather jury...',
  'Letting the color scales warm up backstage...',
  'Finding the part of the map that knows where the map package happened...',
  'Putting wind, temperature, and pressure in the same room politely...',
  'Asking the atmosphere what it remembers...',
  'Organizing the weather into keepsake form...',
  'Looking for a storm with a flair for entrances...',
  'Checking whether the jet streak sent a map package memo...',
  'Making sure the summary has numbers and not vibes alone...',
  'Waiting for Cartopy to draw the borders without complaining...',
  'Putting the map package in a neat little stack...',
  'Making the PNGs look presentable for company...',
  'Reading the sky cover like old handwriting...',
  'Seeing whether the day was quiet or secretly theatrical...',
  'Rounding up the extra maps that earned their place...',
  'Giving the historical atmosphere one more pass under the lamp...',
  'Checking the archive for meteorological gossip...',
  'Letting the analysis fields settle into their final poses...',
  'Making the live map links tidy...',
  'Preparing the download bundle...',
  'Almost done, unless the atmosphere adds a surprise encore...',
  'Final pass: no loose isobars, no suspicious pixels...',
]

function apiUrl(path: string) {
  return `${API_BASE}${path}`
}

function compactDate(date: string) {
  return date.replaceAll('-', '')
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail
        .map(item => item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : '')
        .filter(Boolean)
      if (messages.length) return messages.join(' ')
    }
  }
  return fallback
}

export default function SingleDatePackageApp() {
  const [form, setForm] = useState<FormState>(initialForm)
  const [job, setJob] = useState<SingleDateJob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [messageIndex, setMessageIndex] = useState(0)

  const progress = useMemo(() => {
    if (!job || !job.total) return 0
    return Math.min(100, Math.round((job.step / job.total) * 100))
  }, [job])
  const activeJobId = job && job.status !== 'done' && job.status !== 'failed' ? job.id : ''

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return
    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(apiUrl(job.status_url), { cache: 'no-store' })
        if (!response.ok) throw new Error(await response.text())
        const nextJob = await response.json() as SingleDateJob
        if (!cancelled) setJob(nextJob)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not check package status.')
        }
      }
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [job])

  useEffect(() => {
    if (!activeJobId) return
    const timer = window.setInterval(() => {
      setMessageIndex(current => (current + 1) % generationMessages.length)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [activeJobId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    setMessageIndex(Math.floor(Math.random() * generationMessages.length))
    try {
      const response = await fetch(apiUrl('/api/single-date-packages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: compactDate(form.date),
          place: form.place,
          name: form.name,
          time: form.time,
          animate: form.animate,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, 'Could not start the map package.'))
      setJob(payload as SingleDateJob)
      setFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the map package.')
    } finally {
      setSubmitting(false)
    }
  }

  function startAnother() {
    setJob(null)
    setError('')
    setFormOpen(true)
    setMessageIndex(Math.floor(Math.random() * generationMessages.length))
  }

  const result = job?.result
  const summaryRows = result?.summary_text.split('\n').filter(Boolean) ?? []

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-[#101735] text-slate-100">
      <section className="border-b border-slate-700/70 bg-slate-950/45">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 lg:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Single Date Map Package</h1>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
          >
            <Sparkles size={16} /> New Package
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        {!job && !error && (
          <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-slate-700 bg-slate-900 p-6 text-center shadow-xl">
            <div>
              <ImageIcon size={42} className="mx-auto mb-4 text-cyan-300" />
              <h2 className="text-lg font-semibold text-white">Ready to build a single-date package.</h2>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded border border-cyan-400/70 px-4 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10"
              >
                <Calendar size={16} /> Enter Date
              </button>
            </div>
          </div>
        )}

        {error && !formOpen && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {job && job.status !== 'done' && job.status !== 'failed' && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{job.message}</h2>
                <p className="mt-2 text-xs text-slate-400">Job {job.id.slice(0, 8)}</p>
              </div>
              <Loader2 size={28} className="shrink-0 animate-spin text-cyan-300" />
            </div>
            <div className="h-3 rounded bg-slate-800">
              <div className="h-3 rounded bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <p>{job.step} / {job.total}</p>
              <p className="italic text-slate-300">{generationMessages[messageIndex]}</p>
            </div>
          </div>
        )}

        {job?.status === 'failed' && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-100">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>{job.error || 'The package failed to render.'}</p>
          </div>
        )}

        {result && (
          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl">
              <div>
                <div className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 size={16} /> Complete
                </div>
                <h2 className="mt-1 text-xl font-semibold text-white">{result.place}</h2>
                <p className="mt-1 text-xs text-slate-400">{result.valid_label}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={startAnother}
                  className="inline-flex h-9 items-center gap-2 rounded border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
                >
                  <Sparkles size={16} /> New
                </button>
                <a
                  href={apiUrl(result.download_url)}
                  className="inline-flex h-9 items-center gap-2 rounded border border-cyan-400/70 px-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10"
                >
                  <Download size={16} /> Download
                </a>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="grid gap-5 md:grid-cols-2">
                {result.animation_url && (
                  <article className="rounded-lg border border-slate-700 bg-slate-900 shadow-xl md:col-span-2">
                    <img src={apiUrl(result.animation_url)} alt="Single-date weather animation" className="w-full rounded-t-lg bg-white object-contain" />
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-white">Animation</h3>
                    </div>
                  </article>
                )}

                {result.maps.map(map => (
                  <article key={map.filename} className="rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                    <img src={apiUrl(map.url)} alt={map.title} className="w-full rounded-t-lg bg-white object-contain" />
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{map.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-400">{map.size_kb} KB</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={apiUrl(map.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-600 px-2.5 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          <ImageIcon size={14} /> PNG
                        </a>
                        <a
                          href={map.live_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-600 px-2.5 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          <ExternalLink size={14} /> Map
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </section>

              <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
                <section className="rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Summary</h3>
                  <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto pr-1 text-sm text-slate-200">
                    {summaryRows.map((line, index) => (
                      <p key={`${line}-${index}`} className={line.endsWith(':') ? 'pt-2 font-semibold text-white' : ''}>
                        {line}
                      </p>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Package Links</h3>
                  <div className="mt-3 grid gap-2">
                    <a
                      href={apiUrl(result.download_url)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded border border-cyan-400/70 px-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10"
                    >
                      <Download size={16} /> Download ZIP
                    </a>
                    <a
                      href={apiUrl(result.summary_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      <ExternalLink size={16} /> Summary TXT
                    </a>
                    <a
                      href={apiUrl(result.links_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded border border-slate-600 px-3 text-sm text-slate-200 hover:bg-slate-800"
                    >
                      <ExternalLink size={16} /> Live Links
                    </a>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white">Create Package</h2>
                <p className="mt-1 text-sm text-slate-300">Date, location, optional time. (No time will create a daily composite).</p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-3 rounded border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-100">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <label className="mb-3 block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-200">
                <Calendar size={16} /> Date
              </span>
              <input
                type="date"
                value={form.date}
                min="1950-01-01"
                required
                onChange={event => setForm(current => ({ ...current, date: event.target.value }))}
                className="h-10 w-full rounded border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-200">
                <MapPin size={16} /> Location
              </span>
              <input
                type="text"
                value={form.place}
                required
                placeholder="Pittsburgh, PA"
                onChange={event => setForm(current => ({ ...current, place: event.target.value }))}
                className="h-10 w-full rounded border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1.5 text-sm font-medium text-slate-200">Name</span>
              <input
                type="text"
                value={form.name}
                placeholder="Optional"
                onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                className="h-10 w-full rounded border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
            </label>

            <label className="mb-4 block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-200">
                <Clock size={16} /> Optional Time
              </span>
              <input
                type="time"
                value={form.time}
                onChange={event => setForm(current => ({ ...current, time: event.target.value }))}
                className="h-10 w-full rounded border border-slate-600 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400"
              />
            </label>

            <label className="mb-5 flex items-center gap-3 rounded border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={form.animate}
                onChange={event => setForm(current => ({ ...current, animate: event.target.checked }))}
                className="h-4 w-4 accent-cyan-400"
              />
              <span className="flex items-center gap-2"><Play size={15} /> Include animation</span>
            </label>

            <button
              type="submit"
              disabled={submitting || !form.date || !form.place}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
              Generate Package
            </button>
          </form>
        </div>
      )}
    </main>
  )
}
