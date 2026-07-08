#!/usr/bin/env node
// Guards against region previews silently disappearing: every path referenced in
// src/regionThumbnails.ts must resolve to a real file under public/. This is the
// realistic regression vector — a renamed file or region key drops the preview with
// no build/lint error. Run: `npm run check:thumbnails` (also wire into CI/build).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const source = join(root, 'src', 'regionThumbnails.ts')
const publicDir = join(root, 'public')

const text = readFileSync(source, 'utf8')
// Match every "/region-thumbnails/<name>.png" string literal in the mapping.
const refs = [...text.matchAll(/['"](\/region-thumbnails\/[a-z0-9-]+\.png)['"]/g)].map(m => m[1])

if (refs.length === 0) {
  console.error('✗ No region-thumbnail paths found in src/regionThumbnails.ts — parser or file changed.')
  process.exit(1)
}

const missing = refs.filter(p => !existsSync(join(publicDir, p)))
const seen = new Set()
const dupes = refs.filter(p => (seen.has(p) ? true : (seen.add(p), false)))

if (missing.length) {
  console.error(`✗ ${missing.length} region thumbnail(s) referenced but missing from public/:`)
  for (const p of missing) console.error(`    ${p}`)
}
if (dupes.length) {
  console.error(`✗ Duplicate thumbnail path(s) in the mapping: ${[...new Set(dupes)].join(', ')}`)
}
if (missing.length || dupes.length) process.exit(1)

console.log(`✓ All ${refs.length} region thumbnails referenced by regionThumbnails.ts exist in public/.`)
