import type { Metadata } from 'next'

// Admin tools are account-gated app pages; search engines should never
// index them, so no canonical — just an explicit noindex.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
