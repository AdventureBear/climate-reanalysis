// App header: brand, header-variant time-scale strip, save button, account
// menu (desktop) and the condensed mobile menu.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ChevronDown, FolderOpen, LogIn, LogOut, Menu, Save, Settings, SlidersHorizontal, User, X } from 'lucide-react'
import { useAuth } from '../auth/authContext'

export function AppHeader({ adminMode, saving, onSaveMap, onOpenColorLab, onToggleSettings, onOpenAuth, onOpenLibrary, onOpenAdminStats, timeScaleControls }: {
  adminMode: boolean
  saving: boolean
  onSaveMap: () => void
  onOpenColorLab: () => void
  onToggleSettings: () => void
  onOpenAuth: () => void
  onOpenLibrary: () => void
  onOpenAdminStats: () => void
  timeScaleControls: React.ReactNode
}) {
  const { enabled: authEnabled, user, isAdmin, signOut } = useAuth()
  // Color Lab is admin-only tooling. With accounts enabled it needs the
  // profile admin flag; without accounts (local dev / dark launch) the /admin
  // route stays available as a dev escape hatch.
  const colorLabVisible = authEnabled ? isAdmin : true
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
      <header className="relative bg-slate-900 border-b border-slate-700 px-5 py-2 flex items-center gap-3">
        <img src="/logo-mark.png" alt="" className="h-5 w-5 shrink-0" />
        <span className="font-bold tracking-tight text-sm">PyRe Weather</span>
        <span className="hidden sm:inline text-slate-400 text-sm font-light">Climate Reanalysis</span>
        <span className="hidden sm:inline text-[10px] text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">CORe / NCEP</span>

        {/* Time scale — far right of header */}
        <div className="ml-auto hidden md:flex items-center gap-3">
          {timeScaleControls}
          {authEnabled && (
            <>
              <button type="button" onClick={onSaveMap} disabled={saving}
                className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                title={user ? 'Save current map' : 'Sign in to save maps'}>
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              {user ? (
                <div className="relative">
                  <button type="button" onClick={() => setAccountMenuOpen(o => !o)}
                    className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                    title="Account">
                    <User size={14} />
                    <span className="max-w-[9rem] truncate">{user.email}</span>
                    <ChevronDown size={13} />
                  </button>
                  {accountMenuOpen && (
                    <>
                      <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setAccountMenuOpen(false)} />
                      <div className="absolute right-0 top-9 z-40 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl">
                        <button type="button" onClick={() => { setAccountMenuOpen(false); onOpenLibrary() }}
                          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                          <FolderOpen size={14} /> My Maps
                        </button>
                        {isAdmin && (
                          <button type="button" onClick={() => { setAccountMenuOpen(false); onOpenAdminStats() }}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <BarChart3 size={14} /> Admin Stats
                          </button>
                        )}
                        {colorLabVisible && (adminMode ? (
                          <button type="button" onClick={() => { setAccountMenuOpen(false); onOpenColorLab() }}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <SlidersHorizontal size={14} /> Color Lab
                          </button>
                        ) : (
                          <Link to="/admin" onClick={() => setAccountMenuOpen(false)}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                            <SlidersHorizontal size={14} /> Color Lab
                          </Link>
                        ))}
                        <button type="button" onClick={() => { setAccountMenuOpen(false); void signOut() }}
                          className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                          <LogOut size={14} /> Sign out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => onOpenAuth()}
                  className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                  title="Sign in">
                  <LogIn size={14} /> Sign in
                </button>
              )}
            </>
          )}
          {!authEnabled && colorLabVisible && (adminMode ? (
            <button
              type="button"
              onClick={onOpenColorLab}
              className="inline-flex h-7 items-center gap-2 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Open color lab"
            >
              Color Lab
            </button>
          ) : (
            <Link
              to="/admin"
              className="inline-flex h-7 items-center gap-2 whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              title="Open color lab"
            >
              Color Lab
            </Link>
          ))}
          <button type="button" onClick={() => onToggleSettings()}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            title="Settings">
            <Settings size={17} />
          </button>
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
          <div className="absolute right-3 top-11 z-40 w-48 rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-xl md:hidden">
            {colorLabVisible && (adminMode ? (
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); onOpenColorLab() }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
              >
                <SlidersHorizontal size={14} />
                Color Lab
              </button>
            ) : (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 rounded px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                <SlidersHorizontal size={14} />
                Color Lab
              </Link>
            ))}
            <button
              type="button"
              onClick={() => { setMobileMenuOpen(false); onToggleSettings() }}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
            >
              <Settings size={14} />
              Settings
            </button>
            {authEnabled && (
              <>
                <div className="my-1 h-px bg-slate-800" />
                <button type="button" onClick={() => { setMobileMenuOpen(false); onSaveMap() }} disabled={saving}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                  <Save size={14} /> {saving ? 'Saving…' : 'Save map'}
                </button>
                {user ? (
                  <>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenLibrary() }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                      <FolderOpen size={14} /> My Maps
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); void signOut() }}
                      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                      <LogOut size={14} /> Sign out
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAuth() }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">
                    <LogIn size={14} /> Sign in
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </header>
  )
}
