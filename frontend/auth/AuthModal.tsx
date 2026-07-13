import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from './authContext'
import { PasswordInput } from './PasswordInput'
import { authErrorMessage } from './authErrors'

type Mode = 'login' | 'signup' | 'reset'

const TITLES: Record<Mode, string> = {
  login: 'Sign in',
  signup: 'Create account',
  reset: 'Reset password',
}

// Email confirmations are off (no SMTP yet), so a typo'd sign-up email creates
// an account nobody can ever recover — the signup form confirms both the email
// and the password before submitting. Confirm fields intentionally allow paste.
export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [emailConfirm, setEmailConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Emails compare case-insensitively; passwords must match exactly. Mismatch
  // warnings stay quiet until the confirm field has content.
  const emailsMatch = emailConfirm.trim().toLowerCase() === email.trim().toLowerCase()
  const passwordsMatch = passwordConfirm === password
  const emailMismatch = mode === 'signup' && emailConfirm !== '' && !emailsMatch
  const passwordMismatch = mode === 'signup' && passwordConfirm !== '' && !passwordsMatch
  const submitDisabled = busy || (mode === 'signup' && (!emailsMatch || !passwordsMatch))

  function switchMode(next: Mode) {
    setMode(next)
    setEmailConfirm('')
    setPasswordConfirm('')
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitDisabled) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'reset') {
        await resetPassword(email)
        setNotice('Check your email for a password reset link.')
      } else if (mode === 'login') {
        await signInWithPassword(email, password)
        onClose()
      } else {
        const { needsconfirmation } = await signUpWithPassword(email, password)
        if (needsconfirmation) {
          switchMode('login')
          setNotice('Check your email to confirm your account, then sign in.')
        } else {
          onClose()
        }
      }
    } catch (err) {
      setError(authErrorMessage(err))
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
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  const labelClass = 'text-[9px] font-bold text-slate-500 uppercase tracking-widest'
  const mismatchClass = 'text-[11px] text-red-400'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(94vw,26rem)] shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
            <span className="font-semibold text-base">{TITLES[mode]}</span>
            <button type="button" onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            {mode !== 'reset' && (
              <>
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
              </>
            )}

            {mode === 'reset' && (
              <p className="text-xs text-slate-400">
                Enter your account email and we&rsquo;ll send you a link to set a new password.
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Email</span>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email" className="input w-full" />
              </label>
              {mode === 'signup' && (
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Confirm email</span>
                  <input type="email" required value={emailConfirm} onChange={e => setEmailConfirm(e.target.value)}
                    autoComplete="email" className="input w-full" />
                  {emailMismatch && <span className={mismatchClass}>Emails don&rsquo;t match.</span>}
                </label>
              )}
              {mode !== 'reset' && (
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Password</span>
                  <PasswordInput value={password} onChange={setPassword} minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </label>
              )}
              {mode === 'signup' && (
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Confirm password</span>
                  <PasswordInput value={passwordConfirm} onChange={setPasswordConfirm} minLength={6}
                    autoComplete="new-password" />
                  {passwordMismatch && <span className={mismatchClass}>Passwords don&rsquo;t match.</span>}
                </label>
              )}

              {error && <div className="rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">{error}</div>}
              {notice && <div className="rounded border border-sky-700 bg-sky-950 px-3 py-2 text-xs text-sky-200">{notice}</div>}

              <button type="submit" disabled={submitDisabled}
                className="w-full rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-3 py-2 text-sm font-bold text-white cursor-pointer transition-colors">
                {busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : TITLES[mode]}
              </button>

              {mode === 'login' && (
                <button type="button" onClick={() => switchMode('reset')}
                  className="self-center text-xs text-sky-400 hover:text-sky-300 cursor-pointer">
                  Forgot password?
                </button>
              )}
            </form>

            <p className="text-center text-xs text-slate-400">
              {mode === 'login' && (
                <>
                  Don&rsquo;t have an account?{' '}
                  <button type="button" onClick={() => switchMode('signup')}
                    className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer">
                    Sign up
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchMode('login')}
                    className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer">
                    Sign in
                  </button>
                </>
              )}
              {mode === 'reset' && (
                <button type="button" onClick={() => switchMode('login')}
                  className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer">
                  Back to sign in
                </button>
              )}
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
