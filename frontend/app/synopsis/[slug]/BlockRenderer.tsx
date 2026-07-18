import type { ReactNode } from 'react'
import { resolvePostImage } from '../../../lib/posts'

// Renders BlockNote's stored document (an array of blocks) to plain JSX at
// build time. Deliberately dependency-free: BlockNote's own server renderer
// cannot run inside a Next server component, and our own markup styled by
// the site's CSS beats importing the editor's stylesheet into public pages.
// Covers the block types the editor offers; unknown blocks render their text.

type InlineNode = {
  type?: string
  text?: string
  href?: string
  content?: InlineNode[]
  styles?: Record<string, boolean | string>
}

type Block = {
  id?: string
  type?: string
  props?: Record<string, string | number | boolean>
  content?: InlineNode[] | { type?: string }
  children?: Block[]
}

function renderInline(nodes: InlineNode[] | undefined, keyBase: string): ReactNode[] {
  if (!nodes) return []
  return nodes.map((n, i) => {
    const key = `${keyBase}-${i}`
    if (n.type === 'link') {
      return <a key={key} href={n.href}>{renderInline(n.content, key)}</a>
    }
    let el: ReactNode = n.text ?? ''
    const s = n.styles ?? {}
    if (s.code) el = <code key={`${key}c`}>{el}</code>
    if (s.bold) el = <strong key={`${key}b`}>{el}</strong>
    if (s.italic) el = <em key={`${key}i`}>{el}</em>
    if (s.underline) el = <u key={`${key}u`}>{el}</u>
    if (s.strike) el = <s key={`${key}s`}>{el}</s>
    return <span key={key}>{el}</span>
  })
}

function imageBlock(b: Block, key: string): ReactNode {
  const p = b.props ?? {}
  const url = typeof p.url === 'string' ? resolvePostImage(p.url) : ''
  if (!url) return null
  const width = typeof p.previewWidth === 'number' ? p.previewWidth : undefined
  const align = p.textAlignment
  const margin = align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto'
  const caption = typeof p.caption === 'string' ? p.caption : ''
  return (
    <figure key={key} style={{ margin: '1.25rem 0' }}>
      <img
        src={url}
        alt={caption || (typeof p.name === 'string' ? p.name : '')}
        loading="lazy"
        style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: '0.5rem', margin, width: width ? `${width}px` : undefined }}
      />
      {caption && (
        <figcaption style={{ textAlign: 'center', fontSize: '0.85em', opacity: 0.75, marginTop: '0.4rem' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

function blockContent(b: Block): InlineNode[] | undefined {
  return Array.isArray(b.content) ? b.content : undefined
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  const out: ReactNode[] = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    const key = b.id ?? String(i)
    const type = b.type ?? 'paragraph'

    // Consecutive list items group into one list element.
    if (type === 'bulletListItem' || type === 'numberedListItem') {
      const items: ReactNode[] = []
      const listType = type
      while (i < blocks.length && blocks[i].type === listType) {
        const item = blocks[i]
        items.push(
          <li key={item.id ?? String(i)}>
            {renderInline(blockContent(item), item.id ?? String(i))}
            {item.children && item.children.length > 0 && <BlockRenderer blocks={item.children} />}
          </li>,
        )
        i++
      }
      out.push(listType === 'bulletListItem' ? <ul key={`ul-${key}`}>{items}</ul> : <ol key={`ol-${key}`}>{items}</ol>)
      continue
    }

    switch (type) {
      case 'heading': {
        const level = Number(b.props?.level ?? 2)
        const inner = renderInline(blockContent(b), key)
        out.push(level <= 1 ? <h2 key={key}>{inner}</h2> : level === 2 ? <h2 key={key}>{inner}</h2> : <h3 key={key}>{inner}</h3>)
        break
      }
      case 'image':
        out.push(imageBlock(b, key))
        break
      case 'quote':
        out.push(<blockquote key={key}>{renderInline(blockContent(b), key)}</blockquote>)
        break
      case 'codeBlock':
        out.push(<pre key={key}><code>{renderInline(blockContent(b), key)}</code></pre>)
        break
      default:
        out.push(<p key={key}>{renderInline(blockContent(b), key)}</p>)
    }
    if (b.children && b.children.length > 0 && type !== 'bulletListItem' && type !== 'numberedListItem') {
      out.push(<BlockRenderer key={`ch-${key}`} blocks={b.children} />)
    }
    i++
  }
  return <>{out}</>
}
