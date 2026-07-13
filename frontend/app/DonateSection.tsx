import { Heart } from 'lucide-react'

// Donations. Venmo is live today; Stripe goes live by setting
// STRIPE_DONATE_URL to a Stripe Payment Link once the account is wired up.
// No em-dashes.
const VENMO_DONATE_URL = 'https://account.venmo.com/u/SuzanneMAtkinson'
const STRIPE_DONATE_URL: string | null = null

export function DonateSection() {
  return (
    <section className="border-t border-[#0a1330] bg-[#101b40] py-12">
      <div className="mx-auto w-full max-w-2xl px-5 text-center">
        <h2 className="inline-flex items-center gap-2 text-xl font-bold text-slate-100">
          <Heart size={18} className="text-rose-400" /> Help keep PyRe online
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          PyRe is free to use, but the data, compute and hosting behind every map are not.
          If PyRe saves you time, a donation of any size keeps the maps coming.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <a
            href={VENMO_DONATE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-lg bg-[#008CFF] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0074d4]"
          >
            Donate with Venmo
          </a>
          {STRIPE_DONATE_URL ? (
            <a
              href={STRIPE_DONATE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-lg border border-slate-500 bg-slate-800 px-5 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-700"
            >
              Donate by card
            </a>
          ) : (
            <span className="inline-flex h-10 items-center rounded-lg border border-slate-600/60 px-5 text-sm text-slate-500">
              Card donations coming soon
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
