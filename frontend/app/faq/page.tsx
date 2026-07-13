import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import FaqPage from './FaqPage'

// Server component: the markdown is read at build time and prerendered.
export default function Faq() {
  const markdown = readFileSync(join(process.cwd(), 'content/FAQ.md'), 'utf-8')
  return <FaqPage markdown={markdown} />
}
