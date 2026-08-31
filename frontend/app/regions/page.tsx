import { PageShell } from '../../ui/PageShell'
import type {Metadata} from "next";
import {RegionList} from "./RegionList"
import {Suspense} from "react";
import {listRegions} from "../../lib/regions";


export const metadata: Metadata = {
    title: 'PyRe Weather - List of World Regions',
    description:
        'List of the world regions available for the PyRe Weather map builder.',
}


let regions = await listRegions();
console.log("REGIONS:", regions)

export default async function Regions() {

    return (
        <div className="flex-1 bg-[#16224a]">
            <PageShell>
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-bold tracking-tight text-white">All Regions</h1>

                </div>
                <p className="mt-2 text-base leading-relaxed text-slate-300">
                    World Regions available for the PyRe Weather map builder.
                </p>

                {Object.keys(regions).length === 0 && (
                    <p className="mt-10 text-slate-400">No regions yet. Check back soon.</p>
                )}

                {Object.keys(regions).length > 0 && (
                    <Suspense fallback={<p className="mt-8 text-slate-400">Loading stories…</p>}>
                        <RegionList  regions={regions} />
                    </Suspense>
                )}
            </PageShell>
        </div>

    )
}