import Script from 'next/script'

// GoHighLevel inline form embed. The form is built and hosted in GHL;
// submissions land as GHL contacts and trigger GHL automations. The
// form_embed.js helper reads the data-* attributes and manages the iframe
// height after load; the height prop is the form's designed height and
// serves as the pre-script fallback so the page doesn't jump.
export function GhlForm({ formId, name, height }: {
  formId: string
  name: string
  height: number
}) {
  const iframeId = `inline-${formId}`
  return (
    <>
      <iframe
        src={`https://api.leadconnectorhq.com/widget/form/${formId}`}
        className="w-full rounded-lg border-0"
        style={{ height }}
        id={iframeId}
        data-layout="{'id':'INLINE'}"
        data-trigger-type="alwaysShow"
        data-trigger-value=""
        data-activation-type="alwaysActivated"
        data-activation-value=""
        data-deactivation-type="neverDeactivate"
        data-deactivation-value=""
        data-form-name={name}
        data-height={height}
        data-layout-iframe-id={iframeId}
        data-form-id={formId}
        data-cookie-consent="true"
        data-cookie-consent-provider="auto"
        title={name}
      />
      <Script src="https://link.msgsndr.com/js/form_embed.js" strategy="lazyOnload" />
    </>
  )
}