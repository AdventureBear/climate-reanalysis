'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navHref } from '../lib/siteUrls'

// Site-wide footer: FAQ plus the legal pages Google OAuth app verification
// requires (privacy policy + terms of service URLs on the consent screen).
// All footer targets are marketing pages, so on app-host pages navHref
// makes them absolute www links.
const FOOTER_LINKS = [
  { href: '/changelog', label: 'Changelog' },
  { href: '/faq', label: 'FAQ' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function SiteFooter() {
  const pathname = usePathname()
  return (
    <footer className="mt-auto border-t border-slate-800 bg-slate-900/60 px-5 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[11px] text-slate-500">
      <span>© {new Date().getFullYear()} PyRe · Reanalysis data from NOAA NCEP/CPC CORe</span>
      <nav className="flex items-center gap-4">
        {FOOTER_LINKS.map(({ href, label }) => (
          <Link key={href} href={navHref(href, pathname)} className="hover:text-slate-300 transition-colors">
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  )
}
