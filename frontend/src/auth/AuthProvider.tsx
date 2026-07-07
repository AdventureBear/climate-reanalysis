import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { AuthContext, type AuthContextValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    enabled: isSupabaseConfigured,
    loading,
    user: session?.user ?? null,
    session,
    async signUpWithPassword(email, password) {
      if (!supabase) throw new Error('Accounts are unavailable')
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      // With email confirmation on, there is no active session until confirmed.
      return { needsconfirmation: !data.session } as { needsconfirmation: boolean }
    },
    async signInWithPassword(email, password) {
      if (!supabase) throw new Error('Accounts are unavailable')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signInWithGoogle() {
      if (!supabase) throw new Error('Accounts are unavailable')
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
    },
    async signOut() {
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }), [loading, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
