'use client'

// Synopsis post editor (#36): BlockNote writing surface on the left (a
// Notion-style document — images are first-class blocks with built-in
// alignment, drag-resize, and caption fields), publish panel on the right.
// Three actions: Save draft / Publish / Schedule. Publishing, reverting,
// and deleting a published post update the live site automatically;
// failures offer Try again.
//
// Storage is BlockNote's block-JSON (an array). Legacy markdown bodies
// parse through BlockNote's markdown importer on open. Image references
// persist as bucket paths; widened to full addresses on open, narrowed on
// save.
import './editor.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useSelectedBlocks,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { Eye, Image as ImageIcon, Map as MapIcon } from 'lucide-react'
import { useAuth } from '../../../auth/authContext'
import type { SavedMap } from '../../../../lib/database.types'
import {
  copySavedMapImage, deletePost, descriptionFromBody, listAllPosts, slugify,
  triggerRebuild, uploadPostImage, upsertPost, type PostInput,
} from '../../../../lib/postsAdmin'
import { POST_IMAGE_BASE, resolvePostImage } from '../../../../lib/posts'
import { EditorGate } from '../shared'
import { MapPickerModal } from './MapPickerModal'

type Status = 'draft' | 'published' | 'scheduled'

// Image size presets (WordPress-style: named, pixels shown, chosen at
// insert time). "Full width" fills the content column — stored as the
// reading column's width and clamped to 100% everywhere, so it can never
// overflow any screen.
export const IMAGE_PRESETS = [
  { label: 'Small', px: 340 },
  { label: 'Medium', px: 640 },
  { label: 'Large', px: 800 },
  { label: 'Full width', px: 1020 },
] as const
export type ImagePreset = (typeof IMAGE_PRESETS)[number]

const PANEL = 'rounded-lg border border-[#2e4278]/60 bg-[#1b2a55]/70'
const FIELD = 'w-full rounded-md border border-[#2e4278]/70 bg-[#131d3f] px-3 py-2 text-[15px] text-slate-200 outline-none transition-colors focus:border-sky-700'
const BTN = 'rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50'

// Image targets: paths in the database, full addresses in the editor.
function widenImages(body: string): string {
  return POST_IMAGE_BASE ? body.split('post-images/').join(`${POST_IMAGE_BASE}post-images/`) : body
}
function narrowImages(body: string): string {
  return POST_IMAGE_BASE ? body.split(POST_IMAGE_BASE).join('') : body
}

// Size buttons inside the popup toolbar that appears on a selected image —
// sizing happens at the image, no scrolling to the top of the page.
function ImageSizeToolbarButtons({ onReplaceMap }: {
  onReplaceMap: (blockId: string, currentPx: number | undefined) => void
}) {
  const editor = useBlockNoteEditor()
  const Components = useComponentsContext()!
  const selected = useSelectedBlocks()
  const image = selected.find(b => b.type === 'image')
  if (!image) return null
  const currentPx = (image.props as { previewWidth?: number }).previewWidth
  return (
    <>
      {IMAGE_PRESETS.map(p => (
        <Components.FormattingToolbar.Button
          key={p.label}
          label={p.label === 'Full width' ? 'Full' : p.label}
          mainTooltip={p.label === 'Full width' ? 'Fill the article column' : `${p.px} pixels wide`}
          isSelected={currentPx === p.px}
          onClick={() => editor.updateBlock(image, { props: { previewWidth: p.px } })}
        >
          {p.label === 'Full width' ? 'Full' : p.label}
        </Components.FormattingToolbar.Button>
      ))}
      <Components.FormattingToolbar.Button
        label="Replace map"
        mainTooltip="Swap this image for another saved map"
        onClick={() => onReplaceMap(image.id, currentPx)}
      >
        Replace map
      </Components.FormattingToolbar.Button>
    </>
  )
}

export default function EditorApp() {
  const { enabled: authEnabled, user, isAdmin } = useAuth()
  const [postId, setPostId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Status>('draft')
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [updateFailed, setUpdateFailed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [pickerInitialPx, setPickerInitialPx] = useState<number | undefined>(undefined)
  const [linkToBuilder, setLinkToBuilder] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const ready = authEnabled && user && isAdmin

  const editor = useCreateBlockNote({
    // The slash-menu "Image" item and drag-drop uploads land in the same
    // public bucket as the Add photo button.
    uploadFile: async (file: File) => {
      const s = slug.trim() || slugify(title) || 'untitled'
      const path = await uploadPostImage(s, file)
      return resolvePostImage(path)
    },
  })

  // Load the post named in ?id= (or start blank for a new one).
  useEffect(() => {
    if (!ready || loaded || !editor) return
    const id = new URLSearchParams(window.location.search).get('id')
    setPostId(id)
    if (!id) { setLoaded(true); return }
    listAllPosts().then(async posts => {
      const p = posts.find(x => x.id === id)
      if (p) {
        setTitle(p.title); setSlug(p.slug); setSlugTouched(true)
        setDescription(p.description); setBody(p.body_md)
        setStatus(p.published ? 'published' : p.publish_at ? 'scheduled' : 'draft')
        setPublishedAt(p.published_at)
        if (p.publish_at) setScheduleAt(p.publish_at.slice(0, 16))
        const widened = widenImages(p.body_md).trimStart()
        if (widened.startsWith('[')) {
          editor.replaceBlocks(editor.document, JSON.parse(widened))
        } else {
          // Legacy markdown bodies import through BlockNote's own parser.
          const blocks = await editor.tryParseMarkdownToBlocks(widened)
          editor.replaceBlocks(editor.document, blocks)
        }
        setBody(narrowImages(JSON.stringify(editor.document)))
      }
      setLoaded(true)
    }).catch(e => setNotice(String(e.message ?? e)))
  }, [ready, loaded, editor])

  function say(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 8000)
  }

  async function persist(fields: Partial<PostInput>): Promise<string | null> {
    if (!title.trim()) { say('A title is required.'); return null }
    const input: PostInput = {
      id: postId ?? undefined,
      slug: slug.trim() || slugify(title),
      title: title.trim(),
      description: description.trim() || descriptionFromBody(body),
      body_md: body,
      published: status === 'published',
      publish_at: status === 'scheduled' && scheduleAt ? new Date(scheduleAt).toISOString() : null,
      published_at: publishedAt,
      ...fields,
    }
    setBusy(true)
    try {
      const row = await upsertPost(input)
      setPostId(row.id)
      setSlug(row.slug)
      setDescription(row.description)
      setPublishedAt(row.published_at)
      window.history.replaceState(null, '', `?id=${row.id}`)
      return row.id
    } catch (e) {
      say(String((e as Error).message ?? e))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function updateLiveSite(context: string) {
    const r = await triggerRebuild()
    setUpdateFailed(!r.ok)
    say(r.ok ? `${context} The site is updating — live in a few minutes.` : `${context} But the site update failed: ${r.message}`)
  }

  async function handleSaveDraft() {
    const wasPublished = status === 'published'
    setStatus('draft')
    const id = await persist({ published: false, publish_at: null, published_at: wasPublished ? null : publishedAt })
    if (!id) return
    if (wasPublished) await updateLiveSite('Reverted to draft.')
    else say('Draft saved.')
  }

  async function handlePublish() {
    setStatus('published')
    const id = await persist({ published: true, publish_at: null, published_at: publishedAt ?? new Date().toISOString() })
    if (!id) return
    await updateLiveSite('Published.')
  }

  async function handleSchedule() {
    if (!scheduleAt) { say('Pick a date and time first.'); return }
    setStatus('scheduled')
    const iso = new Date(scheduleAt).toISOString()
    const id = await persist({ published: false, publish_at: iso, published_at: null })
    if (id) say(`Scheduled — goes live within 30 minutes of ${new Date(iso).toLocaleString()}.`)
  }

  async function handleDelete() {
    if (!postId) return
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
    const wasPublished = status === 'published'
    setBusy(true)
    try {
      await deletePost(postId)
      if (wasPublished) await updateLiveSite('Deleted.')
      window.location.href = '/synopsis/editor/'
    } catch (e) {
      say(String((e as Error).message ?? e))
      setBusy(false)
    }
  }

  async function handleAddPhoto(file: File) {
    const s = slug.trim() || slugify(title)
    if (!s) { say('Give the post a title first (photos are filed under its name).'); return }
    setBusy(true)
    try {
      const path = await uploadPostImage(s, file)
      editor.insertBlocks(
        [{ type: 'image', props: { url: resolvePostImage(path), previewWidth: IMAGE_PRESETS[2].px } }],
        editor.getTextCursorPosition().block,
        'after',
      )
    } catch (e) {
      say(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function handleInsertMap(map: SavedMap, sizePx: number) {
    const s = slug.trim() || slugify(title)
    if (!s) { say('Give the post a title first.'); return }
    setBusy(true)
    try {
      const path = await copySavedMapImage(s, map)
      const props = { url: resolvePostImage(path), caption: map.name, name: map.name, previewWidth: sizePx }
      if (replaceTargetId && editor.getBlock(replaceTargetId)) {
        editor.updateBlock(replaceTargetId, { props })
      } else {
        editor.insertBlocks(
          [{ type: 'image', props }],
          editor.getTextCursorPosition().block,
          'after',
        )
      }
      if (linkToBuilder && map.recipe && typeof map.recipe === 'object') {
        const href = `/map?${new URLSearchParams(map.recipe as Record<string, string>).toString()}`
        editor.insertBlocks(
          [{ type: 'paragraph', content: [{ type: 'link', href, content: 'Open this map in the builder' }] }],
          editor.getTextCursorPosition().block,
          'after',
        )
      }
      setPickerOpen(false)
      setReplaceTargetId(null)
    } catch (e) {
      say(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  if (!authEnabled) return <EditorGate msg="Accounts are not configured." />
  if (!user) return <EditorGate msg="Sign in (header) to use the editor." />
  if (!isAdmin) return <EditorGate msg="The Synopsis editor is admin-only." />

  return (
    <div className="synopsis-editor flex-1 bg-[#16224a]">
      <main className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="flex items-baseline gap-3">
          <Link href="/synopsis/editor/" className="text-sm text-slate-500 hover:text-slate-300">← Posts</Link>
          {notice && (
            <span className="text-sm text-slate-400">
              {notice}
              {updateFailed && (
                <button type="button" onClick={() => void updateLiveSite('Retried.')}
                  className="ml-2 underline underline-offset-2 hover:text-slate-200">
                  Try again
                </button>
              )}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* Writing column: minmax(0,...) + min-w-0 let it shrink instead of
              stretching the page when content is wide. */}
          <section className="min-w-0">
            <input type="text" value={title} placeholder="Title"
              onChange={e => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)) }}
              className={`${FIELD} text-lg`} />
            <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
              <span>pyreweather.org/synopsis/</span>
              <input type="text" value={slug}
                onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
                className="min-w-0 flex-1 border-b border-transparent bg-transparent font-mono text-slate-400 outline-none focus:border-slate-500" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => photoRef.current?.click()} disabled={busy} className={BTN}>
                <ImageIcon size={13} className="mr-1.5 inline" /> Add photo
              </button>
              <input ref={photoRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleAddPhoto(f); e.target.value = '' }} />
              <button type="button" onClick={() => { setReplaceTargetId(null); setPickerInitialPx(undefined); setPickerOpen(true) }} disabled={busy} className={BTN}>
                <MapIcon size={13} className="mr-1.5 inline" /> Insert map
              </button>
              <button type="button"
                onClick={() => {
                  localStorage.setItem('synopsis-preview', JSON.stringify({ title, description: description.trim() || descriptionFromBody(body), body, at: Date.now() }))
                  window.open('/synopsis/preview/', '_blank')
                }}
                className={`ml-auto order-last ${BTN}`}>
                <Eye size={13} className="mr-1.5 inline" /> Preview
              </button>
            </div>

            <div className="mt-3">
              <BlockNoteView
                editor={editor}
                theme="dark"
                formattingToolbar={false}
                onChange={() => setBody(narrowImages(JSON.stringify(editor.document)))}
              >
                <FormattingToolbarController
                  formattingToolbar={() => (
                    <FormattingToolbar>
                      {getFormattingToolbarItems()}
                      <ImageSizeToolbarButtons
                        onReplaceMap={(blockId, currentPx) => {
                          setReplaceTargetId(blockId)
                          setPickerInitialPx(currentPx)
                          setPickerOpen(true)
                        }}
                      />
                    </FormattingToolbar>
                  )}
                />
              </BlockNoteView>
            </div>
          </section>

          {/* Publish panel */}
          <aside className="flex flex-col gap-4">
            <div className={`${PANEL} p-4`}>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Publish</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-slate-300">
                <span>Status: <span className="capitalize text-slate-400">{status}</span></span>
                {status === 'scheduled' && scheduleAt && (
                  <span className="text-xs text-slate-500">goes live {new Date(scheduleAt).toLocaleString()}</span>
                )}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => void handlePublish()} disabled={busy}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50">
                  {status === 'published' ? 'Update' : 'Publish'}
                </button>
                <button type="button" onClick={() => void handleSaveDraft()} disabled={busy} className={BTN}>
                  {status === 'published' ? 'Revert to draft' : 'Save draft'}
                </button>
                <div className="mt-1 border-t border-[#2e4278]/60 pt-3">
                  <label className="text-xs text-slate-500">
                    Schedule for later
                    <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                      className={`${FIELD} mt-1 text-xs`} />
                  </label>
                  <button type="button" onClick={() => void handleSchedule()} disabled={busy}
                    className={`${BTN} mt-2 w-full`}>
                    Schedule
                  </button>
                </div>
              </div>
            </div>

            <div className={`${PANEL} p-4`}>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</div>
              <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                className={`${FIELD} mt-2 resize-none text-sm`} />
            </div>

            {postId && (
              <button type="button" onClick={() => void handleDelete()} disabled={busy}
                className="self-start text-xs text-slate-500 underline underline-offset-2 hover:text-red-300/80">
                Delete post
              </button>
            )}
          </aside>
        </div>

        {pickerOpen && (
          <MapPickerModal
            onPick={(m, px) => void handleInsertMap(m, px)}
            onClose={() => { setPickerOpen(false); setReplaceTargetId(null) }}
            initialSizePx={replaceTargetId ? pickerInitialPx : undefined}
            title={replaceTargetId ? 'Replace with a saved map' : 'Insert a saved map'}
            linkToBuilder={linkToBuilder}
            setLinkToBuilder={setLinkToBuilder}
          />
        )}
      </main>
    </div>
  )
}
