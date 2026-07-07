import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from './authContext'

type Mode = 'login' | 'signup'

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await signInWithPassword(email, password)
        onClose()
      } else {
        const { needsconfirmation } = await signUpWithPassword(email, password)
        if (needsconfirmation) {
          setNotice('Check your email to confirm your account, then sign in.')
          setMode('login')
        } else {
          onClose()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle() // redirects away
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(94vw,26rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <span className="font-semibold text-base">{mode === 'login' ? 'Sign in' : 'Create account'}</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            <button type="button" onClick={handleGoogle} disabled={busy}
              className="flex items-center justify-center gap-2 w-full rounded bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 cursor-pointer transition-colors">
              <GoogleGlyph />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-slate-500">
              <span className="h-px flex-1 bg-slate-700" />
              or
              <span className="h-px flex-1 bg-slate-700" />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Email</span>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" className="input w-full" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Password</span>
                <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input w-full" />
              </label>

              {error && <div className="rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">{error}</div>}
              {notice && <div className="rounded border border-sky-700 bg-sky-950 px-3 py-2 text-xs text-sky-200">{notice}</div>}

              <button type="submit" disabled={busy}
                className="w-full rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-3 py-2 text-sm font-bold text-white cursor-pointer transition-colors">
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button type="button"
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setNotice(null) }}
                className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer">
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
