import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from './auth/AuthProvider'
import { SiteHeader } from '../chrome/SiteHeader'
import { SiteFooter } from '../chrome/SiteFooter'
import { Analytics } from './analytics'
import { JsonLd } from '../ui/JsonLd'
import { graph, personSchema, websiteSchema } from '../lib/structuredData'
import '../index.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

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
      <body className={inter.className}>
        {/* Site-wide entities; page-level schemas reference these by @id. */}
        <JsonLd data={graph(websiteSchema, personSchema)} />
        <Analytics />
        <AuthProvider>
          <div className="min-h-screen bg-[#131d3f] text-slate-100 flex flex-col">
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
