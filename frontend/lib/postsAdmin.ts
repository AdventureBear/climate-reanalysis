// Admin-side post operations for the Synopsis editor (#36). All calls run as
// the signed-in admin; RLS enforces the is_admin gate server-side.
import { supabase } from './supabase'
import { isJsonBody, textFromJsonBody } from './posts'
import { downloadImageBlob } from './storage'
import type { SavedMap } from './database.types'

export type PostRow = {
  id: string
  slug: string
  title: string
  description: string
  body_md: string
  category: string
  published: boolean
  publish_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

// Posts generated from an Area Forecast Discussion carry this category (#37).
export const AFD_CATEGORY = 'forecast discussion'

function requireSupabase() {
  if (!supabase) throw new Error('Accounts are not configured.')
  return supabase
}

export async function listAllPosts(): Promise<PostRow[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('posts').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as PostRow[]
}

export type PostInput = {
  id?: string
  slug: string
  title: string
  description: string
  body_md: string
  published: boolean
  publish_at: string | null
  published_at: string | null
}

export async function upsertPost(input: PostInput): Promise<PostRow> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('posts')
    .upsert(input as never, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data as PostRow
}

export async function deletePost(id: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('posts').delete().eq('id', id)
  if (error) throw error
}

// Uploads a photo; returns the bucket path to reference in markdown
// ("post-images/{slug}/{filename}"). Paths, never full URLs (#36 portability).
export async function uploadPostImage(slug: string, file: File): Promise<string> {
  const sb = requireSupabase()
  const clean = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')
  const key = `${slug}/${Date.now()}-${clean}`
  const { error } = await sb.storage.from('post-images').upload(key, file, { upsert: false })
  if (error) throw error
  return `post-images/${key}`
}

// Copies an already-saved map PNG from the private maps bucket into the
// public post-images bucket (file copy, never a re-render). Returns the
// bucket path for the markdown image reference.
export async function copySavedMapImage(slug: string, map: SavedMap): Promise<string> {
  const sb = requireSupabase()
  if (!map.image_path) throw new Error('This saved map has no stored image.')
  const blob = await downloadImageBlob(map.image_path)
  const key = `${slug}/map-${map.id}.png`
  const { error } = await sb.storage.from('post-images')
    .upload(key, blob, { upsert: true, contentType: 'image/png' })
  if (error) throw error
  return `post-images/${key}`
}

// Ask the rebuild-site Edge Function to poke Render's deploy hook.
export async function triggerRebuild(): Promise<{ ok: boolean; message: string }> {
  const sb = requireSupabase()
  const { data, error } = await sb.functions.invoke('rebuild-site', { body: { mode: 'rebuild' } })
  if (error) return { ok: false, message: error.message }
  if (data?.error) return { ok: false, message: String(data.error) }
  return { ok: true, message: 'Rebuild started' }
}

// Empty description = first ~155 characters of the story.
export function descriptionFromBody(body: string): string {
  const text = (isJsonBody(body) ? textFromJsonBody(body) : body)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')   // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/[#*_`>~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= 155 ? text : text.slice(0, 152).replace(/\s+\S*$/, '') + '...'
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
