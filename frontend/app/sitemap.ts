import type { MetadataRoute } from 'next'
import { listPublishedPosts } from '../lib/posts'
import { APP_URL, SITE_URL as SITE } from '../lib/siteUrls'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedPosts()
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    // /map is canonical on the app host. Cross-host sitemap entries need a
    // Search Console *Domain* property for pyreweather.org (covers subdomains).
    { url: `${APP_URL}/map/`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE}/synopsis/`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/changelog/`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE}/faq/`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/feedback/`, changeFrequency: 'monthly', priority: 0.3 },
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
