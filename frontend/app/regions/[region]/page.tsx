import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageShell } from "../../../ui/PageShell"
import { REGION_PREVIEWS } from "../../../lib/regionPreviews"
import { listRegions, slugifyRegion, type Region } from "../../../lib/regions"

export const dynamicParams = false

type Params = {
  region: string
}

function findRegion(regions: Region[], slug: string) {
  return regions.find(region => region.slug === slug || slugifyRegion(region.name) === slug)
}

export async function generateStaticParams() {
  const regions = await listRegions()
  return regions.map(region => ({ region: region.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { region: regionSlug } = await params
  const regions = await listRegions()
  const region = findRegion(regions, regionSlug)

  if (!region) {
    return {
      title: "PyRe Weather - Region Not Found",
    }
  }

  return {
    title: `PyRe Weather - ${region.name} Region`,
    description: `${region.name} map region extent and projection details for PyRe Weather.`,
  }
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function projectionParameters(region: Region) {
  return Object.entries(region.projection.parameters)
    .filter(([, value]) => value !== null && value !== false)
    .map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(", ") : String(value),
    }))
}

export default async function RegionPage({ params }: { params: Promise<Params> }) {
  const { region: regionSlug } = await params
  const regions = await listRegions()
  const region = findRegion(regions, regionSlug)

  if (!region) notFound()

  const previewMapSrc = REGION_PREVIEWS[region.name]
  const projectionParams = projectionParameters(region)

  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell>
        <Link href="/regions/" className="text-sm font-medium text-cyan-200 hover:text-cyan-100">
          Back to regions
        </Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{region.name}</h1>
            <p className="mt-2 text-base leading-relaxed text-slate-300">
              {region.extent_label}
            </p>
          </div>
          <Link
            href={`/map/?variable=blank_map&region=${encodeURIComponent(region.name)}`}
            className="rounded border border-cyan-400/70 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/10"
          >
            Open in map builder
          </Link>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <figure className="overflow-hidden rounded-lg border border-slate-700 bg-white shadow-xl">
            <img
              src={previewMapSrc}
              alt={`Blank PyRe Weather base map for ${region.name}`}
              className="w-full object-contain"
            />
          </figure>

          <aside className="space-y-4">
            <section className="rounded-lg border border-[#2e4278]/70 bg-[#1b2a55]/70 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Projection</h2>
              <p className="mt-2 text-lg font-semibold text-white">{region.projection.label}</p>
              <p className="mt-1 text-sm text-slate-400">{region.projection.kind}</p>
              {projectionParams.length > 0 && (
                <dl className="mt-4 space-y-2 text-sm text-slate-300">
                  {projectionParams.slice(0, 6).map(param => {
                    return (
                      <div key={param.key} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{param.key}</dt>
                        <dd className="text-right text-slate-200">{param.value}</dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </section>

            <section className="rounded-lg border border-[#2e4278]/70 bg-[#1b2a55]/70 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Display Extent</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">West</dt>
                  <dd className="font-medium text-slate-100">{formatNumber(region.extent.west)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">East</dt>
                  <dd className="font-medium text-slate-100">{formatNumber(region.extent.east)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">South</dt>
                  <dd className="font-medium text-slate-100">{formatNumber(region.extent.south)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">North</dt>
                  <dd className="font-medium text-slate-100">{formatNumber(region.extent.north)}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-[#2e4278]/70 bg-[#1b2a55]/70 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Fetch Bounds</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Lat {formatNumber(region.fetch_bounds.lat_min)} to {formatNumber(region.fetch_bounds.lat_max)}, lon {formatNumber(region.fetch_bounds.lon_min)} to {formatNumber(region.fetch_bounds.lon_max)} in NOAA 0-360 degrees.
              </p>
            </section>
          </aside>
        </div>
      </PageShell>
    </div>
  )
}
