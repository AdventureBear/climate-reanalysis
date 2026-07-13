import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './authContext'
import { PasswordInput } from './PasswordInput'
import { authErrorMessage } from './authErrors'

// Landing page for the password-recovery email link. The PKCE `?code=` in the
// link is exchanged for a session during client init (detectSessionInUrl), so
// once auth resolves the user is signed in and just picks a new password.
// Expired/used links come back as error params instead of a code; a direct
// visit with no session gets the same invalid-link message.
export default function ResetPasswordPage() {
  const router = useRouter()
  const { enabled, loading, session, updatePassword } = useAuth()
  const [linkError, setLinkError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Provider failures arrive as error params in the query or hash.
  useEffect(() => {
    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.search
    const params = new URLSearchParams(raw)
    const err = params.get('error_description') || params.get('error')
    if (err) setLinkError(err.replace(/\+/g, ' '))
  }, [])

  // Without Supabase there is no auth at all; this page has no business rendering.
  useEffect(() => {
    if (!enabled) router.replace('/')
  }, [enabled, router])

  const mismatch = passwordConfirm !== '' && passwordConfirm !== password

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || password !== passwordConfirm) return
    setBusy(true)
    setError(null)
    try {
      await updatePassword(password)
      // The recovery session is a real session — the user lands home signed in.
      router.replace('/')
    } catch (err) {
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  const labelClass = 'text-[9px] font-bold text-slate-500 uppercase tracking-widest'

  let body
  if (linkError || (!loading && !session)) {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-red-300">
          This reset link is invalid or has expired.
          {linkError ? ` (${linkError})` : ''}
        </p>
        <p className="text-xs text-slate-400">
          Open the app and use &ldquo;Forgot password?&rdquo; to request a new one.
        </p>
        <button type="button" onClick={() => router.replace('/')}
          className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white cursor-pointer">
          Back to app
        </button>
      </div>
    )
  } else if (loading) {
    body = <p className="text-sm text-slate-300">Verifying reset link…</p>
  } else {
    body = (
      <form onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-[min(94vw,22rem)] shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-slate-700">
          <span className="font-semibold text-base">Set a new password</span>
        </div>
        <div className="flex flex-col gap-3 px-6 py-5">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>New password</span>
            <PasswordInput value={password} onChange={setPassword} minLength={6}
              autoComplete="new-password" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Confirm new password</span>
            <PasswordInput value={passwordConfirm} onChange={setPasswordConfirm} minLength={6}
              autoComplete="new-password" />
            {mismatch && <span className="text-[11px] text-red-400">Passwords don&rsquo;t match.</span>}
          </label>

          {error && <div className="rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">{error}</div>}

          <button type="submit" disabled={busy || password !== passwordConfirm}
            className="w-full rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-3 py-2 text-sm font-bold text-white cursor-pointer transition-colors">
            {busy ? 'Please wait…' : 'Save password'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6">
      {body}
    </div>
  )
}
