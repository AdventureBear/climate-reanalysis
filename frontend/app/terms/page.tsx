import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LegalPage } from '../../LegalPage'

export default function Terms() {
  const markdown = readFileSync(join(process.cwd(), 'content/TERMS.md'), 'utf-8')
  return <LegalPage markdown={markdown} />
}
