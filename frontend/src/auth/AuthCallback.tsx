import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './authContext'

// Landing page for the OAuth redirect. With PKCE + detectSessionInUrl, supabase-js
// exchanges the `?code=` for a session during client init; once auth state resolves
// we return home. This page must never hang: it surfaces provider errors and always
// navigates away via a safety timeout.
export default function AuthCallback() {
  const navigate = useNavigate()
  const { loading, session } = useAuth()
  const [error, setError] = useState<string | null>(null)

  // An OAuth failure comes back as error params in the query or hash.
  useEffect(() => {
    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.search
    const params = new URLSearchParams(raw)
    const err = params.get('error_description') || params.get('error')
    if (err) setError(err.replace(/\+/g, ' '))
  }, [])

  useEffect(() => {
    if (error) return
    if (!loading) {
      navigate('/', { replace: true })
      return
    }
    // Safety net: if auth init stalls, don't strand the user on this page.
    const timer = setTimeout(() => navigate('/', { replace: true }), 5000)
    return () => clearTimeout(timer)
  }, [loading, session, error, navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-red-300">Sign-in failed: {error}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-sm font-semibold text-white cursor-pointer"
        >
          Back to app
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
      <p className="text-sm animate-pulse">Signing you in…</p>
    </div>
  )
}
