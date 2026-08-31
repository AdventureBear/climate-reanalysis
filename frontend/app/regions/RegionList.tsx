'use client'
import {RegionThumbnail} from "../map/builder/RegionThumbnail";
import type { Region } from "../../lib/regions"

import Link from 'next/link'
function slugify(region: string) {
  return region
      .toLowerCase()
      .replace(/\s+/g, "-")
}
export function RegionList({regions}:{regions:Region}) {


  return (
      <div className="mt-8 flex flex-col gap-4">
          {Object.keys(regions).map((region: string) => {

          return (
            <div
              key={slugify(region)}
              className="relative flex gap-5 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-5 transition-all hover:-translate-y-0.5 hover:border-sky-500/50"
            >
              <div className="min-w-0 flex-1">
                <h2 className="mt-1 text-xl font-semibold text-slate-100">
                  <div className="absolute inset-0 flex flex-row items-center justify-center" />
                  <div>
                  <Link href={`/regions/${slugify(region)}/`} className="after:absolute after:inset-0">
                    <RegionThumbnail regionKey={region} selected={false} />
                    {/*<div>{region}</div>*/}
                  </Link>
                  </div>
                  <div>
                  <Link href={`/regions/${slugify(region)}/`} className="after:absolute after:inset-0">
                    {/*<RegionThumbnail regionKey={region} selected={false} />*/}
                    <div>{region}</div>
                  </Link>
                  </div>
                </h2>

              </div>

            </div>
          )
        })}
    </div>
  )
}
