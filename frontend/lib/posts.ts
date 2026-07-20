// Build-time access to published Synopsis posts (#36).
//
// Runs in server components during `next build` (and per-request in `next
// dev`), so it uses plain fetch against Supabase's REST endpoint instead of
// the browser client. Only published rows are readable with the anon key
// (RLS), so this can never leak drafts into the export.

export type Post = {
  id: string
  slug: string
  title: string
  description: string
  body_md: string
  // The weather day an AFD post describes (#82); null for hand-written posts.
  event_date: string | null
  published_at: string | null
  updated_at: string
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Image references in body_md are stored as bucket paths ("post-images/…"),
// never full URLs, so a future storage move edits zero rows. This prefix is
// the one place addresses are assembled.
export const POST_IMAGE_BASE = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public/`
  : ''

export function resolvePostImage(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) return src
  return POST_IMAGE_BASE + src
}

async function restFetch(query: string): Promise<Post[]> {
  if (!SUPABASE_URL || !ANON_KEY) return []
  // No cache directive: static export requires build-time fetches to be
  // cacheable, and every build starts fresh anyway.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (!res.ok) throw new Error(`posts fetch failed: HTTP ${res.status}`)
  return (await res.json()) as Post[]
}

// The date a post is filed under chronologically: its weather day if it has
// one (AFD posts, #82), otherwise its publish date. A backfilled historical
// event thus sorts by when the weather happened, not when it was generated.
export function effectiveDate(p: Post): string {
  return p.event_date ?? (p.published_at ?? p.updated_at).slice(0, 10)
}

export async function listPublishedPosts(): Promise<Post[]> {
  const posts = await restFetch(
    'select=id,slug,title,description,body_md,event_date,published_at,updated_at'
    + '&published=eq.true',
  )
  // One-column DB ordering can't mix event_date and published_at, so sort here.
  return posts.sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))
}

// Post bodies are BlockNote block arrays (legacy posts: markdown). True when
// the stored body is the structured format.
export function isJsonBody(body: string): boolean {
  return body.trimStart().startsWith('[')
}

// Plain text from a stored block document (for auto-descriptions).
export function textFromJsonBody(body: string): string {
  try {
    const walk = (n: unknown): string => {
      if (!n || typeof n !== 'object') return ''
      if (Array.isArray(n)) return n.map(walk).join(' ')
      const node = n as { text?: string; content?: unknown[]; children?: unknown[] }
      if (node.text) return node.text
      return [...(node.content ?? []), ...(node.children ?? [])].map(walk).join(' ')
    }
    return walk(JSON.parse(body)).replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

export async function getPublishedPost(slug: string): Promise<Post | null> {
  const rows = await restFetch(
    'select=id,slug,title,description,body_md,event_date,published_at,updated_at'
    + `&published=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  )
  return rows[0] ?? null
}
