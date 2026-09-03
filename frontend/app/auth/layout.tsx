import type { Metadata } from 'next'

// Auth callback/reset pages are transient; search engines should never
// index them, so no canonical — just an explicit noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
