#!/usr/bin/env node
// Guards against region map assets silently disappearing: every path referenced in
// the region asset manifests must resolve to a real file under public/. This is the
// realistic regression vector: a renamed file or region key drops an image with
// no build/lint error. Run: `npm run check:thumbnails` (also wire into CI/build).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const publicDir = join(root, 'public')

const sources = [
  {
    label: 'region thumbnails',
    source: join(root, 'lib', 'regionThumbnails.ts'),
    pattern: /['"](\/region-thumbnails\/[a-z0-9-]+\.png)['"]/g,
  },
  {
    label: 'region previews',
    source: join(root, 'lib', 'regionPreviews.ts'),
    pattern: /['"](\/region-previews\/[a-z0-9-]+\.png)['"]/g,
  },
]

let failed = false

for (const assetSet of sources) {
  const text = readFileSync(assetSet.source, 'utf8')
  const refs = [...text.matchAll(assetSet.pattern)].map(m => m[1])

  if (refs.length === 0) {
    console.error(`✗ No ${assetSet.label} paths found in ${assetSet.source} — parser or file changed.`)
    failed = true
    continue
  }

  const missing = refs.filter(p => !existsSync(join(publicDir, p)))
  const seen = new Set()
  const dupes = refs.filter(p => (seen.has(p) ? true : (seen.add(p), false)))

  if (missing.length) {
    console.error(`✗ ${missing.length} ${assetSet.label} referenced but missing from public/:`)
    for (const p of missing) console.error(`    ${p}`)
    failed = true
  }
  if (dupes.length) {
    console.error(`✗ Duplicate ${assetSet.label} path(s) in the mapping: ${[...new Set(dupes)].join(', ')}`)
    failed = true
  }
  if (!missing.length && !dupes.length) {
    console.log(`✓ All ${refs.length} ${assetSet.label} referenced by ${assetSet.source} exist in public/.`)
  }
}

if (failed) process.exit(1)
