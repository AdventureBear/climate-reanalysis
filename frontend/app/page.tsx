import Link from 'next/link'
import { RecipeRedirect } from './RecipeRedirect'
import { CreateAccountSection } from './CreateAccountSection'
import { DonateSection } from './DonateSection'
import { UsageSection } from './UsageSection'
import { JsonLd } from '../ui/JsonLd'
import { graph, learningResourceSchema } from '../lib/structuredData'

// Landing page. Hero blends real map renders into the dusk background with
// the text on top; the builder CTA sits low so the maps do the talking.
// No em-dashes.
export default function LandingPage() {
  return (
    <div className="flex-1 bg-[#16224a]">
      {/* Free educational tool — the type Google needs to see (#86). */}
      <JsonLd data={graph(learningResourceSchema)} />
      <RecipeRedirect />

      {/* Hero: map art fading into the dusk color */}
      <section className="relative overflow-hidden border-b-2 border-[#0a1330] bg-gradient-to-b from-[#2b4278] to-[#22355f]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <img
            src="/examples/hero-temp.jpg"
            alt=""
            className="absolute right-0 top-0 h-full w-[78%] object-cover opacity-70 [mask-image:linear-gradient(to_left,black_55%,transparent)]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#43699f]/70 via-[#2c4a80]/30 to-transparent" />
        </div>
        <div className="relative mx-auto w-full max-w-4xl px-5 py-24 md:py-32">
          <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-6xl [text-shadow:0_2px_18px_rgba(10,16,38,0.9)]">
            Publication quality weather maps in seconds
          </h1>
          <p className="mt-6 text-lg font-semibold text-slate-100 md:text-xl [text-shadow:0_1px_12px_rgba(10,16,38,0.9)]">
            A climate reanalysis playground for students and researchers.
          </p>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-200 md:text-lg [text-shadow:0_1px_12px_rgba(10,16,38,0.9)]">
            PyRe Weather helps meteorology students, teachers and researchers build custom
            atmospheric maps from any date since January 1st, 1950.
          </p>
        </div>
      </section>

      <main className="w-full">
        <div className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20">
          <h2 className="text-2xl font-bold text-slate-100 md:text-3xl">Last week in the Atmosphere</h2>
          <p className="mt-2 text-base text-slate-300">
            Click any map to open it in the builder and make it yours: change the variable, region,
            level, or overlays.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <Link href="/map?variable=height&level=500&region=CONUS&hour=00&date=20260708&date_mode=single&fill_mode=shaded&wind_step=0"
              className="group rounded-2xl border border-slate-600/40 bg-[#1b2a55]/70 p-4 transition-all hover:-translate-y-0.5 hover:border-sky-500/50">
              <img src="/examples/height-500.png" alt="500mb geopotential height, shaded, over the continental United States"
                className="rounded-lg" />
              <span className="mt-3 block text-base font-semibold text-slate-100">500mb heights</span>
              <span className="block text-sm text-slate-400">The steering pattern aloft</span>
            </Link>
            <Link href="/map?variable=temp_2m&level=1000&region=CONUS&hour=21&date=20260708&date_mode=single&wind_step=0"
              className="group rounded-2xl border border-slate-600/40 bg-[#1b2a55]/70 p-4 transition-all hover:-translate-y-0.5 hover:border-sky-500/50">
              <img src="/examples/temp-2m.png" alt="2 meter temperature over the continental United States"
                className="rounded-lg" />
              <span className="mt-3 block text-base font-semibold text-slate-100">Surface temperature</span>
              <span className="block text-sm text-slate-400">Afternoon heat, county by county</span>
            </Link>
            <Link href="/map?variable=wind_speed&level=300&region=CONUS&hour=00&date=20260708&date_mode=single&wind_step=0"
              className="group rounded-2xl border border-slate-600/40 bg-[#1b2a55]/70 p-4 transition-all hover:-translate-y-0.5 hover:border-sky-500/50">
              <img src="/examples/wind-300.png" alt="300mb wind speed over the continental United States"
                className="rounded-lg" />
              <span className="mt-3 block text-base font-semibold text-slate-100">300mb winds</span>
              <span className="block text-sm text-slate-400">Where the jet stream lives</span>
            </Link>
          </div>
        </div>

      </main>

      <section className="border-y border-[#0a1330] bg-[#101b40] py-16">
        <div className="mx-auto w-full max-w-6xl px-5">
          <h2 className="text-2xl font-bold text-slate-100">What you can do</h2>
          <p className="mt-1.5 text-sm text-slate-400">Every item opens a live example in the builder.</p>
          <ul className="mt-4 grid gap-x-10 gap-y-2.5 text-base leading-relaxed text-slate-200 sm:grid-cols-2">
            <li className="list-disc ml-4">
              <Link href="/map?variable=surface_pressure&level=1000&region=Eastern%20US&hour=12&date=19930313&date_mode=single&fill_mode=shaded&centers=1&wind_step=0" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">3-hourly maps</Link>
              {' '}at all eight analysis times: the 1993 Storm of the Century at its peak
            </li>
            <li className="list-disc ml-4">
              <Link href="/map?variable=temp_2m&level=1000&region=CONUS&dates=19950712,19950713,19950714,19950715&date_mode=range&wind_step=0" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">Daily composites</Link>
              {' '}over ranges or custom date lists: four days of the deadly 1995 Chicago heat wave
            </li>
            <li className="list-disc ml-4">
              <Link href="/map?variable=surface_pressure&level=1000&region=New%20Zealand&months=202504&fill_mode=shaded&centers=1" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">Monthly</Link>
              {' '}and{' '}
              <Link href="/map?variable=height&level=500&region=North%20America&months=199712,199801,199802&mode=anomaly&wind_step=0" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">seasonal composites</Link>
              : the 1997-98 El Ni&ntilde;o winter, three months in one map
            </li>
            <li className="list-disc ml-4">
              <Link href="/map?variable=wind_speed&level=925&region=India&months=200207&mode=anomaly&wind_step=2&wind_type=barbs&wind_overlay_mode=anomaly" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">Anomaly maps</Link>
              {' '}against 30-year climatology: the failed Indian monsoon of July 2002
            </li>
            <li className="list-disc ml-4">
              <Link href="/map?variable=precipitable_water&region=Tropical%20Atlantic&months=200009&mode=climatology&wind_step=0" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">Climatology views</Link>
              {' '}for any calendar month: September moisture across hurricane alley
            </li>
            <li className="list-disc ml-4">Wind overlays, contours, and pressure center detection</li>
            <li className="list-disc ml-4">Fixed scientific color scales with provenance-labeled output</li>
            <li className="list-disc ml-4">Every map is a shareable link, so a whole class can open the same analysis</li>
          </ul>
        </div>
      </section>

      <CreateAccountSection />
      <DonateSection />
      <UsageSection />
    </div>
  )
}
