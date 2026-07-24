// The one definition of how a text link looks, applied wherever code writes
// an <a> tag: BlockRenderer (block posts), the ReactMarkdown renderers
// (markdown posts, FAQ, legal pages), and the BlockNote editor (via its
// links.HTMLAttributes option). Tailwind's reset strips browser link
// styling, so every link writer imports this instead of scoped CSS rules.
export const TEXT_LINK =
  'cursor-pointer text-sky-400 underline underline-offset-2 hover:text-sky-300'
