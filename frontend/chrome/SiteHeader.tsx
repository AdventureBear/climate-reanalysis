'use client'

// Global site header: brand, site navigation, account. Rendered by the root
// layout on every page. App-level controls (time scale, save, settings) live
// in the /map page's own toolbar — never here.
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ChevronDown, LogIn, LogOut, Menu, User, X } from 'lucide-react'
import { useAuth } from '../app/auth/authContext'
import { AuthModal } from '../app/auth/AuthModal'
import AdminStatsPanel from './AdminStatsPanel'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/map', label: 'Mapping' },
  { href: '/synopsis', label: 'Synopsis' },
  { href: '/faq', label: 'FAQ' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export function SiteHeader() {
  const pathname = usePathname()
  const { enabled: authEnabled, user, isAdmin, signOut } = useAuth()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [adminStatsOpen, setAdminStatsOpen] = useState(false)

  const navLink = (href: string, label: string, mobile = false) => (
    <Link
      key={href}
      href={href}
      onClick={() => setMobileMenuOpen(false)}
      className={
        mobile
          ? `rounded px-3 py-2 text-sm ${isActive(pathname, href) ? 'bg-sky-950/60 text-sky-300' : 'text-slate-200 hover:bg-slate-800'}`
          : `rounded px-2.5 py-1.5 text-sm transition-colors ${
              isActive(pathname, href)
                ? 'text-sky-300 font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`
      }
    >
      {label}
    </Link>
  )

  return (
    <header className="relative bg-slate-900 border-b border-slate-700 px-5 py-2 flex items-center gap-4">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <img src="/logo-mark.png" alt="" className="h-5 w-5" />
        <span className="font-bold tracking-tight text-sm text-slate-100">PyRe Weather</span>
      </Link>

      <nav className="hidden md:flex items-center gap-1">
        {NAV_LINKS.map(l => navLink(l.href, l.label))}
      </nav>

      <div className="ml-auto hidden md:flex items-center gap-3">
        {authEnabled && (user ? (
          <div className="relative">
            <button type="button" onClick={() => setAccountMenuOpen(o => !o)}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Account">
              <User size={14} />
              <span className="max-w-[9rem] truncate">{user.email}</span>
              <ChevronDown size={13} />
            </button>
            {accountMenuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-40 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl">
                  {isAdmin && (
                    <button type="button" onClick={() => { setAccountMenuOpen(false); setAdminStatsOpen(true) }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                      <BarChart3 size={14} /> Admin Stats
                    </button>
                  )}
                  <button type="button" onClick={() => { setAccountMenuOpen(false); void signOut() }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setAuthModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            title="Sign in">
            <LogIn size={14} /> Sign in
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setMobileMenuOpen(open => !open)}
        className="ml-auto rounded p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white md:hidden"
        aria-label="Open menu"
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      {mobileMenuOpen && (
        <div className="absolute right-3 top-11 z-40 flex w-48 flex-col rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-xl md:hidden">
          {NAV_LINKS.map(l => navLink(l.href, l.label, true))}
          {authEnabled && (
            <>
              <div className="my-1 h-px bg-slate-800" />
              {user ? (
                <>
                  {isAdmin && (
                    <button type="button" onClick={() => { setMobileMenuOpen(false); setAdminStatsOpen(true) }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                      <BarChart3 size={14} /> Admin Stats
                    </button>
                  )}
                  <button type="button" onClick={() => { setMobileMenuOpen(false); void signOut() }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                    <LogOut size={14} /> Sign out
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => { setMobileMenuOpen(false); setAuthModalOpen(true) }}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800">
                  <LogIn size={14} /> Sign in
                </button>
              )}
            </>
          )}
        </div>
      )}

      {authEnabled && authModalOpen && <AuthModal onClose={() => setAuthModalOpen(false)} />}
      {authEnabled && adminStatsOpen && isAdmin && <AdminStatsPanel onClose={() => setAdminStatsOpen(false)} />}
    </header>
  )
}
