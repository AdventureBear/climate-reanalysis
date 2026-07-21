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
// one (AFD posts, #82), otherwise its publish date. Not the default index
// order (that stays publish-date) — reserved for a future chronological
// browse/sort/filter/search page.
export function effectiveDate(p: Post): string {
  return p.event_date ?? (p.published_at ?? p.updated_at).slice(0, 10)
}

export async function listPublishedPosts(): Promise<Post[]> {
  return restFetch(
    'select=id,slug,title,description,body_md,event_date,published_at,updated_at'
    + '&published=eq.true&order=published_at.desc',
  )
}

// Post bodies are BlockNote block arrays (legacy posts: markdown). True when
// the stored body is the structured format.
export function isJsonBody(body: string): boolean {
  return body.trimStart().startsWith('[')
}

// Parse a YYYY-MM-DD date string as a local calendar day (no timezone shift).
function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// The headline without the "US Weather <weekday> <month> <day>, <year>: "
// prefix that compose_title adds to AFD posts (#88). The prefix is rebuilt
// exactly from event_date and stripped; hand-written posts (no event_date)
// keep their title as-is. The full title stays the SEO <title> / OG value.
export function displayHeadline(p: Post): string {
  if (!p.event_date) return p.title
  const d = localDate(p.event_date)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  const prefix = `US Weather ${weekday} ${month} ${d.getDate()}, ${d.getFullYear()}: `
  return p.title.startsWith(prefix) ? p.title.slice(prefix.length) : p.title
}

// The date shown as a byline: the weather day for AFD posts, else the publish
// date. AFD posts read as "Thursday, July 16, 2026"; others "July 15, 2026".
export function bylineDate(p: Post): string {
  if (p.event_date) {
    return localDate(p.event_date).toLocaleDateString('en-US',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }
  return p.published_at
    ? new Date(p.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
}

// All image paths in a post body, as stored bucket paths. AFD bodies are
// markdown (![caption](post-images/...)); hand-written posts are BlockNote
// JSON with image blocks.
export function imagePaths(body: string): string[] {
  if (isJsonBody(body)) {
    const out: string[] = []
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return
      if (Array.isArray(n)) { n.forEach(walk); return }
      const node = n as { type?: string; props?: { url?: string }; content?: unknown[]; children?: unknown[] }
      if (node.type === 'image' && node.props?.url) out.push(node.props.url)
      walk(node.content ?? [])
      walk(node.children ?? [])
    }
    try { walk(JSON.parse(body)) } catch { /* fall through to empty */ }
    return out
  }
  return [...body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1])
}

// Lead thumbnail (#84): a varied pick from the post's images, seeded by slug
// so each post shows a different map (AFDs all open with the 500mb overview,
// so the first image would look repetitive). Deterministic — stable across
// builds. Null when the post has no image.
export function leadImagePath(body: string, seed: string): string | null {
  const paths = imagePaths(body)
  if (paths.length === 0) return null
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0
  return paths[Math.abs(h) % paths.length]
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
