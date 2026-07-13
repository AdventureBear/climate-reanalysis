import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function FaqPage({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <article className="faq-doc rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-6 md:p-8 shadow-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </main>

    </div>
  )
}
