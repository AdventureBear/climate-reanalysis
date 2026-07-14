// Hand-authored to match supabase/migrations/20260706000000_accounts_library.sql.
// Regenerate from the live schema at any time with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Timestamps = { created_at: string; updated_at: string }

export type Profile = {
  id: string
  display_name: string | null
  tier: string
  stripe_customer_id: string | null
  is_admin: boolean
  created_at: string
}

export type Project = {
  id: string
  user_id: string
  name: string
} & Timestamps

export type Folder = {
  id: string
  user_id: string
  project_id: string
  parent_folder_id: string | null
  name: string
} & Timestamps

export type SavedMap = {
  id: string
  user_id: string
  project_id: string
  folder_id: string | null
  name: string
  recipe: Json
  image_path: string | null
  thumbnail_path: string | null
} & Timestamps

export type MapRequest = {
  id: string
  variable: string | null
  level: string | null
  region: string | null
  mode: string | null
  time_scale: string | null
  // Both filled by the before-insert trigger, never by the client (#14).
  signed_in: boolean
  visitor: string | null
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      map_requests: {
        Row: MapRequest
        // RLS is insert-only for the API roles; reads happen inside the
        // SECURITY DEFINER admin_dashboard_stats() function. signed_in and
        // visitor are trigger-owned — the client cannot set them.
        Insert: Partial<Omit<MapRequest, 'id' | 'created_at' | 'signed_in' | 'visitor'>>
        Update: Record<string, never>
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: { id: string; display_name?: string | null; tier?: string; stripe_customer_id?: string | null }
        // Column-level grants only allow owners to change display_name.
        Update: Partial<{ display_name: string | null }>
        Relationships: []
      }
      projects: {
        Row: Project
        Insert: { user_id: string; name: string }
        Update: Partial<{ name: string }>
        Relationships: []
      }
      folders: {
        Row: Folder
        Insert: { user_id: string; project_id: string; parent_folder_id?: string | null; name: string }
        Update: Partial<{ name: string; parent_folder_id: string | null; project_id: string }>
        Relationships: []
      }
      saved_maps: {
        Row: SavedMap
        Insert: {
          id?: string
          user_id: string
          project_id: string
          folder_id?: string | null
          name: string
          recipe: Json
          image_path?: string | null
          thumbnail_path?: string | null
        }
        Update: Partial<{
          name: string
          folder_id: string | null
          project_id: string
          recipe: Json
          image_path: string | null
          thumbnail_path: string | null
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
