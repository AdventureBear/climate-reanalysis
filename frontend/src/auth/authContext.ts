import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthContextValue = {
  /** True only when Supabase is configured (env vars present). */
  enabled: boolean
  /** Still resolving the initial session. */
  loading: boolean
  user: User | null
  session: Session | null
  signUpWithPassword: (email: string, password: string) => Promise<{ needsconfirmation: boolean }>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
