'use client'

// Bottom-of-landing-page account CTA. The map links above already sell the
// builder; this section sells the account, by audience. Pricing copy: free
// now, paid plans coming. No em-dashes.
import { useState } from 'react'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from './auth/authContext'
import { AuthModal } from './auth/AuthModal'

const AUDIENCES = [
  {
    who: 'Students',
    points: [
      'Organize your maps by course and by week or chapter',
      'Keep lab work in order so assignments go in on time',
      'Never lose track of a map you already made',
    ],
  },
  {
    who: 'Teachers',
    points: [
      'Organize by class and by semester',
      'Update your courses in real time',
      'Prepare recent weather maps for weekly review',
    ],
  },
  {
    who: 'Researchers',
    points: [
      'Organize by phenomenon, by event, or any way you like',
      'Return six months later ready to make edits',
      'Never recreate every setting from scratch',
    ],
  },
  {
    who: 'Storm chasers',
    points: [
      'Scientifically accurate maps of the actual atmosphere behind your best chases',
      'Use them in blog posts, social media, shorts or long form videos',
    ],
  },
]

export function CreateAccountSection() {
  const { enabled: authEnabled, user } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)

  if (!authEnabled) return null

  return (
    <section className="mx-auto w-full max-w-6xl px-5">
      <div className="mx-auto mt-14 mb-14 max-w-5xl rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-8 text-center shadow-xl md:p-10">
        <h2 className="text-2xl font-bold text-slate-100 md:text-3xl">Keep the maps you make</h2>
        <p className="mt-3 text-base leading-relaxed text-slate-300">
          With a free account, PyRe Weather becomes your best ally, whether you are a student,
          a teacher, a researcher or a storm chaser.
        </p>
        <div className="mt-8 grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map(a => (
            <div key={a.who}
              className="rounded-2xl bg-gradient-to-b from-sky-300/50 via-[#3a5694]/40 to-[#2e4278]/20 p-px transition-all hover:-translate-y-1 hover:from-sky-300/90 hover:shadow-xl hover:shadow-sky-950/60">
              <div className="h-full rounded-[15px] bg-[#16224a] p-6">
                <h3 className="text-lg font-semibold text-slate-100">{a.who}</h3>
                <div className="mt-3 h-px bg-gradient-to-r from-sky-400/60 to-transparent" />
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                  {a.points.map(pt => (
                    <li key={pt} className="flex items-start gap-2.5">
                      <Check size={15} strokeWidth={3} className="mt-0.5 shrink-0 text-emerald-400" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-base leading-relaxed text-slate-200">
          Every account gets early access to new features and helps shape where PyRe goes next,
          based on how you actually work.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          No account? You can still build maps and save the images to your computer, but they
          disappear as soon as you navigate away from the builder.
        </p>
        {user ? (
          <p className="mt-6 text-base text-slate-300">
            You are signed in, so your library is already following you.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="mt-6 inline-block rounded-xl bg-sky-500 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-sky-900/40 transition-colors hover:bg-sky-400"
            >
              Create your free account
            </button>
            <p className="mt-3 text-sm text-slate-500">
              Free while PyRe is young. Paid plans will come as the site grows. Already have an
              account? Sign in from the header.
            </p>
          </>
        )}
        <p className="mt-6 border-t border-[#2e4278]/60 pt-5 text-sm text-slate-500">
          New here? The{' '}
          <Link href="/faq" className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
            FAQ
          </Link>{' '}
          covers the data sources and how the maps are computed.
        </p>
      </div>
      {authModalOpen && <AuthModal initialMode="signup" onClose={() => setAuthModalOpen(false)} />}
    </section>
  )
}
