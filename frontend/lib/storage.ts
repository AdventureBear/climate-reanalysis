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

// The bucket is private, so images are never exposed via a public URL. An owner
// reaches their own image through a short-lived signed URL (usable directly as an
// <img> src) or by downloading the bytes. RLS on storage.objects still scopes both
// to the owner; the signature only makes an already-authorized read shareable to a
// browser <img>/download for its short lifetime.
const SIGNED_URL_TTL = 60 * 60 // seconds

export async function signedUrl(
  path: string | null | undefined,
  expiresIn = SIGNED_URL_TTL,
): Promise<string | null> {
  if (!path) return null
  const sb = requireSupabase()
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

// Batch variant for grids of thumbnails: returns a { path -> signed URL } map.
export async function signedUrls(
  paths: (string | null | undefined)[],
  expiresIn = SIGNED_URL_TTL,
): Promise<Record<string, string>> {
  const clean = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  if (!clean.length) return {}
  const sb = requireSupabase()
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).createSignedUrls(clean, expiresIn)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

// Download a stored object's bytes (owner-only, via RLS) for "Download map".
export async function downloadImageBlob(path: string): Promise<Blob> {
  const sb = requireSupabase()
  const { data, error } = await sb.storage.from(STORAGE_BUCKET).download(path)
  if (error) throw error
  return data
}

// Remove both objects for a saved map. Missing objects are not an error.
export async function removeMapObjects(userId: string, mapId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .remove([fullKey(userId, mapId), thumbKey(userId, mapId)])
  if (error) throw error
}
