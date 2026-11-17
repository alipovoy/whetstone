import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Form, ListGroup, Stack } from 'react-bootstrap'
import { bridgePrompt, MAX_ITEMS, readAnswer, type Answer } from '@/core/bridge'
import {
  addDrafts,
  approveDraft,
  BLANK_DRAFT,
  checkErrors,
  deleteProblem,
  draftText,
  draftTitle,
  editDraft,
  readDraft,
  rejectDraft,
  served,
  type CheckRun,
  type Draft,
  type TopicRecord,
} from '@/core/topics'
import type { Difficulty } from '@/content/schema'
import { RUN_LIMIT_MS, type TestResult } from '@/runner/types'
import type { Runner } from './ProblemPage'

interface Props {
  topic: TopicRecord
  runner: Pick<Runner, 'test'>
  onChange: (change: (topic: TopicRecord) => TopicRecord) => void
  onDelete: () => void
  onBusy: (busy: boolean) => void
}

export function TopicPage({ topic, runner, onChange, onDelete, onBusy }: Props) {
  const [checking, setChecking] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const { file, unreadable } = served(topic)

  useEffect(() => onBusy(checking !== null), [checking, onBusy])

  const newDraft = (text: string, source: Draft['source'], replaces?: string) =>
    onChange((t) => addDrafts(t, [{ id: crypto.randomUUID(), text, source, replaces }]))

  async function approve(draft: Draft) {
    const read = readDraft(topic, draft, crypto.randomUUID())
    if (!read.ok) {
      setErrors((e) => ({ ...e, [draft.id]: read.errors }))
      return
    }
    setChecking(draft.id)
    setErrors((e) => ({ ...e, [draft.id]: [] }))
    try {
      const { problem } = read
      const reference = await runner.test(
        problem.reference_solution,
        problem.tests,
        [],
        RUN_LIMIT_MS,
      )
      // Python failing to start says nothing about the problem.
      if (reference.error && !reference.timedOut) {
        setErrors((e) => ({ ...e, [draft.id]: [`Python could not run: ${reference.error}`] }))
        return
      }
      const starter = await runner.test(problem.starter_code, problem.tests, [], RUN_LIMIT_MS)
      const found = checkErrors(problem, checkRun(reference), checkRun(starter))
      if (found.length) setErrors((e) => ({ ...e, [draft.id]: found }))
      else onChange((t) => approveDraft(t, draft.id, read))
    } finally {
      setChecking(null)
    }
  }

  return (
    <Stack gap={4}>
      <Header topic={topic} onChange={onChange} onDelete={onDelete} disabled={checking !== null} />

      <section aria-label="Concepts">
        <h2 className="h5">Concepts</h2>
        {topic.concepts.length === 0 ? (
          <p className="text-body-secondary">None yet: approving a problem adds its concept.</p>
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
            const editing = topic.drafts.some((d) => d.replaces === problem.id)
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
                      disabled={editing}
                      onClick={() =>
                        newDraft(draftText(problem, topic.concepts), 'user', problem.id)
                      }
                    >
                      {editing ? 'Editing below' : 'Edit'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      aria-label={`Delete ${title}`}
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
        <Button variant="outline-primary" onClick={() => newDraft(BLANK_DRAFT, 'user')}>
          Add problem
        </Button>
      </section>

      <Bridge topic={topic} onDrafts={(texts) => texts.forEach((text) => newDraft(text, 'ai'))} />

      {topic.drafts.length > 0 && (
        <section aria-label="Drafts">
          <h2 className="h5">Drafts</h2>
          <p className="text-body-secondary">
            Approving a draft runs it in Python: the reference solution must pass every test and the
            starter code must fail one.
          </p>
          <Stack gap={3}>
            {topic.drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                replaces={file.problems.find((p) => p.id === draft.replaces)?.wordings[0].title}
                errors={errors[draft.id] ?? []}
                checking={checking === draft.id}
                disabled={checking !== null}
                onSave={(text) => onChange((t) => editDraft(t, draft.id, text))}
                onApprove={(text) => {
                  onChange((t) => editDraft(t, draft.id, text))
                  void approve({ ...draft, text })
                }}
                onReject={() => onChange((t) => rejectDraft(t, draft.id))}
              />
            ))}
          </Stack>
        </section>
      )}
    </Stack>
  )
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

const DIFFICULTIES: (Difficulty | 'mixed')[] = ['mixed', 'Easy', 'Medium', 'Hard']

function Bridge({ topic, onDrafts }: { topic: TopicRecord; onDrafts: (texts: string[]) => void }) {
  const [count, setCount] = useState(3)
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed')
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Answer | null>(null)
  const prompt = bridgePrompt({
    topic: topic.name,
    concepts: topic.concepts,
    titles: served(topic).file.problems.map((p) => p.wordings[0].title),
    count,
    difficulty,
  })

  return (
    <section aria-label="Fill from a chat">
      <h2 className="h5">Fill from a chat</h2>
      <p className="text-body-secondary">
        Copy the prompt into any chat, then paste its answer below. Valid problems become drafts.
      </p>
      <Stack direction="horizontal" gap={2} className="mb-2">
        <Form.Select
          aria-label="Number of problems"
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
          className="w-auto"
        >
          {Array.from({ length: MAX_ITEMS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'problem' : 'problems'}
            </option>
          ))}
        </Form.Select>
        <Form.Select
          aria-label="Difficulty"
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as Difficulty | 'mixed')}
          className="w-auto"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d === 'mixed' ? 'Mixed difficulty' : d}
            </option>
          ))}
        </Form.Select>
        <Button
          variant="outline-secondary"
          onClick={() => void navigator.clipboard.writeText(prompt)}
        >
          Copy prompt
        </Button>
      </Stack>
      <Form.Control
        as="textarea"
        aria-label="Prompt"
        readOnly
        rows={6}
        value={prompt}
        className="font-monospace small mb-2"
      />
      <Form.Control
        as="textarea"
        aria-label="Answer"
        placeholder="Paste the answer here"
        rows={6}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        className="font-monospace small mb-2"
      />
      <Button
        disabled={!answer.trim()}
        onClick={() => {
          const read = readAnswer(answer)
          setResult(read)
          if (read.drafts.length) {
            onDrafts(read.drafts)
            setAnswer('')
          }
        }}
      >
        Read answer
      </Button>
      {result && (
        <Alert
          variant={result.error || result.rejected.length ? 'warning' : 'success'}
          className="mt-2"
        >
          {result.error ?? `${result.drafts.length} drafts added.`}
          {result.rejected.map(({ item, errors }) => (
            <div key={item}>
              Problem {item} was skipped:
              <ul className="mb-0">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ))}
        </Alert>
      )}
    </section>
  )
}

interface DraftCardProps {
  draft: Draft
  replaces?: string
  errors: string[]
  checking: boolean
  disabled: boolean
  onSave: (text: string) => void
  onApprove: (text: string) => void
  onReject: () => void
}

function DraftCard(props: DraftCardProps) {
  const { draft, replaces, errors, checking, disabled, onSave, onApprove, onReject } = props
  const [text, setText] = useState(draft.text)
  const title = draftTitle({ ...draft, text })
  return (
    <Card as="article" aria-label={`Draft ${title}`}>
      <Card.Body>
        <Stack direction="horizontal" gap={2} className="mb-2 flex-wrap">
          <span className="fw-semibold">{title}</span>
          <Badge bg="secondary">{draft.source === 'ai' ? 'From a chat' : 'Own'}</Badge>
          {replaces && <span className="text-body-secondary">Edits “{replaces}”</span>}
        </Stack>
        <Form.Control
          as="textarea"
          aria-label="Draft JSON"
          rows={12}
          spellCheck={false}
          value={text}
          readOnly={disabled}
          onChange={(event) => setText(event.target.value)}
          className="font-monospace small mb-2"
        />
        {errors.length > 0 && (
          <Alert variant="danger">
            <ul className="mb-0">
              {errors.map((e) => (
                <li key={e} style={{ whiteSpace: 'pre-wrap' }}>
                  {e}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <Stack direction="horizontal" gap={2}>
          <Button onClick={() => onApprove(text)} disabled={disabled}>
            {checking ? 'Checking…' : 'Approve'}
          </Button>
          <Button
            variant="outline-secondary"
            onClick={() => onSave(text)}
            disabled={disabled || text === draft.text}
          >
            Save
          </Button>
          <Button variant="outline-danger" onClick={onReject} disabled={disabled}>
            Reject
          </Button>
        </Stack>
      </Card.Body>
    </Card>
  )
}
