import { useEffect, useState } from 'react'
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap'
import type { Difficulty } from '@/content/schema'
import { PROBLEM_TEMPLATE, problemRequest, readItems } from '@/core/bridge'
import { readDrafts, served, type Draft, type TopicRecord } from '@/core/topics'
import { checkProblem } from './check'
import { CodeBlock } from './CodeBlock'
import { CodeEditor } from './CodeEditor'
import { Link } from './Link'
import type { Runner } from './ProblemPage'
import { ProblemOrderForm, type Order } from './ProblemOrderForm'
import type { Route } from './route'
import { Statement } from './Statement'

interface Props {
  topics: TopicRecord[]
  // Prefilled from where the page was opened.
  initial: { topic?: string; concepts?: string[]; difficulty?: Difficulty }
  runner: Pick<Runner, 'test'>
  back: Route
  onBusy: (busy: boolean) => void
  onAdd: (topic: string, items: unknown[]) => void
}

type Source = 'chat' | 'json'

interface Checked {
  draft: Draft
  // Errors of the Python check, for a problem that reads.
  errors: string[]
  ticked: boolean
}

export function AddProblemsPage({ topics, initial, runner, back, onBusy, onAdd }: Props) {
  const ordered = topics.toSorted((a, b) => a.created_at - b.created_at)
  const [order, setOrder] = useState<Order>(() => {
    const topic = ordered.find((t) => t.id === initial.topic) ?? ordered[0]
    const names = new Set(topic?.concepts.map((c) => c.name))
    return {
      topic: topic?.id ?? '',
      focus: (initial.concepts ?? []).filter((n) => names.has(n)),
      difficulty: initial.difficulty ?? 'Mixed',
      count: 3,
    }
  })
  const [source, setSource] = useState<Source>('chat')
  const [texts, setTexts] = useState<Record<Source, string>>({ chat: '', json: PROBLEM_TEMPLATE })
  const [checked, setChecked] = useState<Checked[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => onBusy(checking), [checking, onBusy])

  const record = ordered.find((t) => t.id === order.topic)
  if (!record)
    return (
      <div className="ws-panel ws-empty">
        <h1 className="h4">Add problems</h1>
        <p className="text-body-secondary">Problems go into a topic. Create one first.</p>
        <Link className="btn btn-primary" to={{ page: 'topics' }}>
          Open Topics
        </Link>
      </div>
    )

  const text = texts[source]
  const prompt = problemRequest(
    {
      topic: record.name,
      concepts: record.concepts,
      existing: served(record).file.problems.map((p) => p.wordings[0].title),
    },
    order,
  )
  // A change to what is checked makes the results stale.
  const reset = () => {
    setChecked(null)
    setError(null)
  }

  async function check() {
    if (!record) return
    reset()
    const read = readItems(text, 'problems')
    if ('error' in read) return setError(read.error)
    const drafts = readDrafts(record, read.items, () => crypto.randomUUID())
    setChecking(true)
    try {
      const results: Checked[] = []
      for (const draft of drafts) {
        const errors = draft.ok ? await checkProblem(runner, draft.problem) : []
        results.push({ draft, errors, ticked: draft.ok && errors.length === 0 })
      }
      setChecked(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const ticked = (checked ?? []).filter((c) => c.ticked)

  return (
    <section aria-labelledby="add-title" className="ws-report-page">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <h1 id="add-title" className="h3 mb-0 me-auto">
          Add problems
        </h1>
        <Link className="btn btn-outline-secondary" to={back} held={checking}>
          Back to coding problems
        </Link>
      </div>
      <div className="ws-panel p-4">
        <ProblemOrderForm
          topics={ordered}
          value={order}
          disabled={checking}
          onChange={(next) => {
            setOrder(next)
            if (next.topic !== order.topic) reset()
          }}
        />
      </div>
      <section className="ws-panel p-4" aria-labelledby="get-title">
        <h2 id="get-title" className="h5">
          Get them
        </h2>
        <Tabs
          activeKey={source}
          onSelect={(key) => {
            setSource(key === 'json' ? 'json' : 'chat')
            reset()
          }}
          className="mb-3"
        >
          <Tab eventKey="chat" title="Ask a chat bot" disabled={checking}>
            <p className="text-body-secondary">
              Copy the prompt into a chat, then paste its whole answer here.
            </p>
            <CodeBlock value={prompt} language="markdown" label="Prompt" />
          </Tab>
          <Tab eventKey="json" title="Write JSON" disabled={checking}>
            <p className="text-body-secondary mb-0">
              Write one problem, or a list of them, starting from the template.
            </p>
          </Tab>
        </Tabs>
        <CodeEditor
          key={source}
          initialValue={text}
          onChange={(value) => {
            setTexts((all) => ({ ...all, [source]: value }))
            reset()
          }}
          label={source === 'chat' ? 'Chat bot answer' : 'Problems JSON'}
          language="json"
          readOnly={checking}
          className="ws-answer"
        />
        <p className="text-body-secondary small mt-2 mb-2">
          Each problem is run in Python: its reference solution must pass every test and its starter
          code must fail one.
        </p>
        <Button onClick={() => void check()} disabled={checking || !text.trim()}>
          {checking ? 'Checking…' : 'Check'}
        </Button>
        {error && (
          <Alert variant="danger" className="mt-3 mb-0">
            {error}
          </Alert>
        )}
      </section>
      {checked && (
        <section className="ws-panel p-4" aria-labelledby="checked-title">
          <h2 id="checked-title" className="h5">
            Checked
          </h2>
          <ul className="ws-drafts">
            {checked.map((c, i) => (
              <DraftRow
                key={i}
                record={record}
                checked={c}
                number={i + 1}
                onTick={(on) =>
                  setChecked(
                    (all) => all && all.map((x, j) => (j === i ? { ...x, ticked: on } : x)),
                  )
                }
              />
            ))}
          </ul>
          <Button
            disabled={ticked.length === 0}
            onClick={() =>
              onAdd(
                record.id,
                ticked.map((c) => c.draft.item),
              )
            }
          >
            Add {ticked.length === 1 ? '1 problem' : `${ticked.length} problems`}
          </Button>
        </section>
      )}
    </section>
  )
}

interface RowProps {
  record: TopicRecord
  checked: Checked
  number: number
  onTick: (on: boolean) => void
}

function DraftRow({ record, checked: { draft, errors, ticked }, number, onTick }: RowProps) {
  const title = draft.title ?? `Problem ${number}`
  const problems = draft.ok ? errors : draft.errors
  const passes = problems.length === 0
  return (
    <li className="ws-draft" aria-label={title}>
      <Form.Check
        id={`draft-${number}`}
        label={title}
        checked={ticked}
        disabled={!passes}
        onChange={(e) => onTick(e.target.checked)}
      />
      {passes ? (
        <p className="ws-draft-ok">Passes the check.</p>
      ) : (
        <ul className="ws-draft-errors">
          {problems.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {draft.ok && (
        <details>
          <summary>Preview</summary>
          <Statement
            topic={{ id: record.id, name: record.name, concepts: draft.concepts }}
            problem={draft.problem}
            wording={draft.problem.wordings[0]}
            preview
          />
        </details>
      )}
    </li>
  )
}
