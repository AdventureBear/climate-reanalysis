import type { Metadata } from 'next'
import { APP_URL } from '../../lib/siteUrls'

export const metadata: Metadata = {
  title: 'Map Builder — PyRe Weather',
  // Both hosts serve this page; search engines should index only the app copy.
  alternates: { canonical: `${APP_URL}/map/` },
}

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children
}
