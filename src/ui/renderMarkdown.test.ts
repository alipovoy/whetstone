import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown', () => {
  it('renders Markdown', () => {
    expect(renderMarkdown('Write `f(x)`.')).toBe('<p>Write <code>f(x)</code>.</p>\n')
  })

  it('removes scripts, event handlers and javascript links', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[a](javascript:alert(3))',
    )
    expect(html).not.toMatch(/script|onerror|javascript:/)
  })
})
