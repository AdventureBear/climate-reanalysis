import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolvePostImage } from '../../../lib/posts'
import { TEXT_LINK } from '../../../ui/linkStyles'
import { BlockRenderer } from './BlockRenderer'

// Renders a post body at build time. Two formats: BlockNote block arrays
// ('[' lead) and legacy markdown (everything else).
export function PostBody({ body }: { body: string }) {
  if (body.trimStart()[0] === '[') {
    let blocks: Parameters<typeof BlockRenderer>[0]['blocks']
    try {
      blocks = JSON.parse(body)
    } catch {
      blocks = []
    }
    return <BlockRenderer blocks={blocks} />
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url, key) => (key === 'src' ? resolvePostImage(url) : url)}
      components={{
        img: props => (
          <img
            {...props}
            alt={props.alt ?? ''}
            loading="lazy"
            className="mx-auto max-w-full rounded-lg"
          />
        ),
        a: props => <a {...props} className={TEXT_LINK} />,
      }}
    >
      {body}
    </ReactMarkdown>
  )
}
