import { useEffect, useState } from 'react'
import { Badge, Button, Card, Form, ListGroup, Stack } from 'react-bootstrap'
import { choose, submitQuiz, timeLeft, toggleFlag, type Quiz, type Shown } from '@/core/quiz'
import { Markdown } from './Markdown'
import { Countdown } from './ProblemPage'

interface Props {
  quiz: Quiz
  onChange: (change: (quiz: Quiz) => Quiz) => void
}

export function QuizPage({ quiz, onChange }: Props) {
  return quiz.result ? <Results quiz={quiz} /> : <Taking quiz={quiz} onChange={onChange} />
}

function Taking({ quiz, onChange }: Props) {
  const total = quiz.questions.length
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      quiz.picks.findIndex((p) => !p.length),
    ),
  )
  const [reviewing, setReviewing] = useState(false)
  const now = useNow(quiz.deadline !== undefined)
  const left = timeLeft(quiz, now)

  const header = (
    <Stack direction="horizontal" gap={2} className="mb-3">
      <h1 className="h3 mb-0">Quiz</h1>
      {left !== undefined && (
        <span className="ms-auto">
          <Countdown ms={left} />
        </span>
      )}
    </Stack>
  )

  if (reviewing) {
    const unanswered = quiz.picks.flatMap((p, i) => (p.length ? [] : [i]))
    const flagged = quiz.flagged.flatMap((f, i) => (f ? [i] : []))
    const goTo = (i: number) => {
      setIndex(i)
      setReviewing(false)
    }
    return (
      <section aria-label="Review">
        {header}
        <h2 className="h5">Review</h2>
        {unanswered.length === 0 && flagged.length === 0 && (
          <p>Every question is answered and none is flagged.</p>
        )}
        <QuestionLinks label="Unanswered" indexes={unanswered} onGo={goTo} />
        <QuestionLinks label="Flagged" indexes={flagged} onGo={goTo} />
        <Stack direction="horizontal" gap={2} className="mt-3">
          <Button variant="outline-secondary" onClick={() => setReviewing(false)}>
            Back to questions
          </Button>
          <Button onClick={() => onChange((q) => submitQuiz(q, Date.now()))}>Submit</Button>
        </Stack>
      </section>
    )
  }

  const shown = quiz.questions[index]
  const picks = quiz.picks[index]
  const flagged = quiz.flagged[index]
  return (
    <section aria-label={`Question ${index + 1} of ${total}`}>
      {header}
      <Stack direction="horizontal" gap={2} className="mb-2">
        <span className="fw-semibold">
          Question {index + 1} of {total}
        </span>
        <span className="text-body-secondary">{shown.topic_name}</span>
        {flagged && (
          <Badge bg="warning" text="dark">
            Flagged
          </Badge>
        )}
      </Stack>
      <Markdown source={shown.text} />
      <Form.Group className="my-3">
        <Form.Label as="div" className="text-body-secondary">
          {shown.type === 'single' ? 'Choose one.' : 'Choose all that apply.'}
        </Form.Label>
        {shown.options.map((option, o) => (
          <Form.Check
            key={o}
            type={shown.type === 'single' ? 'radio' : 'checkbox'}
            id={`option-${index}-${o}`}
            name={`question-${index}`}
            label={option}
            checked={picks.includes(o)}
            onChange={() => onChange((q) => choose(q, index, o, Date.now()))}
          />
        ))}
      </Form.Group>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button
          variant="outline-secondary"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Previous
        </Button>
        {index < total - 1 && (
          <Button variant="outline-secondary" onClick={() => setIndex(index + 1)}>
            Next
          </Button>
        )}
        <Button
          variant="outline-warning"
          aria-pressed={flagged}
          onClick={() => onChange((q) => toggleFlag(q, index, Date.now()))}
        >
          {flagged ? 'Unflag' : 'Flag'}
        </Button>
        <Button className="ms-auto" onClick={() => setReviewing(true)}>
          Review and submit
        </Button>
      </Stack>
    </section>
  )
}

function QuestionLinks(props: { label: string; indexes: number[]; onGo: (i: number) => void }) {
  if (props.indexes.length === 0) return null
  return (
    <section aria-label={props.label} className="mb-2">
      <h3 className="h6">{props.label}</h3>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        {props.indexes.map((i) => (
          <Button key={i} size="sm" variant="outline-primary" onClick={() => props.onGo(i)}>
            Question {i + 1}
          </Button>
        ))}
      </Stack>
    </section>
  )
}

// The clock, re-read every second while a countdown is shown.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  return now
}

function Results({ quiz }: { quiz: Quiz }) {
  const result = quiz.result!
  return (
    <section aria-label="Quiz result">
      <h1 className="h3">Quiz result</h1>
      <p className="fs-5">
        Score <strong>{result.score}</strong>{' '}
        <span className="text-body-secondary fs-6">
          {new Date(quiz.started_at).toLocaleString()}, {quiz.questions.length} questions
        </span>
      </p>
      <Stack gap={3}>
        {quiz.questions.map((shown, i) => (
          <Answer key={i} index={i} shown={shown} picks={quiz.picks[i]} score={result.scores[i]} />
        ))}
      </Stack>
    </section>
  )
}

interface AnswerProps {
  index: number
  shown: Shown
  picks: number[]
  score: number
}

function Answer({ index, shown, picks, score }: AnswerProps) {
  return (
    <Card as="section" aria-label={`Question ${index + 1}`}>
      <Card.Header>
        <Stack direction="horizontal" gap={2} className="flex-wrap">
          <span className="fw-semibold">Question {index + 1}</span>
          <span className="text-body-secondary">
            {shown.topic_name}, {shown.concept_name}
          </span>
          <Badge
            bg={score === 100 ? 'success' : score > 0 ? 'warning' : 'danger'}
            className="ms-auto"
          >
            Score {score}
          </Badge>
        </Stack>
      </Card.Header>
      <Card.Body>
        <Markdown source={shown.text} />
        <ListGroup as="ul" className="mb-3">
          {shown.options.map((option, o) => {
            const correct = shown.answers.includes(o)
            const picked = picks.includes(o)
            return (
              <ListGroup.Item
                as="li"
                key={o}
                variant={correct ? 'success' : picked ? 'danger' : undefined}
              >
                <Stack direction="horizontal" gap={2}>
                  <span>{option}</span>
                  {picked && <Badge bg="secondary">Your answer</Badge>}
                  {correct && <Badge bg="success">Correct</Badge>}
                </Stack>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
        {picks.length === 0 && <p className="text-body-secondary">Not answered.</p>}
        <Markdown source={shown.explanation} />
      </Card.Body>
    </Card>
  )
}
