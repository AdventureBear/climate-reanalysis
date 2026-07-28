import type { Metadata } from 'next'
import SingleDatePackageApp from './SingleDatePackageApp'

export const metadata: Metadata = {
  title: 'Single Date Map Package | PyRe Weather',
  description: 'Generate a PyRe map package for one date and location.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default function SingleDatePage() {
  return <SingleDatePackageApp />
}
