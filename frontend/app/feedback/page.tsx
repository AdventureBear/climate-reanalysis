import type { Metadata } from 'next'
import { PageShell } from '../../ui/PageShell'
import { GhlForm } from '../../ui/GhlForm'
import { FEEDBACK_FORM } from '../../lib/ghlForms'
import { SITE_URL } from '../../lib/siteUrls'

export const metadata: Metadata = {
  title: 'Feedback — PyRe Weather',
  description: 'Tell us what is working, what is broken, and what PyRe Weather should build next.',
  alternates: { canonical: `${SITE_URL}/feedback/` },
}

export default function Feedback() {
  return (
    <div className="flex-1 bg-[#16224a]">
      <PageShell className="max-w-2xl">
        {/* Headline and intro live inside the GHL form so they align with it. */}
        <GhlForm formId={FEEDBACK_FORM.id} name={FEEDBACK_FORM.name} height={FEEDBACK_FORM.height} />
      </PageShell>
    </div>
  )
}