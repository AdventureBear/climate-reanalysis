// Renders a schema.org JSON-LD block (#86). Static export bakes the script
// into the HTML at build time, so crawlers see it without running any JS.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
