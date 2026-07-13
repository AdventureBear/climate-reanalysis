import Link from 'next/link'

// Closes #40: unknown routes previously rendered a blank white page.
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-5xl font-bold text-slate-600">404</p>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="max-w-md text-sm text-slate-400">
          That address doesn&rsquo;t match anything here. The map builder and FAQ are good places to start.
        </p>
        <div className="flex gap-3">
          <Link href="/" className="rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition-colors">
            Map builder
          </Link>
          <Link href="/faq" className="rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors">
            FAQ
          </Link>
        </div>
      </main>
    </div>
  )
}
