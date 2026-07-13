import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft } from 'lucide-react'
import { SiteFooter } from './SiteFooter'
import privacyMarkdown from './content/PRIVACY.md?raw'
import termsMarkdown from './content/TERMS.md?raw'

// Markdown-backed legal pages. Google OAuth app verification requires public
// privacy-policy and terms-of-service URLs, which is why these exist.
function LegalPage({ markdown }: { markdown: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-700 px-5 py-3 flex items-center gap-3">
        <img src="/logo-mark.png" alt="" className="h-5 w-5 shrink-0" />
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <article className="faq-doc rounded-2xl border border-slate-700/60 bg-slate-900/70 p-6 md:p-8 shadow-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}

export function PrivacyPage() {
  return <LegalPage markdown={privacyMarkdown} />
}

export function TermsPage() {
  return <LegalPage markdown={termsMarkdown} />
}
