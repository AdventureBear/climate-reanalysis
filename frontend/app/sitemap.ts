import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '../lib/posts'

export const dynamic = 'force-static'

const SITE = 'https://www.pyreweather.org'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedPosts()
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/map/`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE}/synopsis/`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/faq/`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/about/`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE}/privacy/`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE}/terms/`, changeFrequency: 'yearly', priority: 0.1 },
  ]
  const postPages: MetadataRoute.Sitemap = posts.map(p => ({
    url: `${SITE}/synopsis/${p.slug}/`,
    lastModified: p.updated_at,
    changeFrequency: 'yearly',
    priority: 0.7,
  }))
  return [...staticPages, ...postPages]
}
