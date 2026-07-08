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

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        setLoading(false)
      })
      .catch(err => {
        // Never leave the app stuck in a loading state (e.g. AuthCallback would
        // hang on "Signing you in…" forever). Resolve loading and log the cause.
        if (!active) return
        console.error('Supabase getSession failed:', err)
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
    async resetPassword(email) {
      if (!supabase) throw new Error('Accounts are unavailable')
      // The recovery link lands on /auth/reset, where the PKCE code exchange
      // signs the user in and they pick a new password.
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      })
      if (error) throw error
    },
    async updatePassword(newPassword) {
      if (!supabase) throw new Error('Accounts are unavailable')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
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
