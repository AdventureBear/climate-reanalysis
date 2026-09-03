import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '../LegalPage'
import { SITE_URL } from '../../lib/siteUrls'

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/privacy/` },
}

export default function Privacy() {
  const markdown = readFileSync(join(process.cwd(), 'content/PRIVACY.md'), 'utf-8')
  return <LegalPage markdown={markdown} />
}
