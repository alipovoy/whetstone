import { useState } from 'react'
import { Alert, Badge, Button, Form, ListGroup, Stack } from 'react-bootstrap'
import type { TopicFile } from '@/content/schema'
import { candidates, type QuestionType, type Quiz, type QuizSetup } from '@/core/quiz'

const SIZES = [5, 10, 20]
const MINUTES = [10, 20, 30]
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
  const offered = topics.filter((t) => t.questions.length > 0)
  const [chosen, setChosen] = useState(() => offered.map((t) => t.topic.id))
  const [types, setTypes] = useState<QuestionType[]>(TYPES.map((t) => t.type))
  const [size, setSize] = useState(10)
  const [minutes, setMinutes] = useState(0)
  const picked = offered.filter((t) => chosen.includes(t.topic.id))
  const available = candidates(picked, types).length
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((i) => i !== item) : [...list, item]

  if (offered.length === 0)
    return <p>No questions to quiz on. Add questions to a topic, or enable one, under Settings.</p>

  return (
    <Form
      aria-label="New quiz"
      onSubmit={(event) => {
        event.preventDefault()
        onStart({ topics: picked, types, size, minutes: minutes || undefined })
      }}
    >
      <h2 className="h5">New quiz</h2>
      <Form.Group className="mb-3">
        <Form.Label as="div">Topics</Form.Label>
        {offered.map(({ topic, questions }) => (
          <Form.Check
            key={topic.id}
            id={`quiz-topic-${topic.id}`}
            label={`${topic.name} (${questions.length})`}
            checked={chosen.includes(topic.id)}
            onChange={() => setChosen((list) => toggle(list, topic.id))}
          />
        ))}
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label as="div">Types</Form.Label>
        {TYPES.map(({ type, label }) => (
          <Form.Check
            inline
            key={type}
            id={`quiz-type-${type}`}
            label={label}
            checked={types.includes(type)}
            onChange={() => setTypes((list) => toggle(list, type))}
          />
        ))}
      </Form.Group>
      <Stack direction="horizontal" gap={3} className="mb-3 flex-wrap">
        <Form.Group controlId="quiz-size">
          <Form.Label>Questions</Form.Label>
          <Form.Select value={size} onChange={(event) => setSize(Number(event.target.value))}>
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group controlId="quiz-timer">
          <Form.Label>Timer</Form.Label>
          <Form.Select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
            <option value={0}>Off</option>
            {MINUTES.map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Stack>
      {available < size && (
        <p className="text-body-secondary">
          {available === 0
            ? 'No questions match.'
            : `Only ${available} questions match; the quiz will have ${available}.`}
        </p>
      )}
      <Button type="submit" disabled={available === 0}>
        Start quiz
      </Button>
    </Form>
  )
}
