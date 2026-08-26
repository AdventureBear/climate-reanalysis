'use client'

import Link from 'next/link'
function slugify(region: string) {
  return region
      .toLowerCase()
      .replace(/\s+/g, "-")
}
export function RegionList({regions}: { regions: string[]}) {


  return (
      <div className="mt-8 flex flex-col gap-4">
          {regions.map((region: string) => {

          return (
            <div
              key={slugify(region)}
              className="relative flex gap-5 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-5 transition-all hover:-translate-y-0.5 hover:border-sky-500/50"
            >
              <div className="min-w-0 flex-1">
                <h2 className="mt-1 text-xl font-semibold text-slate-100">
                  <Link href={`/regions/${region}/`} className="after:absolute after:inset-0">
                    {region}
                  </Link>
                </h2>

              </div>

            </div>
          )
        })}
    </div>
  )
}
