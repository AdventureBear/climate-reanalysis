'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  bylineDate,
  displayHeadline,
  leadImagePath,
  resolvePostImage,
  type Post,
} from '../../lib/posts'
import { EditorLink } from './EditorLink'

type FilterKind = 'tag' | 'region'

function chipClass(kind: FilterKind, active = false): string {
  const base = 'relative z-20 rounded border px-2 py-0.5 text-[11px] transition-colors'
  if (kind === 'tag') {
    return active
      ? `${base} border-sky-300/70 bg-sky-400/20 text-sky-100`
      : `${base} border-sky-500/30 bg-sky-950/40 text-sky-200 hover:border-sky-300/60`
  }
  return active
    ? `${base} border-emerald-300/60 bg-emerald-400/20 text-emerald-100`
    : `${base} border-emerald-500/25 bg-emerald-950/30 text-emerald-200 hover:border-emerald-300/50`
}

function filterHref(params: URLSearchParams, kind: FilterKind, value: string, active: boolean): string {
  const next = new URLSearchParams(params)
  if (active) {
    next.delete(kind)
  } else {
    next.set(kind, value)
  }
  const query = next.toString()
  return query ? `/synopsis/?${query}` : '/synopsis/'
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

export function SynopsisPostList({ posts }: { posts: Post[] }) {
  const searchParams = useSearchParams()
  const currentTag = searchParams.get('tag') ?? ''
  const currentRegion = searchParams.get('region') ?? ''

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams])
  const tags = useMemo(() => unique(posts.flatMap(p => p.tags)), [posts])
  const regions = useMemo(() => unique(posts.flatMap(p => p.regions)), [posts])
  const filtered = useMemo(
    () => posts.filter(p =>
      (!currentTag || p.tags.includes(currentTag)) &&
      (!currentRegion || p.regions.includes(currentRegion)),
    ),
    [posts, currentTag, currentRegion],
  )

  return (
    <>
      {(tags.length > 0 || regions.length > 0) && (
        <div className="mt-7 space-y-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs uppercase tracking-wide text-slate-500">Tags</span>
              {tags.map(t => (
                <Link
                  key={`filter-tag-${t}`}
                  href={filterHref(params, 'tag', t, currentTag === t)}
                  className={chipClass('tag', currentTag === t)}
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
          {regions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs uppercase tracking-wide text-slate-500">Regions</span>
              {regions.map(r => (
                <Link
                  key={`filter-region-${r}`}
                  href={filterHref(params, 'region', r, currentRegion === r)}
                  className={chipClass('region', currentRegion === r)}
                >
                  {r}
                </Link>
              ))}
            </div>
          )}
          {(currentTag || currentRegion) && (
            <Link href="/synopsis/" className="inline-block text-xs text-sky-300 underline underline-offset-2 hover:text-sky-200">
              Clear filters
            </Link>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="mt-10 text-slate-400">No stories match those filters.</p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {filtered.map(p => {
          const thumb = leadImagePath(p.body_md, p.slug)
          return (
            <div
              key={p.slug}
              className="relative flex gap-5 rounded-2xl border border-[#2e4278]/60 bg-[#1b2a55]/70 p-5 transition-all hover:-translate-y-0.5 hover:border-sky-500/50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-wide text-sky-300/80">{bylineDate(p)}</div>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">
                  <Link href={`/synopsis/${p.slug}/`} className="after:absolute after:inset-0">
                    {displayHeadline(p)}
                  </Link>
                </h2>
                {p.description && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{p.description}</p>
                )}
                {(p.tags.length > 0 || p.regions.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.tags.slice(0, 6).map(t => (
                      <Link
                        key={`card-tag-${p.slug}-${t}`}
                        href={filterHref(params, 'tag', t, currentTag === t)}
                        className={chipClass('tag', currentTag === t)}
                      >
                        {t}
                      </Link>
                    ))}
                    {p.regions.slice(0, 3).map(r => (
                      <Link
                        key={`card-region-${p.slug}-${r}`}
                        href={filterHref(params, 'region', r, currentRegion === r)}
                        className={chipClass('region', currentRegion === r)}
                      >
                        {r}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="relative z-20 mt-3 empty:mt-0">
                  <EditorLink postId={p.id} />
                </div>
              </div>
              {thumb && (
                <img
                  src={resolvePostImage(thumb)}
                  alt=""
                  loading="lazy"
                  className="hidden h-24 w-36 shrink-0 self-center rounded-lg object-cover sm:block"
                />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
