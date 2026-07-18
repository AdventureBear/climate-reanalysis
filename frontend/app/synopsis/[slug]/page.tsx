import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublishedPost, listPublishedPosts } from '../../../lib/posts'
import { PostBody } from './PostBody'
import { EditorLink } from '../EditorLink'
import { PageShell } from '../../../ui/PageShell'
import { Lightbox } from './Lightbox'

type Params = { slug: string }

// Static export: only slugs returned here become pages; anything else 404s.
export const dynamicParams = false

// Static export refuses a dynamic route whose param list is empty, so with
// zero published posts we emit one hidden placeholder page instead of
// letting the whole site build fail.
const PLACEHOLDER_SLUG = 'coming-soon'

export async function generateStaticParams(): Promise<Params[]> {
  const posts = await listPublishedPosts()
  if (posts.length === 0) return [{ slug: PLACEHOLDER_SLUG }]
  return posts.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublishedPost(slug)
  if (!post) return { title: 'The Synopsis — PyRe Weather', robots: { index: false } }
  return {
    title: `${post.title} — The Synopsis — PyRe Weather`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.published_at ?? undefined,
    },
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function SynopsisPost({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const post = await getPublishedPost(slug)
  if (!post && slug === PLACEHOLDER_SLUG) {
    return (
      <div className="flex-1 bg-[#16224a]">
        <PageShell>
          <h1 className="text-2xl font-bold text-white">No stories yet</h1>
          <p className="mt-3 text-slate-300">
            The Synopsis is warming up. Check back soon.
          </p>
          <Link href="/synopsis/" className="mt-4 inline-block text-sky-400 underline underline-offset-2 hover:text-sky-300">
            Back to The Synopsis
          </Link>
        </PageShell>
      </div>
    )
  }
  if (!post) notFound()

  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell>
        <div className="flex items-center justify-between">
          <Link href="/synopsis/" className="text-sm text-sky-400 underline underline-offset-2 hover:text-sky-300">
            ← The Synopsis
          </Link>
          <EditorLink postId={post.id} />
        </div>
        <article className="mt-6">
          <div className="text-xs uppercase tracking-wide text-sky-300/80">{formatDate(post.published_at)}</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">{post.title}</h1>
          {post.description && (
            <p className="mt-3 text-lg leading-relaxed text-slate-300">{post.description}</p>
          )}
          <div className="faq-doc mt-8 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-6 md:p-8">
            <PostBody body={post.body_md} />
          </div>
          <Lightbox />
        </article>
      </PageShell>
    </div>
  )
}
