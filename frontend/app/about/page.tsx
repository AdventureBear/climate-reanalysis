import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About — PyRe Weather',
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">{eyebrow}</p>
      <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-white">{title}</h2>
      <div className="mt-3 h-px w-12 bg-sky-400/60" />
    </div>
  )
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16">
      <h1 className="text-4xl font-bold tracking-tight text-white">About PyRe</h1>

      <section className="mt-14">
        <SectionHeading eyebrow="The story" title="Why this site exists" />
        <p className="mt-4 text-base leading-relaxed text-slate-200">
          For decades, the NOAA PSL composite plotting pages were the fastest way to explore
          reanalysis data. The dataset behind them stopped updating in March 2026, the pages are
          no longer maintained, and there are no plans for a new interface to the recommended
          replacement dataset (NCEP/CPC CORe). So I built PyRe to bring that workflow back on
          the new data.
        </p>
        <p className="mt-3 text-base leading-relaxed text-slate-200">
          PyRe is built by one person, but it is not built alone. These people shaped it with
          their questions, ideas, corrections and encouragement.
        </p>
      </section>

      <section className="mt-14">
        <SectionHeading eyebrow="Guidance" title="Faculty mentor" />
        <div className="mt-5 border-l-2 border-sky-400/70 pl-5">
          <p className="text-lg font-semibold text-white">Steve Seman</p>
          <p className="mt-1 text-base leading-relaxed text-slate-300">
            Director of Online Programs<br />
            Department of Meteorology and Atmospheric Science<br />
            Penn State University
          </p>
        </div>
      </section>

      <section className="mt-14">
        <SectionHeading eyebrow="First believers" title="Early supporters" />
        <p className="mt-4 text-base leading-relaxed text-slate-300">
          The first people to try the site, break it, and tell me what it should do next.
        </p>
        <ul className="mt-5 space-y-2.5 text-base">
          <li className="text-white">John Aegis</li>
          <li className="text-white">Paula Avery</li>
          <li className="text-white">Cody Barnhart <span className="ml-1.5 text-sm text-sky-300/80">Weather Confessions</span></li>
          <li className="text-white">Christopher Brinker <span className="ml-1.5 text-sm text-sky-300/80">PA Storm Trackerz</span></li>
          <li className="text-white">Connie Brinker <span className="ml-1.5 text-sm text-sky-300/80">PA Storm Trackerz</span></li>
          <li className="text-white">Josh Brinker <span className="ml-1.5 text-sm text-sky-300/80">PA Storm Trackerz</span></li>
          <li className="text-white">Jessica Brown <span className="ml-1.5 text-sm text-sky-300/80">Weather Nerds · Tornado Tacklers</span></li>
          <li className="text-white">Steve Byrne <span className="ml-1.5 text-sm text-sky-300/80">Weather Nerds</span></li>
          <li className="text-white">Nicole Carbone <span className="ml-1.5 text-sm text-sky-300/80">Weather Nerds</span></li>
          <li className="text-white">Michael Dooley III <span className="ml-1.5 text-sm text-sky-300/80">Weather Nerds · Tornado Tacklers</span></li>
          <li className="text-white">Kevin Hemphill <span className="ml-1.5 text-sm text-sky-300/80">Weather Nerds · Tornado Tacklers</span></li>
          <li className="text-white">RJ Kneuppel <span className="ml-1.5 text-sm text-sky-300/80">Weather Nerds</span></li>
          <li className="text-white">Noah Miller</li>
          <li className="text-white">Bill Millington</li>
          <li className="text-white">Anthony Quintillian <span className="ml-1.5 text-sm text-sky-300/80">Tornado Tacklers</span></li>
          <li className="text-white">Jordan Robinson</li>
          <li className="text-white">Ashley Smith</li>
          <li className="text-white">Alex Thornton <span className="ml-1.5 text-sm text-sky-300/80">StormCruzzer</span></li>
          <li className="text-white">Nick Wilkes <span className="ml-1.5 text-sm text-sky-300/80">Central Appalachian Weather Authority</span></li>
        </ul>
      </section>

      <section className="mt-14">
        <SectionHeading eyebrow="Working together" title="Collaborators" />
        <p className="mt-4 text-base leading-relaxed text-slate-300">
          Organizations and sites that have used PyRe or professionally supported the work.
        </p>
        <ul className="mt-4 space-y-2 text-base text-white">
          <li>PA Storm Trackerz <span className="ml-1.5 text-sm text-sky-300/80">the Brinker family</span></li>
          <li>Penn State Weather Forecasting Certificate Program</li>
        </ul>
      </section>

      <section className="mt-14 rounded-2xl border border-sky-500/30 bg-sky-950/30 p-6">
        <h2 className="text-xl font-bold text-white">Want your name on this list?</h2>
        <p className="mt-2 text-base leading-relaxed text-slate-200">
          The best parts of this site started as somebody&rsquo;s offhand suggestion. If you have
          an idea for what PyRe should do next, a correction, or a connection worth making,
          say so, and if it shapes the site, your name goes here.
        </p>
        <p className="mt-3 text-base leading-relaxed text-slate-200">
          Email{' '}
          <a href="mailto:suzyq@pyreweather.org" className="text-sky-300 underline underline-offset-2 hover:text-sky-200">
            suzyq@pyreweather.org
          </a>
          .
        </p>
      </section>
    </main>
  )
}
