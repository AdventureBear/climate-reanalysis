import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '../LegalPage'
import { SITE_URL } from '../../lib/siteUrls'

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/terms/` },
}

export default function Terms() {
  const markdown = readFileSync(join(process.cwd(), 'content/TERMS.md'), 'utf-8')
  return <LegalPage markdown={markdown} />
}
