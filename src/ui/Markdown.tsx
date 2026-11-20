import { useMemo } from 'react'
import { renderInlineMarkdown, renderMarkdown } from './renderMarkdown'

export function Markdown({ source, inline }: { source: string; inline?: boolean }) {
  const html = useMemo(
    () => (inline ? renderInlineMarkdown : renderMarkdown)(source),
    [source, inline],
  )
  const Tag = inline ? 'span' : 'div'
  return <Tag className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
}
