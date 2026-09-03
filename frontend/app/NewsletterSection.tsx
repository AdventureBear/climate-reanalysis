import { Mail } from 'lucide-react'
import { GhlForm } from '../ui/GhlForm'
import { NEWSLETTER_FORM } from '../lib/ghlForms'

// Newsletter signup band. The form lives in GoHighLevel; submissions become
// GHL contacts. No em-dashes.
export function NewsletterSection() {
  return (
    <section id="newsletter" className="scroll-mt-4 border-t border-[#0a1330] bg-[#101b40] py-12">
      <div className="mx-auto w-full max-w-2xl px-5 text-center">
        <h2 className="inline-flex items-center gap-2 text-xl font-bold text-slate-100">
          <Mail size={18} className="text-sky-400" /> Get PyRe in your inbox
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Sign up and get my free 5-day guide to making weather maps with PyRe.
          After that, occasional updates on new features and weather stories.
          Unsubscribe anytime.
        </p>
        <div className="mt-6">
          <GhlForm formId={NEWSLETTER_FORM.id} name={NEWSLETTER_FORM.name} height={NEWSLETTER_FORM.height} />
        </div>
      </div>
    </section>
  )
}
