import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Map Builder — PyRe Weather',
}

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children
}
