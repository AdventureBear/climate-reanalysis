import type { Metadata } from 'next'
import { AuthProvider } from '../auth/AuthProvider'
import { Analytics } from './analytics'
import '../index.css'

export const metadata: Metadata = {
  title: 'PyRe Weather - A Climate Reanalysis Playground for Meteorology Students and Researchers',
  description:
    'Build custom composite, anomaly, and climatology maps from NOAA CORe reanalysis data — the community replacement for the retired PSL plotting tools.',
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Analytics />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
