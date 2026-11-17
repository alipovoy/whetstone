import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { basicSetup, EditorView } from 'codemirror'
import { useEffect, useId, useRef, useState } from 'react'
import { useDarkMode } from './theme'

interface Props {
  initialValue: string
  onChange: (value: string) => void
  label: string
  readOnly?: boolean
  language?: keyof typeof LANGUAGES
}

const LANGUAGES = {
  python: () => [python(), indentUnit.of('    ')],
  // Problems are long documents with long strings: wrapped, and scrolled within a fixed height.
  json: () => [
    json(),
    indentUnit.of('  '),
    EditorView.lineWrapping,
    EditorView.theme({ '&': { maxHeight: '28rem' }, '.cm-scroller': { overflow: 'auto' } }),
  ],
}

export function CodeEditor({
  initialValue,
  onChange,
  label,
  readOnly = false,
  language = 'python',
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [theme] = useState(() => new Compartment())
  const [editable] = useState(() => new Compartment())
  const dark = useDarkMode()
  const hintId = useId()

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      doc: initialValue,
      extensions: [
        basicSetup,
        LANGUAGES[language](),
        // Tab indents, so keyboard users leave the editor with Esc, then Tab (CodeMirror's escape hatch).
        keymap.of([indentWithTab]),
        theme.of([]),
        editable.of([]),
        EditorView.contentAttributes.of({ 'aria-label': label, 'aria-describedby': hintId }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        }),
      ],
    })
    setView(editor)
    return () => editor.destroy()
    // Created once per mount: the parent remounts the editor for another problem.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view?.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) })
  }, [view, theme, dark])

  useEffect(() => {
    view?.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(readOnly)) })
  }, [view, editable, readOnly])

  return (
    <div>
      <div ref={host} className="border rounded" />
      <div id={hintId} className="form-text">
        Tab indents. Press Esc, then Tab, to leave the editor.
      </div>
    </div>
  )
}
