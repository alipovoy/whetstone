import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Form, ListGroup, Stack } from 'react-bootstrap'
import { chatRequest, PROBLEM_TEMPLATE, readItems } from '@/core/bridge'
import {
  addProblems,
  checkErrors,
  deleteProblem,
  problemText,
  served,
  type CheckRun,
  type ItemErrors,
  type TopicRecord,
} from '@/core/topics'
import type { Problem } from '@/content/schema'
import { RUN_LIMIT_MS, type TestResult } from '@/runner/types'
import { CodeBlock } from './CodeBlock'
import type { Runner } from './ProblemPage'

interface Props {
  topic: TopicRecord
  runner: Pick<Runner, 'test'>
  onChange: (change: (topic: TopicRecord) => TopicRecord) => void
  onDelete: () => void
  onBusy: (busy: boolean) => void
}

// The editor adds new problems, or replaces the one being edited.
type Editing = { text: string; replaces?: Problem }

export function TopicPage({ topic, runner, onChange, onDelete, onBusy }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [checking, setChecking] = useState(false)
  const { file, unreadable } = served(topic)

  useEffect(() => onBusy(checking), [checking, onBusy])

  return (
    <Stack gap={4}>
      <Header topic={topic} onChange={onChange} onDelete={onDelete} disabled={checking} />

      <section aria-label="Concepts">
        <h2 className="h5">Concepts</h2>
        {topic.concepts.length === 0 ? (
          <p className="text-body-secondary">None yet: adding a problem adds its concept.</p>
        ) : (
          <ul>
            {topic.concepts.map((c) => (
              <li key={c.id}>
                {c.name} <span className="text-body-secondary">({c.group})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Topic problems">
        <h2 className="h5">Problems</h2>
        {unreadable > 0 && (
          <Alert variant="warning">
            {unreadable} problems do not follow the current content rules and are not served.
          </Alert>
        )}
        <ListGroup as="ul" className="mb-2">
          {file.problems.map((problem) => {
            const title = problem.wordings[0].title
            return (
              <ListGroup.Item as="li" key={problem.id} aria-label={title}>
                <Stack direction="horizontal" gap={2} className="flex-wrap">
                  <span className="fw-semibold">{title}</span>
                  <Badge bg="secondary">{problem.difficulty}</Badge>
                  <span className="text-body-secondary">
                    {topic.concepts.find((c) => c.id === problem.concept)?.name}
                  </span>
                  <Stack direction="horizontal" gap={2} className="ms-auto">
                    <Button
                      size="sm"
                      variant="outline-primary"
                      aria-label={`Edit ${title}`}
                      disabled={editing !== null}
                      onClick={() =>
                        setEditing({
                          text: problemText(problem, topic.concepts),
                          replaces: problem,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      aria-label={`Delete ${title}`}
                      disabled={editing !== null}
                      onClick={() => {
                        if (confirm(`Delete "${title}"? Its past attempts are kept.`)) {
                          onChange((t) => deleteProblem(t, problem.id))
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
        {editing ? (
          <ProblemEditor
            topic={topic}
            initial={editing}
            runner={runner}
            checking={checking}
            onChecking={setChecking}
            onDone={(next) => {
              onChange(() => next)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button variant="primary" onClick={() => setEditing({ text: '' })}>
            New problem
          </Button>
        )}
      </section>

      <Snippets topic={topic} titles={file.problems.map((p) => p.wordings[0].title)} />
    </Stack>
  )
}

interface EditorProps {
  topic: TopicRecord
  initial: Editing
  runner: Pick<Runner, 'test'>
  checking: boolean
  onChecking: (checking: boolean) => void
  onDone: (topic: TopicRecord) => void
  onCancel: () => void
}

function ProblemEditor({
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
  const replaces = initial.replaces

  async function submit() {
    setError(null)
    setFailed([])
    const read = readItems(text)
    if ('error' in read) return setError(read.error)
    const added = addProblems(topic, read.items, () => crypto.randomUUID(), replaces?.id)
    if (!added.ok) return setFailed(added.errors)
    onChecking(true)
    try {
      const found: ItemErrors[] = []
      for (const [i, problem] of added.problems.entries()) {
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
    <section aria-label={replaces ? `Edit ${replaces.wordings[0].title}` : 'New problem'}>
      <p className="text-body-secondary mb-2">
        {replaces
          ? 'Edit the problem as JSON.'
          : 'Paste one problem, a list of problems, or a chat bot answer.'}{' '}
        Each problem is run in Python first: its reference solution must pass every test and its
        starter code must fail one. Nothing is added unless every problem passes.
      </p>
      <Form.Control
        as="textarea"
        aria-label="Problem JSON"
        rows={14}
        spellCheck={false}
        value={text}
        readOnly={checking}
        onChange={(event) => setText(event.target.value)}
        className="font-monospace small mb-2"
      />
      {error && <Alert variant="danger">{error}</Alert>}
      {failed.length > 0 && (
        <Alert variant="danger">
          Nothing was {replaces ? 'saved' : 'added'}.
          {failed.map(({ item, title, errors }) => (
            <div key={item} className="mt-2">
              Problem {item}
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

function Snippets({ topic, titles }: { topic: TopicRecord; titles: string[] }) {
  const request = chatRequest({ topic: topic.name, concepts: topic.concepts, titles })
  return (
    <section aria-label="Examples">
      <Snippet label="Chat bot request" value={request} language="markdown" />
      <Snippet label="Problem template" value={PROBLEM_TEMPLATE} language="json" />
    </section>
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
