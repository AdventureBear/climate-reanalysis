import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, CircleHelp, Wind } from 'lucide-react'
import faqMarkdown from './content/FAQ.md?raw'

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-700 px-5 py-3 flex items-center gap-3">
        <Wind className="text-sky-400 shrink-0" size={20} />
        <span className="font-bold tracking-tight text-sm">PyRe</span>
        <span className="text-slate-400 text-sm font-light">Climate Reanalysis</span>
        <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">CORe / NCEP</span>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft size={15} />
            Back To Builder
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
        <section className="mb-8 rounded-2xl border border-slate-700/60 bg-slate-900/80 p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-sky-900/40 p-3 text-sky-300">
              <CircleHelp size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">PyRe FAQ</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
                This page is built directly from the frontend FAQ markdown source. Add or edit a question in{' '}
                <a
                  href="https://github.com/AdventureBear/climate-reanalysis/blob/main/frontend/src/content/FAQ.md"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
                >
                  frontend/src/content/FAQ.md
                </a>{' '}
                and the page will update on the next dev refresh or production build.
              </p>
            </div>
          </div>
        </section>

        <article className="faq-doc rounded-2xl border border-slate-700/60 bg-slate-900/70 p-6 md:p-8 shadow-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{faqMarkdown}</ReactMarkdown>
        </article>
      </main>
    </div>
  )
}
