import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import FaqPage from './FaqPage'
import { SITE_URL } from '../../lib/siteUrls'

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/faq/` },
}

// Server component: the markdown is read at build time and prerendered.
export default function Faq() {
  const markdown = readFileSync(join(process.cwd(), 'content/FAQ.md'), 'utf-8')
  return <FaqPage markdown={markdown} />
}
