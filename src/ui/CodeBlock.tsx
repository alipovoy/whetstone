import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import {
  defaultHighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
} from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from 'codemirror'
import { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import { useDarkMode } from './theme'

const LANGUAGES = {
  json: () => json(),
  // Markdown whose fenced json blocks are highlighted as JSON.
  markdown: () =>
    markdown({
      codeLanguages: [LanguageDescription.of({ name: 'json', support: json() })],
    }),
}

interface Props {
  value: string
  language: keyof typeof LANGUAGES
  label: string
}

export function CodeBlock({ value, language, label }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [theme] = useState(() => new Compartment())
  const [copied, setCopied] = useState<string | null>(null)
  const dark = useDarkMode()

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        LANGUAGES[language](),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        EditorView.theme({ '&': { maxHeight: '24rem' }, '.cm-scroller': { overflow: 'auto' } }),
        theme.of([]),
        EditorView.contentAttributes.of({ 'aria-label': label }),
      ],
    })
    setView(editor)
    return () => editor.destroy()
    // Created once per mount; the value is kept in sync below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [view, value])

  useEffect(() => {
    view?.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) })
  }, [view, theme, dark])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => setCopied('Copied'),
      () => setCopied('Copy failed'),
    )

  return (
    <div className="position-relative border rounded small">
      <Button
        size="sm"
        variant="light"
        className="position-absolute top-0 end-0 m-1 border"
        style={{ zIndex: 1 }}
        aria-label={`Copy ${label}`}
        onClick={() => void copy()}
      >
        {copied ?? 'Copy'}
      </Button>
      <div ref={host} />
    </div>
  )
}
