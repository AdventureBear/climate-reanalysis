import Link from "next/link"
import { PageShell } from "../../../ui/PageShell"
import { listRegions } from "../../../lib/regions"

export const dynamicParams = false

type Params = {
    region: string
}

function slugify(region: string) {
    return region
        .toLowerCase()
        .replace(/\s+/g, "-")
}

export async function generateStaticParams() {
    const regions = await listRegions()

    return regions.map((region) => ({
        region: slugify(region),
    }))
}

export default async function RegionPage({
                                             params,
                                         }: {
    params: Promise<Params>
}) {
    const { region } = await params

    const regions = await listRegions()

    const regionName = regions.find(
        (name) => slugify(name) === region
    )

    return (
        <div className="flex-1 bg-[#16224a]">
            <PageShell>
                <h1 className="text-2xl font-bold text-white">
                    {regionName ?? region}
                </h1>

                <p className="mt-3 text-slate-300">
                    No stories yet.
                </p>

                <Link
                    href="/regions/"
                    className="mt-4 inline-block text-sky-400 underline underline-offset-2 hover:text-sky-300"
                >
                    Back to The Regions
                </Link>
            </PageShell>
        </div>
    )
}