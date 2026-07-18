// The one content container for reading pages (synopsis, FAQ, about, legal):
// every text page shares this width so the site stops drifting page by page.
// Tool screens (map builder, post editor) are deliberately wider and do not
// use this shell.
export function PageShell({ children, className = '' }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main className={`mx-auto w-full max-w-6xl px-5 py-12 ${className}`}>
      {children}
    </main>
  )
}
