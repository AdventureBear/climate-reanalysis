import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The site is fully usable without an account, so a missing Supabase config
// must not break the anonymous map builder. When unset, `supabase` is null and
// the auth/library UI hides itself (see AuthProvider / isSupabaseConfigured).
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing). ' +
      'Accounts and saved maps are disabled; the map builder still works.',
  )
}

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE: OAuth/redirect callbacks return a short-lived `?code=` that we
        // exchange for a session, instead of the implicit flow's `#access_token`
        // in the URL. More secure (no tokens in the URL/history) and it's the
        // handling `detectSessionInUrl` completes automatically on /auth/callback.
        flowType: 'pkce',
      },
    })
  : null

// Convenience for call sites that only run when the user is signed in.
export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export const STORAGE_BUCKET = 'maps'
