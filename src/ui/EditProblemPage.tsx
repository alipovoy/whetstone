import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { readItems } from '@/core/bridge'
import type { LibraryEntry } from '@/core/library'
import { addProblems, itemText, readDrafts, type TopicRecord } from '@/core/topics'
import { checkProblem } from './check'
import { CodeEditor } from './CodeEditor'
import { ProblemView } from './LibraryPages'
import { Link } from './Link'
import type { Runner } from './ProblemPage'
import { guardLeaving, type Route } from './route'
import { SplitView } from './SplitView'

interface Props {
  record: TopicRecord
  entry: LibraryEntry
  runner: Pick<Runner, 'test'>
  back: Route
  onBusy: (busy: boolean) => void
  onSave: (record: TopicRecord) => void
}

type Outcome = { ok: true } | { ok: false; errors: string[] }

export function EditProblemPage({ record, entry, runner, back, onBusy, onSave }: Props) {
  const [initial] = useState(() => itemText(entry.raw, record.concepts))
  const [text, setText] = useState(initial)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [checking, setChecking] = useState(false)
  const changed = text !== initial
  // Read when leaving, which may be after a save in the same click.
  const unsaved = useRef(false)
  useEffect(() => {
    unsaved.current = changed
  }, [changed])

  // Save leaves the page as its check ends, before an effect could report the end.
  useEffect(() => {
    onBusy(checking)
    return () => onBusy(false)
  }, [checking, onBusy])
  useEffect(() => {
    guardLeaving(() => !unsaved.current || confirm('Leave without saving your changes?'))
    const unload = (event: BeforeUnloadEvent) => {
      if (unsaved.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      guardLeaving(null)
      window.removeEventListener('beforeunload', unload)
    }
  }, [])

  // The preview follows the text while it reads as a problem, and keeps the last one that did.
  const reading = useMemo(() => {
    const read = readItems(text, 'problems')
    if ('error' in read || read.items.length !== 1) return null
    const [draft] = readDrafts(record, read.items, () => entry.id)
    return draft.ok ? draft : null
  }, [text, record, entry.id])
  const [shown, setShown] = useState(reading)
  if (reading && reading !== shown) setShown(reading)

  // The edited topic when the problem passes every check.
  async function check(): Promise<TopicRecord | null> {
    setOutcome(null)
    const read = readItems(text, 'problems')
    if ('error' in read) return fail([read.error])
    const added = addProblems(record, read.items, () => entry.id, entry.id)
    if (!added.ok) return fail(added.errors.flatMap((e) => e.errors))
    setChecking(true)
    try {
      const errors = await checkProblem(runner, added.added[0])
      if (errors.length) return fail(errors)
      setOutcome({ ok: true })
      return added.record
    } catch (e) {
      return fail([e instanceof Error ? e.message : String(e)])
    } finally {
      setChecking(false)
    }
  }
  const fail = (errors: string[]) => {
    setOutcome({ ok: false, errors })
    return null
  }
  async function save() {
    const next = await check()
    if (!next) return
    unsaved.current = false
    onSave(next)
  }

  const editor = (
    <div className="ws-edit-pane">
      {outcome?.ok && <Alert variant="success">Passes the check.</Alert>}
      {outcome && !outcome.ok && (
        <Alert variant="danger">
          {outcome.errors.length === 1 ? 'It does not pass:' : 'It does not pass, because:'}
          <ul className="mb-0 mt-1">
            {outcome.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!outcome && entry.errors.length > 0 && (
        <Alert variant="warning">
          Not served, because:
          <ul className="mb-0 mt-1">
            {entry.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      <CodeEditor
        initialValue={initial}
        onChange={(value) => {
          setText(value)
          setOutcome(null)
        }}
        label="Problem JSON"
        language="json"
        readOnly={checking}
      />
    </div>
  )

  const preview = (
    <div className="ws-edit-pane ws-report-page">
      {!shown ? (
        <p className="text-body-secondary">The preview shows once the JSON reads as a problem.</p>
      ) : (
        <>
          {shown !== reading && (
            <p className="text-body-secondary mb-0">
              The JSON does not read as a problem now; this is how it last read.
            </p>
          )}
          <ProblemView
            topic={{ id: record.id, name: record.name, concepts: shown.concepts }}
            problem={shown.problem}
          />
        </>
      )}
    </div>
  )

  return (
    <section className="ws-edit" aria-labelledby="edit-title">
      <div className="ws-edit-bar">
        <h1 id="edit-title" className="h4 mb-0 me-auto">
          Edit {entry.title}
        </h1>
        <Link className="btn btn-outline-secondary" to={back} held={checking}>
          Back to the problem
        </Link>
        <Button variant="outline-primary" onClick={() => void check()} disabled={checking}>
          {checking ? 'Checking…' : 'Check'}
        </Button>
        <Button onClick={() => void save()} disabled={checking || !changed}>
          Save
        </Button>
      </div>
      <SplitView
        left={{ label: 'JSON', content: editor }}
        right={{ label: 'Preview', content: preview }}
      />
    </section>
  )
}
