import { useId, useState, type ReactNode } from 'react'
import { Alert, Badge, Button, Form, ListGroup, Stack } from 'react-bootstrap'
import { DIFFICULTIES, type TopicFile } from '@/content/schema'
import {
  candidates,
  drawQuestions,
  QUESTION_MINUTES,
  quizAreas,
  timeLimit,
  type QuestionType,
  type Quiz,
  type QuizFilter,
  type QuizSetup,
} from '@/core/quiz'
import { Link } from './Link'

const DEFAULT_SIZE = 10
const TYPES: { type: QuestionType; label: string }[] = [
  { type: 'single', label: 'Single choice' },
  { type: 'multiple', label: 'Multiple choice' },
]

interface Props {
  topics: TopicFile[]
  quizzes: Quiz[]
  onStart: (setup: QuizSetup) => void
  onOpen: (id: string) => void
  onDiscard: (id: string) => void
}

export function QuizzesPage({ topics, quizzes, onStart, onOpen, onDiscard }: Props) {
  const running = quizzes.find((q) => !q.result)
  const past = quizzes.filter((q) => q.result).toSorted((a, b) => b.started_at - a.started_at)
  return (
    <section aria-label="Quizzes">
      <h1 className="h3">Quizzes</h1>
      {running && (
        <Alert variant="info">
          <Stack direction="horizontal" gap={2} className="flex-wrap">
            <span>
              Quiz in progress: {running.picks.filter((p) => p.length).length} of{' '}
              {running.questions.length} answered.
            </span>
            <Button size="sm" className="ms-auto" onClick={() => onOpen(running.id)}>
              Resume
            </Button>
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => {
                if (confirm('Discard the quiz in progress?')) onDiscard(running.id)
              }}
            >
              Discard
            </Button>
          </Stack>
        </Alert>
      )}
      <NewQuiz
        topics={topics}
        onStart={(setup) => {
          if (!running) return onStart(setup)
          if (!confirm('Discard the quiz in progress and start a new one?')) return
          onDiscard(running.id)
          onStart(setup)
        }}
      />
      <section aria-label="Past quizzes" className="mt-4">
        <h2 className="h5">Past quizzes</h2>
        {past.length === 0 && <p className="text-body-secondary">None yet.</p>}
        <ListGroup as="ul">
          {past.map((quiz) => {
            const when = new Date(quiz.started_at).toLocaleString()
            const names = [...new Set(quiz.questions.map((q) => q.topic_name))].join(', ')
            return (
              <ListGroup.Item as="li" key={quiz.id} aria-label={when}>
                <Stack direction="horizontal" gap={2} className="flex-wrap">
                  <span className="fw-semibold">{when}</span>
                  <span className="text-body-secondary">
                    {names}, {quiz.questions.length} questions
                  </span>
                  <Badge bg="secondary">Score {quiz.result?.score}</Badge>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    className="ms-auto"
                    aria-label={`Open quiz of ${when}`}
                    onClick={() => onOpen(quiz.id)}
                  >
                    Open
                  </Button>
                </Stack>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      </section>
    </section>
  )
}

function NewQuiz({ topics, onStart }: Pick<Props, 'topics' | 'onStart'>) {
  const id = useId()
  const offered = topics.filter((t) => t.questions.length > 0)
  const [filter, setFilter] = useState<QuizFilter>(() => ({
    topics: offered.map((t) => t.topic.id),
    offAreas: [],
    types: TYPES.map((t) => t.type),
    difficulties: [...DIFFICULTIES],
  }))
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [timed, setTimed] = useState(true)
  const [seed] = useState(() => Math.random())

  const shown = {
    ...filter,
    topics: filter.topics.filter((t) => offered.some((o) => o.topic.id === t)),
  }
  const matching = candidates(offered, shown)
  const count = Math.max(1, Math.min(size, matching.length))
  const questions = drawQuestions(matching, count, seed)
  const limit = timeLimit(questions.map((c) => c.question))
  const change = (update: (f: QuizFilter) => Partial<QuizFilter>) =>
    setFilter((f) => ({ ...f, ...update(f) }))
  // While the count is typed it may be empty or out of range; it settles on blur.
  const [typed, setTyped] = useState<string | null>(null)
  const typeCount = (text: string) => {
    setTyped(text)
    const n = Math.trunc(Number(text))
    if (text.trim() !== '' && n >= 1) setSize(Math.min(n, matching.length))
  }

  if (offered.length === 0)
    return (
      <div className="ws-panel ws-empty">
        <h2 className="h5 mb-0">No questions to quiz on</h2>
        <p className="text-body-secondary">Add questions to a topic, or enable one.</p>
        <Link className="btn btn-primary" to={{ page: 'topics' }}>
          Open Settings, Topics
        </Link>
      </div>
    )

  return (
    <Form
      noValidate
      className="ws-panel ws-builder"
      aria-label="New quiz"
      onSubmit={(event) => {
        event.preventDefault()
        onStart({ questions, timed })
      }}
    >
      <h2 className="h4">New quiz</h2>
      <Choices label="Topics">
        <div className="ws-tiles">
          {offered.map(({ topic, questions: inTopic }) => (
            <button
              key={topic.id}
              type="button"
              className="ws-tile"
              aria-pressed={filter.topics.includes(topic.id)}
              onClick={() => change((f) => ({ topics: toggled(f.topics, topic.id) }))}
            >
              <span className="ws-tile-name">{topic.name}</span>
              <span className="ws-tile-count">{plural(inTopic.length, 'question')}</span>
            </button>
          ))}
        </div>
      </Choices>
      <Choices label="Areas">
        {quizAreas(offered, shown.topics).map((area) => (
          <Chip
            key={area}
            on={!filter.offAreas.includes(area)}
            onClick={() => change((f) => ({ offAreas: toggled(f.offAreas, area) }))}
          >
            {area}
          </Chip>
        ))}
        {shown.topics.length === 0 && (
          <span className="text-body-secondary">Choose a topic to see its areas.</span>
        )}
      </Choices>
      <div className="ws-builder-row">
        <Choices label="Question types">
          {TYPES.map(({ type, label }) => (
            <Chip
              key={type}
              on={filter.types.includes(type)}
              onClick={() => change((f) => ({ types: toggled(f.types, type) }))}
            >
              {label}
            </Chip>
          ))}
        </Choices>
        <Choices label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              on={filter.difficulties.includes(d)}
              onClick={() => change((f) => ({ difficulties: toggled(f.difficulties, d) }))}
            >
              {d}
            </Chip>
          ))}
        </Choices>
      </div>
      <div className="ws-builder-row">
        <Form.Group controlId={`${id}-count`}>
          <Form.Label>Number of questions</Form.Label>
          <div className="ws-stepper">
            <Button
              variant="outline-secondary"
              aria-label="Fewer questions"
              disabled={matching.length === 0 || count <= 1}
              onClick={() => {
                setTyped(null)
                setSize(count - 1)
              }}
            >
              −
            </Button>
            <Form.Control
              type="number"
              inputMode="numeric"
              min={1}
              max={matching.length}
              step={1}
              value={matching.length === 0 ? 0 : (typed ?? count)}
              disabled={matching.length === 0}
              onChange={(event) => typeCount(event.target.value)}
              onBlur={() => setTyped(null)}
            />
            <Button
              variant="outline-secondary"
              aria-label="More questions"
              disabled={count >= matching.length}
              onClick={() => {
                setTyped(null)
                setSize(count + 1)
              }}
            >
              +
            </Button>
          </div>
          <Form.Text>{plural(matching.length, 'question')} match</Form.Text>
        </Form.Group>
        <div className="ws-limit">
          <Form.Check
            type="switch"
            role="switch"
            id={`${id}-timed`}
            label="Time limit"
            checked={timed}
            onChange={() => setTimed((t) => !t)}
          />
          {matching.length > 0 && (
            <output className="d-block" aria-label="Time limit breakdown">
              {timed ? (
                <>
                  <strong>{limit.minutes} min</strong>:{' '}
                  {DIFFICULTIES.filter((d) => limit.counts[d] > 0)
                    .map(
                      (d) =>
                        `${limit.counts[d]} ${d.toLowerCase()} × ${QUESTION_MINUTES[d]}\u00a0min`,
                    )
                    .join(' + ')}
                </>
              ) : (
                <span className="text-body-secondary">
                  No time limit. Take as long as you need.
                </span>
              )}
            </output>
          )}
        </div>
      </div>
      <div className="ws-builder-foot">
        {matching.length === 0 && (
          <span className="text-body-secondary">
            No questions match. Choose more topics, areas, types or difficulties.
          </span>
        )}
        <Button type="submit" size="lg" className="ms-auto" disabled={matching.length === 0}>
          Start quiz
        </Button>
      </div>
    </Form>
  )
}

function Choices({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="ws-choices-group" role="group" aria-labelledby={id}>
      <span className="form-label d-block" id={id}>
        {label}
      </span>
      <div className="ws-chips">{children}</div>
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="ws-chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

function toggled<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item]
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
