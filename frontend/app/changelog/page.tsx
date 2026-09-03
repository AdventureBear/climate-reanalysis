import type { Metadata } from 'next'
import { changelogEntries } from '../../content/changelog'
import { PageShell } from '../../ui/PageShell'
import { SITE_URL } from '../../lib/siteUrls'

export const metadata: Metadata = {
  title: 'Changelog - PyRe Weather',
  description: 'User-facing updates to PyRe Weather maps, tools, and data workflows.',
  alternates: { canonical: `${SITE_URL}/changelog/` },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

export default function ChangelogPage() {
  return (
    <PageShell>
      <div className="max-w-3xl">
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">Changelog</h1>
      </div>

      <div className="mt-10 max-w-4xl space-y-10">
        {changelogEntries.map(day => (
          <section key={day.date} className="border-t border-slate-700/70 pt-6">
            <time dateTime={day.date} className="block text-lg font-semibold text-sky-300">
              {formatDate(day.date)}
            </time>
            <ul className="mt-4 space-y-2.5 text-base leading-relaxed text-slate-300">
              {day.changes.map(change => (
                <li key={change} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
