import { PageShell } from '../../ui/PageShell'
import type { Metadata } from 'next'
import { RegionList } from './RegionList'
import { listRegions } from '../../lib/regions'


export const metadata: Metadata = {
  title: 'PyRe Weather - Map Regions',
  description: 'Browse the world regions available in the PyRe Weather map builder.',
}

export default async function Regions() {
  const regions = await listRegions()

  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Map Regions</h1>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-300">
              The regional frames available in the PyRe Weather map builder, with their display extents and map projections.
            </p>
          </div>
          <p className="rounded border border-sky-400/30 bg-sky-950/40 px-3 py-1.5 text-sm font-medium text-sky-100">
            {regions.length} regions
          </p>
        </div>

        {regions.length === 0 ? (
          <p className="mt-10 text-slate-400">No regions yet. Check back soon.</p>
        ) : (
          <RegionList regions={regions} />
        )}
      </PageShell>
    </div>
  )
}
