import Link from 'next/link'

// Site-wide footer: FAQ plus the legal pages Google OAuth app verification
// requires (privacy policy + terms of service URLs on the consent screen).
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-800 bg-slate-900/60 px-5 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[11px] text-slate-500">
      <span>© {new Date().getFullYear()} PyRe · Reanalysis data from NOAA NCEP/CPC CORe</span>
      <nav className="flex items-center gap-4">
        <Link href="/faq" className="hover:text-slate-300 transition-colors">FAQ</Link>
        <Link href="/about" className="hover:text-slate-300 transition-colors">About</Link>
        <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
        <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
      </nav>
    </footer>
  )
}
