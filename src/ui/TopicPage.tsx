import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Badge, Button, Form, ListGroup, Stack, Tab, Tabs } from 'react-bootstrap'
import {
  PROBLEM_TEMPLATE,
  problemRequest,
  QUESTION_TEMPLATE,
  questionRequest,
  readItems,
} from '@/core/bridge'
import {
  addProblems,
  addQuestions,
  checkErrors,
  deleteItem,
  itemText,
  served,
  type CheckRun,
  type ItemErrors,
  type ItemList,
  type TopicRecord,
} from '@/core/topics'
import { conceptNames, type Problem } from '@/content/schema'
import { RUN_LIMIT_MS, type TestResult } from '@/runner/types'
import { CodeBlock } from './CodeBlock'
import { CodeEditor } from './CodeEditor'
import type { Runner } from './ProblemPage'
import { capital } from './format'
import { ConceptTags } from './progress'
import { TopicConcepts } from './TopicConcepts'

interface Props {
  topic: TopicRecord
  runner: Pick<Runner, 'test'>
  onChange: (change: (topic: TopicRecord) => TopicRecord) => void
  onDelete: () => void
  onBusy: (busy: boolean) => void
}

// The editor adds new items to its list, or replaces the one being edited.
interface Editing {
  text: string
  replaces?: { id: string; title: string }
}

interface Row {
  id: string
  title: string
  badge: string
  concepts: string[]
  text: string
}

export function TopicPage({ topic, runner, onChange, onDelete, onBusy }: Props) {
  const [checking, setChecking] = useState(false)
  const { file, unreadable } = served(topic)

  useEffect(() => onBusy(checking), [checking, onBusy])

  const problems: Row[] = file.problems.map((p) => ({
    id: p.id,
    title: p.wordings[0].title,
    badge: p.difficulty,
    concepts: conceptNames(file.topic, p.concepts),
    text: itemText(p, topic.concepts),
  }))
  const questions: Row[] = file.questions.map((q) => ({
    id: q.id,
    title: q.summary,
    badge: `${q.difficulty}, ${q.type === 'single' ? 'single choice' : 'multiple choice'}`,
    concepts: conceptNames(file.topic, q.concepts),
    text: itemText(q, topic.concepts),
  }))
  const request = { topic: topic.name, concepts: topic.concepts }
  const shared = { topic, runner, checking, onChecking: setChecking, onChange }

  return (
    <Stack gap={4}>
      <Header topic={topic} onChange={onChange} onDelete={onDelete} disabled={checking} />

      <TopicConcepts topic={topic} file={file} disabled={checking} onChange={onChange} />

      {/* Mounted when first shown; an open editor survives switching tabs. */}
      <Tabs defaultActiveKey="problems" mountOnEnter>
        <Tab eventKey="problems" title="Problems" disabled={checking}>
          <Items {...shared} list="problems" rows={problems} unreadable={unreadable.problems}>
            <Snippet
              label="Chat bot request for problems"
              value={problemRequest({ ...request, existing: problems.map((r) => r.title) })}
              language="markdown"
            />
            <Snippet label="Problem template" value={PROBLEM_TEMPLATE} language="json" />
          </Items>
        </Tab>
        <Tab eventKey="questions" title="Questions" disabled={checking}>
          <Items {...shared} list="questions" rows={questions} unreadable={unreadable.questions}>
            <Snippet
              label="Chat bot request for questions"
              value={questionRequest({ ...request, existing: questions.map((r) => r.title) })}
              language="markdown"
            />
            <Snippet label="Question template" value={QUESTION_TEMPLATE} language="json" />
          </Items>
        </Tab>
      </Tabs>
    </Stack>
  )
}

const NOUN = { problems: 'problem', questions: 'question' } as const

interface ItemsProps {
  list: ItemList
  rows: Row[]
  unreadable: number
  topic: TopicRecord
  runner: Pick<Runner, 'test'>
  checking: boolean
  onChecking: (checking: boolean) => void
  onChange: Props['onChange']
  children: ReactNode
}

function Items({ list, rows, unreadable, children, onChange, ...editor }: ItemsProps) {
  const [editing, setEditing] = useState<Editing | null>(null)
  return (
    <section aria-label={`Topic ${list}`} className="pt-3">
      {unreadable > 0 && (
        <Alert variant="warning">
          {unreadable} {list} do not follow the current content rules and are not served.
        </Alert>
      )}
      <ListGroup as="ul" className="mb-2">
        {rows.map(({ id, title, badge, concepts, text }) => (
          <ListGroup.Item as="li" key={id} aria-label={title}>
            <Stack direction="horizontal" gap={2} className="flex-wrap">
              <span className="fw-semibold">{title}</span>
              <Badge bg="secondary">{badge}</Badge>
              <ConceptTags names={concepts} />
              <Stack direction="horizontal" gap={2} className="ms-auto">
                <Button
                  size="sm"
                  variant="outline-primary"
                  aria-label={`Edit ${title}`}
                  disabled={editing !== null}
                  onClick={() => setEditing({ text, replaces: { id, title } })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  aria-label={`Delete ${title}`}
                  disabled={editing !== null}
                  onClick={() => {
                    const kept = list === 'problems' ? ' Its past attempts are kept.' : ''
                    if (confirm(`Delete "${title}"?${kept}`))
                      onChange((t) => deleteItem(t, list, id))
                  }}
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          </ListGroup.Item>
        ))}
      </ListGroup>
      {editing ? (
        <ItemEditor
          {...editor}
          list={list}
          initial={editing}
          onDone={(next) => {
            onChange(() => next)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button variant="primary" onClick={() => setEditing({ text: '' })}>
          New {NOUN[list]}
        </Button>
      )}
      <div className="mt-4">{children}</div>
    </section>
  )
}

interface EditorProps {
  list: ItemList
  topic: TopicRecord
  initial: Editing
  runner: Pick<Runner, 'test'>
  checking: boolean
  onChecking: (checking: boolean) => void
  onDone: (topic: TopicRecord) => void
  onCancel: () => void
}

function ItemEditor({
  list,
  topic,
  initial,
  runner,
  checking,
  onChecking,
  onDone,
  onCancel,
}: EditorProps) {
  const [text, setText] = useState(initial.text)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<ItemErrors[]>([])
  const { replaces } = initial
  const noun = NOUN[list]

  async function submit() {
    setError(null)
    setFailed([])
    const read = readItems(text, list)
    if ('error' in read) return setError(read.error)
    const newId = () => crypto.randomUUID()
    if (list === 'questions') {
      const added = addQuestions(topic, read.items, newId, replaces?.id)
      return added.ok ? onDone(added.record) : setFailed(added.errors)
    }
    const added = addProblems(topic, read.items, newId, replaces?.id)
    if (!added.ok) return setFailed(added.errors)
    onChecking(true)
    try {
      const found: ItemErrors[] = []
      for (const [i, problem] of added.added.entries()) {
        const errors = await check(runner, problem)
        if (errors.length) found.push({ item: i + 1, title: problem.wordings[0].title, errors })
      }
      if (found.length) setFailed(found)
      else onDone(added.record)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      onChecking(false)
    }
  }

  return (
    <section aria-label={replaces ? `Edit ${replaces.title}` : `New ${noun}`}>
      <p className="text-body-secondary mb-2">
        {replaces
          ? `Edit the ${noun} as JSON.`
          : `Paste one ${noun}, a list of ${list}, or a chat bot answer.`}{' '}
        {list === 'problems'
          ? 'Each problem is run in Python first: its reference solution must pass every test and its starter code must fail one.'
          : 'Each question is checked first.'}{' '}
        Nothing is added unless every {noun} passes.
      </p>
      <div className="mb-2">
        <CodeEditor
          initialValue={initial.text}
          onChange={setText}
          label={`${capital(noun)} JSON`}
          language="json"
          readOnly={checking}
        />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {failed.length > 0 && (
        <Alert variant="danger">
          Nothing was {replaces ? 'saved' : 'added'}.
          {failed.map(({ item, title, errors }) => (
            <div key={item} className="mt-2">
              {capital(noun)} {item}
              {title && ` “${title}”`}:
              <ul className="mb-0">
                {errors.map((e) => (
                  <li key={e} style={{ whiteSpace: 'pre-wrap' }}>
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Alert>
      )}
      <Stack direction="horizontal" gap={2}>
        <Button onClick={() => void submit()} disabled={checking || !text.trim()}>
          {checking ? 'Checking…' : replaces ? 'Save' : 'Add'}
        </Button>
        <Button variant="outline-secondary" onClick={onCancel} disabled={checking}>
          Cancel
        </Button>
      </Stack>
    </section>
  )
}

async function check(runner: Pick<Runner, 'test'>, problem: Problem): Promise<string[]> {
  const reference = await runner.test(problem.reference_solution, problem.tests, [], RUN_LIMIT_MS)
  // Python failing to start says nothing about the problem.
  if (reference.error && !reference.timedOut)
    throw new Error(`Python could not run: ${reference.error}`)
  const starter = await runner.test(problem.starter_code, problem.tests, [], RUN_LIMIT_MS)
  return checkErrors(problem, checkRun(reference), checkRun(starter))
}

function checkRun(result: TestResult): CheckRun {
  return { tests: result.tests, error: result.error ?? result.loadError ?? result.testsError }
}

interface HeaderProps {
  topic: TopicRecord
  onChange: Props['onChange']
  onDelete: () => void
  disabled: boolean
}

function Header({ topic, onChange, onDelete, disabled }: HeaderProps) {
  const [name, setName] = useState(topic.name)
  return (
    <div>
      <h1 className="h3">{topic.name}</h1>
      <Stack direction="horizontal" gap={3} className="flex-wrap">
        <Form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onChange((t) => ({ ...t, name: name.trim() }))
          }}
        >
          <Stack direction="horizontal" gap={2}>
            <Form.Control
              aria-label="Topic name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline-secondary"
              disabled={!name.trim() || name.trim() === topic.name}
            >
              Rename
            </Button>
          </Stack>
        </Form>
        <Form.Check
          type="switch"
          role="switch"
          id={`enabled-${topic.id}`}
          label="Enabled"
          checked={topic.enabled}
          onChange={(event) => onChange((t) => ({ ...t, enabled: event.target.checked }))}
        />
        <Button
          variant="outline-danger"
          className="ms-auto"
          disabled={disabled}
          onClick={() => {
            if (confirm(`Delete the topic "${topic.name}"? Past attempts are kept.`)) onDelete()
          }}
        >
          Delete topic
        </Button>
      </Stack>
    </div>
  )
}

function Snippet(props: { label: string; value: string; language: 'json' | 'markdown' }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="mb-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{props.label}</summary>
      {/* Mounted when shown: the editor measures its lines when it is created. */}
      {open && (
        <div className="mt-2">
          <CodeBlock {...props} />
        </div>
      )}
    </details>
  )
}
