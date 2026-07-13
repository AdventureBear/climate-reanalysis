import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CircleHelp } from 'lucide-react'

export default function FaqPage({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <section className="mb-8 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/80 p-6 shadow-xl">
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

        <article className="faq-doc rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-6 md:p-8 shadow-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </main>

    </div>
  )
}
