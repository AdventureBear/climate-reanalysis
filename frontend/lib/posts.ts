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
  category: string
  // The weather day this post is about (#82). AFD posts get it from the
  // pipeline; hand-written posts can carry one too, since they're also about
  // a specific day's weather.
  event_date: string | null
  published_at: string | null
  updated_at: string
}

// Posts generated from an Area Forecast Discussion (#37).
export const AFD_CATEGORY = 'forecast discussion'

// AFD posts are a daily record — they read as a chronological series of the
// weather itself. Everything else is a retrospective article, written and
// filed on the day it was published. That difference decides both the byline
// and the list order below.
export function isDailyRecord(p: Post): boolean {
  return p.category === AFD_CATEGORY
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

// The date a post is filed under: the weather day for a daily AFD record, the
// publish date for a retrospective article (which may also carry a weather
// date, but was deliberately written and filed later).
//
// Kept as the full publish timestamp rather than a sliced date so two posts
// published on the same day still order by the hour they went out. Both forms
// are ISO, so they compare correctly against each other as strings.
export function effectiveDate(p: Post): string {
  const published = p.published_at ?? p.updated_at
  return isDailyRecord(p) ? (p.event_date ?? published) : published
}

export async function listPublishedPosts(): Promise<Post[]> {
  const posts = await restFetch(
    'select=id,slug,title,description,body_md,category,event_date,published_at,updated_at'
    + '&published=eq.true',
  )
  // Reverse chronological by each post's own filing date. Sorted here rather
  // than in the query because the key differs by post type, and one-column
  // PostgREST ordering can't express that.
  return posts.sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))
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

// The byline date, matching the order key. A daily AFD record is bylined with
// the weather day it documents ("Thursday, July 16, 2026"); a retrospective
// article is bylined with its publish date ("July 15, 2026") even when it
// carries a weather date, because it was deliberately written later.
export function bylineDate(p: Post): string {
  if (isDailyRecord(p) && p.event_date) {
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
    'select=id,slug,title,description,body_md,category,event_date,published_at,updated_at'
    + `&published=eq.true&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  )
  return rows[0] ?? null
}
