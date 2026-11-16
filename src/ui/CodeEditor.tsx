import { python } from '@codemirror/lang-python'
import { Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup, EditorView } from 'codemirror'
import { useEffect, useRef, useState } from 'react'
import { useDarkMode } from './theme'

interface Props {
  initialValue: string
  onChange: (value: string) => void
  label: string
}

export function CodeEditor({ initialValue, onChange, label }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [theme] = useState(() => new Compartment())
  const dark = useDarkMode()

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      doc: initialValue,
      extensions: [
        basicSetup,
        python(),
        theme.of([]),
        EditorView.contentAttributes.of({ 'aria-label': label }),
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

  return <div ref={host} className="border rounded" />
}
