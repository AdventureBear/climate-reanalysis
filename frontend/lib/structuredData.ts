// schema.org JSON-LD for search engines (#86). The site is a free
// educational meteorology tool, so the vocabulary is deliberate:
// LearningResource for the tool/tutorial pages, Article for Synopsis posts,
// WebSite/Person sitewide, BreadcrumbList where there's a hierarchy. We do
// NOT emit Dataset — the site renders images from NOAA's public reanalysis
// rather than hosting downloadable data, and Dataset Search expects the
// latter (see #86 for the reasoning).
import { POST_IMAGE_BASE, leadImagePath, type Post } from './posts'

export const SITE_URL = 'https://www.pyreweather.org'
const AUTHOR_NAME = 'Suzanne Atkinson'

// Stable @ids let the graph reference one entity instead of repeating it.
const SITE_ID = `${SITE_URL}/#website`
const AUTHOR_ID = `${SITE_URL}/#person`

export const personSchema = {
  '@type': 'Person',
  '@id': AUTHOR_ID,
  name: AUTHOR_NAME,
  url: `${SITE_URL}/about/`,
}

export const websiteSchema = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  name: 'PyRe Weather',
  url: `${SITE_URL}/`,
  description:
    'Build custom composite, anomaly, and climatology maps from NOAA CORe reanalysis data — '
    + 'the community replacement for the retired PSL plotting tools.',
  inLanguage: 'en-US',
  creator: { '@id': AUTHOR_ID },
  isAccessibleForFree: true,
}

// The homepage/tool: what students and teachers actually search for.
export const learningResourceSchema = {
  '@type': 'LearningResource',
  '@id': `${SITE_URL}/#learningresource`,
  name: 'PyRe Weather — create your own weather maps',
  url: `${SITE_URL}/`,
  description:
    'A free tool for building publication-quality weather maps from reanalysis data back to 1950, '
    + 'for meteorology students, teachers, and researchers.',
  learningResourceType: 'interactive tool',
  educationalLevel: 'high school, undergraduate, graduate',
  educationalUse: ['instruction', 'practice', 'research'],
  audience: {
    '@type': 'EducationalAudience',
    educationalRole: 'student, teacher, researcher',
  },
  about: 'Meteorology, weather forecasting, synoptic analysis, climate reanalysis',
  isAccessibleForFree: true,
  creator: { '@id': AUTHOR_ID },
  isPartOf: { '@id': SITE_ID },
}

// A Synopsis post. datePublished is when the article was published — a full
// timestamp with timezone, which is what validators expect (a bare date is
// flagged as an invalid datetime). The weather day the post describes is a
// different thing and belongs in temporalCoverage, not datePublished: a
// backfilled Helene recap really was published in 2026, about 2024 weather.
export function articleSchema(post: Post) {
  const url = `${SITE_URL}/synopsis/${post.slug}/`
  const image = leadImagePath(post.body_md, post.slug)
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.published_at ?? post.updated_at,
    dateModified: post.updated_at,
    ...(post.event_date ? { temporalCoverage: post.event_date } : {}),
    // Same entity as the sitewide Person (@id), but with the name inline:
    // validators flag a bare @id reference as "author missing name" when the
    // entity is defined in a different <script> block on the page.
    author: { '@type': 'Person', '@id': AUTHOR_ID, name: AUTHOR_NAME },
    publisher: { '@type': 'Person', '@id': AUTHOR_ID, name: AUTHOR_NAME },
    isPartOf: { '@id': SITE_ID },
    isAccessibleForFree: true,
    ...(image ? { image: POST_IMAGE_BASE + image } : {}),
  }
}

export function breadcrumbSchema(post: Post) {
  const crumbs = [
    { name: 'Home', item: `${SITE_URL}/` },
    { name: 'The Synopsis', item: `${SITE_URL}/synopsis/` },
    { name: post.title, item: `${SITE_URL}/synopsis/${post.slug}/` },
  ]
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  }
}

// One @graph per page keeps the entities cross-referenced by @id rather than
// duplicated across several <script> tags.
export function graph(...nodes: object[]) {
  return { '@context': 'https://schema.org', '@graph': nodes }
}
