import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert, Badge, Button, Form, ListGroup, Stack, Tab, Tabs } from 'react-bootstrap'
import { QUESTION_TEMPLATE, questionRequest, readItems } from '@/core/bridge'
import {
  addProblems,
  addQuestions,
  deleteItem,
  itemText,
  served,
  type ItemErrors,
  type ItemList,
  type TopicRecord,
} from '@/core/topics'
import { conceptNames } from '@/content/schema'
import { checkProblem } from './check'
import { CodeBlock } from './CodeBlock'
import { CodeEditor } from './CodeEditor'
import type { Runner } from './ProblemPage'
import { capital } from './format'
import { ConceptTags } from './progress'
import { Link } from './Link'
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
  const [editors, setEditors] = useState<ItemList[]>([])
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
  const onEditor = useCallback(
    (list: ItemList, open: boolean) =>
      setEditors((lists) => [...lists.filter((l) => l !== list), ...(open ? [list] : [])]),
    [],
  )
  const shared = { topic, runner, checking, onChecking: setChecking, onChange, onEditor }

  return (
    <Stack gap={4}>
      <Header topic={topic} onChange={onChange} onDelete={onDelete} disabled={checking} />

      <TopicConcepts
        topic={topic}
        file={file}
        disabled={checking}
        // An open item editor holds concept names; a change under it would bring them back.
        locked={editors.length > 0}
        onChange={onChange}
      />

      {/* Mounted when first shown; an open editor survives switching tabs. */}
      <Tabs defaultActiveKey="problems" mountOnEnter>
        <Tab eventKey="problems" title="Problems" disabled={checking}>
          <Items
            {...shared}
            list="problems"
            rows={problems}
            unreadable={unreadable.problems}
            adding={
              <Link className="btn btn-primary" to={{ page: 'add-problems', topic: topic.id }}>
                Add problems
              </Link>
            }
          />
        </Tab>
        <Tab eventKey="questions" title="Questions" disabled={checking}>
          <Items
            {...shared}
            list="questions"
            rows={questions}
            unreadable={unreadable.questions}
            adding={(open) => (
              <Button variant="primary" onClick={open}>
                New question
              </Button>
            )}
          >
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
  onEditor: (list: ItemList, open: boolean) => void
  // Problems are added on their own page; questions here.
  adding: ReactNode | ((open: () => void) => ReactNode)
  children?: ReactNode
}

function Items({
  list,
  rows,
  unreadable,
  adding,
  children,
  onChange,
  onEditor,
  ...editor
}: ItemsProps) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const open = editing !== null
  useEffect(() => onEditor(list, open), [list, open, onEditor])
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
                    const kept = list === 'problems' ? ' Its past attempts will be kept.' : ''
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
      ) : typeof adding === 'function' ? (
        adding(() => setEditing({ text: '' }))
      ) : (
        adding
      )}
      {children && <div className="mt-4">{children}</div>}
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
        const errors = await checkProblem(runner, problem)
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
            if (confirm(`Delete the topic "${topic.name}"? Its past attempts will be kept.`))
              onDelete()
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
