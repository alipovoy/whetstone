import DOMPurify from 'dompurify'
import { marked } from 'marked'

export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false }))
}

// One line, without a wrapping paragraph: for an option of a question.
export function renderInlineMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parseInline(source, { async: false }))
}
