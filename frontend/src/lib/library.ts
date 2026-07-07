// Data layer for the saved library: projects -> folders -> maps.
// The React app talks to Supabase directly; RLS scopes everything to the owner.
// A saved map = recipe JSON in Postgres + full/thumbnail PNGs in object storage.

import type { MapRecipe } from '../mapRecipe'
import { requireSupabase } from './supabase'
import type { Folder, Project, SavedMap } from './database.types'
import { makeThumbnailBlob } from './images'
import { removeMapObjects, uploadMapImages } from './storage'

export type { Folder, Project, SavedMap } from './database.types'

// ── Projects ──────────────────────────────────────────────────────────────
export async function listProjects(): Promise<Project[]> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('projects').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createProject(userId: string, name: string): Promise<Project> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('projects').insert({ user_id: userId, name }).select().single()
  if (error) throw error
  return data
}

export async function renameProject(id: string, name: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('projects').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  // Removing a project cascades folders + saved_maps rows in Postgres; storage
  // objects for its maps are cleaned up first so nothing is orphaned.
  const sb = requireSupabase()
  const { data: maps, error: mapsError } = await sb
    .from('saved_maps').select('id, user_id').eq('project_id', id)
  if (mapsError) throw mapsError
  await Promise.all(maps.map(m => removeMapObjects(m.user_id, m.id).catch(() => {})))
  const { error } = await sb.from('projects').delete().eq('id', id)
  if (error) throw error
}

// ── Folders ───────────────────────────────────────────────────────────────
export async function listFolders(projectId: string): Promise<Folder[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('folders').select('*').eq('project_id', projectId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createFolder(
  userId: string, projectId: string, name: string, parentFolderId: string | null = null,
): Promise<Folder> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('folders')
    .insert({ user_id: userId, project_id: projectId, name, parent_folder_id: parentFolderId })
    .select().single()
  if (error) throw error
  return data
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('folders').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteFolder(id: string): Promise<void> {
  const sb = requireSupabase()
  const { data: maps, error: mapsError } = await sb
    .from('saved_maps').select('id, user_id').eq('folder_id', id)
  if (mapsError) throw mapsError
  await Promise.all(maps.map(m => removeMapObjects(m.user_id, m.id).catch(() => {})))
  const { error } = await sb.from('folders').delete().eq('id', id)
  if (error) throw error
}

// ── Saved maps ──────────────────────────────────────────────────────────────
export async function listMaps(projectId: string): Promise<SavedMap[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('saved_maps').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export type SaveMapInput = {
  userId: string
  projectId: string
  folderId?: string | null
  name: string
  recipe: MapRecipe
  fullPng: Blob
}

// Uploads full + thumbnail images to object storage, then writes the recipe row.
// The row id is generated up front so it keys the storage objects.
export async function saveMap(input: SaveMapInput): Promise<SavedMap> {
  const sb = requireSupabase()
  const id = crypto.randomUUID()
  const thumbnail = await makeThumbnailBlob(input.fullPng)
  const { image_path, thumbnail_path } = await uploadMapImages(input.userId, id, input.fullPng, thumbnail)

  const { data, error } = await sb
    .from('saved_maps')
    .insert({
      id,
      user_id: input.userId,
      project_id: input.projectId,
      folder_id: input.folderId ?? null,
      name: input.name,
      recipe: input.recipe as unknown as SavedMap['recipe'],
      image_path,
      thumbnail_path,
    })
    .select().single()
  if (error) {
    await removeMapObjects(input.userId, id).catch(() => {})
    throw error
  }
  return data
}

export async function renameSavedMap(id: string, name: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('saved_maps').update({ name }).eq('id', id)
  if (error) throw error
}

export async function moveMap(
  id: string, target: { projectId: string; folderId: string | null },
): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb
    .from('saved_maps').update({ project_id: target.projectId, folder_id: target.folderId }).eq('id', id)
  if (error) throw error
}

export async function deleteSavedMap(map: Pick<SavedMap, 'id' | 'user_id'>): Promise<void> {
  const sb = requireSupabase()
  await removeMapObjects(map.user_id, map.id).catch(() => {})
  const { error } = await sb.from('saved_maps').delete().eq('id', map.id)
  if (error) throw error
}
