import { useEffect, useState } from 'react'
import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap'
import type { Difficulty } from '@/content/schema'
import { readItems } from '@/core/bridge'
import { readDrafts, served, type Draft, type ItemList, type TopicRecord } from '@/core/topics'
import { CodeBlock } from './CodeBlock'
import { CodeEditor } from './CodeEditor'
import { capital, plural } from './format'
import { ItemOrderForm, type Order } from './ItemOrderForm'
import { KINDS, type Check, type Kind } from './kinds'
import { Link } from './Link'
import type { Route } from './route'

interface Props {
  list: ItemList
  topics: TopicRecord[]
  // Prefilled from where the page was opened.
  initial: { topic?: string; concepts?: string[]; difficulty?: Difficulty }
  runner: Check
  back: Route
  onBusy: (busy: boolean) => void
  // The topic with the items added, and how many.
  onAdd: (record: TopicRecord, count: number) => void
}

export function AddItemsPage({ list, ...props }: Props) {
  return list === 'problems' ? (
    <AddItems kind={KINDS.problems} {...props} />
  ) : (
    <AddItems kind={KINDS.questions} {...props} />
  )
}

type Source = 'chat' | 'json'

interface Checked<T> {
  draft: Draft<T>
  // Errors of the kind's own check, for an item that reads.
  errors: string[]
  ticked: boolean
}

function AddItems<T>({
  kind,
  topics,
  initial,
  runner,
  back,
  onBusy,
  onAdd,
}: Omit<Props, 'list'> & { kind: Kind<T> }) {
  const { noun } = kind
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
  const [texts, setTexts] = useState<Record<Source, string>>({ chat: '', json: kind.template })
  const [checked, setChecked] = useState<Checked<T>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => onBusy(checking), [checking, onBusy])

  const record = ordered.find((t) => t.id === order.topic)
  if (!record)
    return (
      <div className="ws-panel ws-empty">
        <h1 className="h4">Add {noun}s</h1>
        <p className="text-body-secondary">{capital(noun)}s go into a topic. Create one first.</p>
        <Link className="btn btn-primary" to={{ page: 'topics' }}>
          Open Topics
        </Link>
      </div>
    )

  const text = texts[source]
  const prompt = kind.request(
    { topic: record.name, concepts: record.concepts, existing: kind.existing(served(record)) },
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
    const read = readItems(text, kind.list)
    if ('error' in read) return setError(read.error)
    const drafts = readDrafts(record, read.items, () => crypto.randomUUID(), kind.add)
    setChecking(true)
    try {
      const results: Checked<T>[] = []
      for (const draft of drafts) {
        const errors = draft.ok && kind.check ? await kind.check(runner, draft.item) : []
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
  function add() {
    if (!record) return
    const added = kind.add(
      record,
      ticked.map((c) => c.draft.raw),
      () => crypto.randomUUID(),
    )
    if (added.ok) onAdd(added.record, added.added.length)
    else setError(`Could not add: ${added.errors.join('; ')}`)
  }

  return (
    <section aria-labelledby="add-title" className="ws-report-page">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <h1 id="add-title" className="h3 mb-0 me-auto">
          Add {noun}s
        </h1>
        <Link className="btn btn-outline-secondary" to={back} held={checking}>
          {kind.back}
        </Link>
      </div>
      <div className="ws-panel p-4">
        <ItemOrderForm
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
              Write one {noun}, or a list of them, starting from the template.
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
          label={source === 'chat' ? 'Chat bot answer' : `${capital(noun)}s JSON`}
          language="json"
          readOnly={checking}
          className="ws-answer"
        />
        <p className="text-body-secondary small mt-2 mb-2">{kind.rules}</p>
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
                kind={kind}
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
          <Button disabled={ticked.length === 0} onClick={add}>
            Add {plural(ticked.length, noun)}
          </Button>
        </section>
      )}
    </section>
  )
}

interface RowProps<T> {
  kind: Kind<T>
  record: TopicRecord
  checked: Checked<T>
  number: number
  onTick: (on: boolean) => void
}

function DraftRow<T>({
  kind,
  record,
  checked: { draft, errors, ticked },
  number,
  onTick,
}: RowProps<T>) {
  const title = draft.title ?? `${capital(kind.noun)} ${number}`
  const failures = draft.ok ? errors : draft.errors
  const passes = failures.length === 0
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
          {failures.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {draft.ok && (
        <details>
          <summary>Preview</summary>
          {kind.preview({ id: record.id, name: record.name, concepts: draft.concepts }, draft.item)}
        </details>
      )}
    </li>
  )
}
