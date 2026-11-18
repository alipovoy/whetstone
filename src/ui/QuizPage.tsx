import { useEffect, useId, useRef, useState } from 'react'
import { Badge, Button, Card, ListGroup, Modal, Stack } from 'react-bootstrap'
import { choose, submitQuiz, timeLeft, toggleFlag, type Quiz, type Shown } from '@/core/quiz'
import { Markdown } from './Markdown'
import { Countdown } from './Countdown'
import { Icon } from './icons'

// The clock turns to a warning in the last minute.
const LOW_MS = 60_000

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
  const [confirming, setConfirming] = useState(false)
  const titleId = useId()
  // Inside the page, so the dialog takes the section's colours.
  const page = useRef<HTMLDivElement>(null)
  const now = useNow(quiz.deadline !== undefined)
  const left = timeLeft(quiz, now)

  const shown = quiz.questions[index]
  const picks = quiz.picks[index]
  const flagged = quiz.flagged[index]
  const unanswered = quiz.picks.filter((p) => p.length === 0).length
  const flags = quiz.flagged.filter(Boolean).length
  const submit = () => onChange((q) => submitQuiz(q, Date.now()))

  return (
    <div className="ws-quiz" ref={page}>
      <section className="ws-panel ws-question" aria-label={`Question ${index + 1} of ${total}`}>
        <div className="ws-question-head">
          <h1 className="h5 mb-0">
            Question {index + 1} of {total}
          </h1>
          <span className="text-body-secondary">{shown.topic_name}</span>
          {shown.difficulty && (
            <span className="ws-difficulty" data-level={shown.difficulty}>
              {shown.difficulty}
            </span>
          )}
          {flagged && (
            <span className="ws-flagged">
              <Icon name="flag" />
              Flagged
            </span>
          )}
        </div>
        <div className="ws-question-text">
          <Markdown source={shown.text} />
        </div>
        <fieldset className="ws-options">
          <legend className="text-body-secondary">
            {shown.type === 'single' ? 'Choose one.' : 'Choose all that apply.'}
          </legend>
          {shown.options.map((option, o) => (
            <label key={o} className="ws-option">
              <input
                type={shown.type === 'single' ? 'radio' : 'checkbox'}
                className="form-check-input"
                name={`question-${index}`}
                checked={picks.includes(o)}
                onChange={() => onChange((q) => choose(q, index, o, Date.now()))}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
        <div className="ws-question-actions">
          <Button
            variant="outline-secondary"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline-secondary"
            disabled={index === total - 1}
            onClick={() => setIndex(index + 1)}
          >
            Next
          </Button>
          <Button
            variant="outline-secondary"
            className="ms-auto"
            aria-pressed={flagged}
            onClick={() => onChange((q) => toggleFlag(q, index, Date.now()))}
          >
            <Icon name="flag" />
            Flag for review
          </Button>
        </div>
      </section>
      <aside className="ws-panel ws-quiz-status" aria-label="Quiz status">
        <div className="ws-quiz-clock">
          {left === undefined ? (
            <span className="text-body-secondary">No time limit</span>
          ) : (
            <>
              <span className="text-body-secondary">Time left</span>
              <Countdown ms={left} low={left < LOW_MS} />
            </>
          )}
        </div>
        <nav className="ws-numbers" aria-label="Questions">
          {quiz.questions.map((_, i) => {
            const answered = quiz.picks[i].length > 0
            const state = [answered ? 'answered' : 'not answered', quiz.flagged[i] && 'flagged']
              .filter(Boolean)
              .join(', ')
            return (
              <button
                key={i}
                type="button"
                className="ws-number"
                data-answered={answered || undefined}
                data-flagged={quiz.flagged[i] || undefined}
                aria-current={i === index ? 'step' : undefined}
                aria-label={`Question ${i + 1}, ${state}`}
                title={`Question ${i + 1}, ${state}`}
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            )
          })}
        </nav>
        <ul className="ws-legend">
          <li>
            <i data-answered />
            Answered <strong>{total - unanswered}</strong>
          </li>
          <li>
            <i />
            Not answered <strong>{unanswered}</strong>
          </li>
          <li>
            <i data-flagged />
            Flagged <strong>{flags}</strong>
          </li>
        </ul>
        <Button className="w-100" onClick={() => setConfirming(true)}>
          Submit quiz
        </Button>
      </aside>
      <Modal
        show={confirming}
        onHide={() => setConfirming(false)}
        centered
        aria-labelledby={titleId}
        container={page}
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5" id={titleId}>
            Submit the quiz?
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {unanswered === 0 && flags === 0 ? (
            <p>Every question is answered and none is flagged.</p>
          ) : (
            <p>
              {[
                unanswered > 0 && `${count(unanswered)} not answered`,
                flags > 0 && `${count(flags)} flagged for review`,
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </p>
          )}
          <p className="mb-0 text-body-secondary">Answers cannot be changed after submitting.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setConfirming(false)}>
            Keep working
          </Button>
          <Button onClick={submit}>Submit quiz</Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

function count(n: number): string {
  return n === 1 ? '1 question' : `${n} questions`
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
