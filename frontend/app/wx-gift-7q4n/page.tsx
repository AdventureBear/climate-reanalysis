import type { Metadata } from 'next'
import BirthdayPackageApp from './BirthdayPackageApp'

export const metadata: Metadata = {
  title: 'Birthday Maps | PyRe Weather',
  description: 'Generate a PyRe map package for one date and birthplace.',
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

export default function BirthdayPage() {
  return <BirthdayPackageApp />
}
