// Object-storage access for saved-map images. This is the ONLY module that
// knows the storage provider (Supabase Storage today) — a future move to
// Cloudflare R2 / S3 stays localized here.

import { requireSupabase, STORAGE_BUCKET } from './supabase'

function fullKey(userId: string, mapId: string) {
  return `${userId}/${mapId}/full.png`
}

function thumbKey(userId: string, mapId: string) {
  return `${userId}/${mapId}/thumb.png`
}

export type MapImageKeys = { image_path: string; thumbnail_path: string }

// Upload the full-res render and its thumbnail; returns the object keys to store
// on the saved_maps row.
export async function uploadMapImages(
  userId: string,
  mapId: string,
  fullPng: Blob,
  thumbnail: Blob,
): Promise<MapImageKeys> {
  const sb = requireSupabase()
  const image_path = fullKey(userId, mapId)
  const thumbnail_path = thumbKey(userId, mapId)

  const opts = { contentType: 'image/png', upsert: true }
  const [full, thumb] = await Promise.all([
    sb.storage.from(STORAGE_BUCKET).upload(image_path, fullPng, opts),
    sb.storage.from(STORAGE_BUCKET).upload(thumbnail_path, thumbnail, opts),
  ])
  if (full.error) throw full.error
  if (thumb.error) throw thumb.error

  return { image_path, thumbnail_path }
}

// Public URL for a stored object key (the bucket is public-read).
export function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const sb = requireSupabase()
  return sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

// Remove both objects for a saved map. Missing objects are not an error.
export async function removeMapObjects(userId: string, mapId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .remove([fullKey(userId, mapId), thumbKey(userId, mapId)])
  if (error) throw error
}
