import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './authContext'

// Landing page for the Google OAuth redirect. supabase-js parses the session
// from the URL (detectSessionInUrl); once a session exists we return home.
export default function AuthCallback() {
  const navigate = useNavigate()
  const { loading, session } = useAuth()

  useEffect(() => {
    if (!loading) navigate('/', { replace: true })
  }, [loading, session, navigate])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
      <p className="text-sm animate-pulse">Signing you in…</p>
    </div>
  )
}
