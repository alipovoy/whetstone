import { useEffect, useId, useRef, useState } from 'react'
import { formatClock } from '@/core/attempt'
import { Button, Form, Modal } from 'react-bootstrap'
import {
  choose,
  answerGrade,
  quizReport,
  submitQuiz,
  timeLeft,
  toggleFlag,
  type Quiz,
  type Shown,
} from '@/core/quiz'
import { Markdown } from './Markdown'
import { Countdown } from './Countdown'
import { formatWhen, plural } from './format'
import { Icon } from './icons'
import { Link } from './Link'
import { ConceptTags } from './progress'

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
  const question = useRef<HTMLElement>(null)
  // On narrow screens the panel is below the question, which a jump then brings into view.
  const jump = (i: number) => {
    setIndex(i)
    const box = question.current?.getBoundingClientRect()
    if (box && box.top < 0) question.current?.scrollIntoView({ block: 'start' })
  }

  const shown = quiz.questions[index]
  const picks = quiz.picks[index]
  const flagged = quiz.flagged[index]
  const unanswered = quiz.picks.filter((p) => p.length === 0).length
  const flags = quiz.flagged.filter(Boolean).length
  const submit = () => onChange((q) => submitQuiz(q, Date.now()))

  return (
    <div className="ws-quiz" ref={page}>
      <section
        ref={question}
        className="ws-panel ws-question"
        aria-label={`Question ${index + 1} of ${total}`}
      >
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
          <QuizClock quiz={quiz} compact />
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
          <QuizClock quiz={quiz} />
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
                onClick={() => jump(i)}
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
                unanswered > 0 && `${plural(unanswered, 'question')} not answered`,
                flags > 0 && `${plural(flags, 'question')} flagged for review`,
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

// Its own component, so only the clock re-renders every second. The compact copy shows on narrow
// screens, where the panel is below the question; screen readers have the panel's.
function QuizClock({ quiz, compact = false }: { quiz: Quiz; compact?: boolean }) {
  const now = useNow(quiz.deadline !== undefined)
  const left = timeLeft(quiz, now)
  if (left === undefined)
    return compact ? null : <span className="text-body-secondary">No time limit</span>
  if (compact)
    return (
      <span
        className="ws-clock ws-question-clock"
        data-low={left < LOW_MS || undefined}
        aria-hidden="true"
      >
        {left > 0 ? formatClock(left) : 'Time is up'}
      </span>
    )
  return (
    <>
      <span className="text-body-secondary">Time left</span>
      <Countdown ms={left} low={left < LOW_MS} />
    </>
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
  const report = quizReport(quiz)!
  const [onlyMissed, setOnlyMissed] = useState(false)
  // Submitting from the panel below the question leaves the page scrolled down; the result
  // starts at its heading, which screen readers then announce.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const switchId = useId()
  const topics = [...new Set(quiz.questions.map((q) => q.topic_name))].join(', ')
  const shown = quiz.questions.flatMap((q, i) =>
    onlyMissed && result.scores[i] === 100 ? [] : [{ q, i }],
  )

  return (
    <section className="ws-report" aria-label="Quiz result">
      <div className="ws-panel ws-report-head">
        <div>
          <h1 className="h3" ref={heading} tabIndex={-1}>
            Quiz result
          </h1>
          <p className="text-body-secondary mb-0">
            {topics}, {plural(quiz.questions.length, 'question')}, {formatWhen(quiz.started_at)}
          </p>
        </div>
        <p className="ws-report-score">
          <span className="text-body-secondary">Score </span>
          <strong>{result.score}</strong>
        </p>
        <dl className="ws-report-facts">
          <div>
            <dt>Answers</dt>
            <dd>
              {report.correct} correct, {report.partly} partly correct, {report.wrong} wrong or not
              answered
            </dd>
          </div>
          <div>
            <dt>Time used</dt>
            <dd>
              {report.time
                ? `${formatClock(report.time.used_ms)} of ${formatClock(report.time.limit_ms)}`
                : 'No time limit'}
            </dd>
          </div>
        </dl>
        <Link className="btn btn-primary" to={{ page: 'quizzes' }}>
          Build another quiz
        </Link>
      </div>
      <section className="ws-panel ws-concepts" aria-label="Score by concept">
        <h2 className="h5">Score by concept</h2>
        <ul>
          {report.concepts.map((c) => (
            <li key={`${c.topic}/${c.concept}`}>
              <span className="ws-concept-name">
                {c.concept_name}
                <small>
                  {c.topic_name}, {plural(c.questions, 'question')}
                </small>
              </span>
              <span className="ws-meter" data-band={band(c.score)} aria-hidden="true">
                <i style={{ width: `${c.score}%` }} />
              </span>
              <strong className="ws-concept-score">{c.score}</strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="ws-review" aria-label="Review">
        <div className="ws-review-head">
          <h2 className="h5 mb-0">Review</h2>
          <Form.Check
            type="switch"
            role="switch"
            id={switchId}
            label="Not fully correct only"
            checked={onlyMissed}
            onChange={() => setOnlyMissed((v) => !v)}
          />
        </div>
        {shown.length === 0 && (
          <p className="text-body-secondary">Every answer is fully correct.</p>
        )}
        {shown.map(({ q, i }) => (
          <Answer key={i} index={i} shown={q} picks={quiz.picks[i]} score={result.scores[i]} />
        ))}
      </section>
    </section>
  )
}

function band(score: number): 'low' | 'mid' | 'high' {
  return score < 50 ? 'low' : score < 80 ? 'mid' : 'high'
}

interface AnswerProps {
  index: number
  shown: Shown
  picks: number[]
  score: number
}

function Answer({ index, shown, picks, score }: AnswerProps) {
  return (
    <section className="ws-panel ws-answer" aria-label={`Question ${index + 1}`}>
      <div className="ws-answer-head">
        <span className="fw-bold">Question {index + 1}</span>
        <div className="ws-answer-about">
          <span className="text-body-secondary">{shown.topic_name}</span>
          <ConceptTags names={shown.concepts.map((c) => c.name)} />
        </div>
        <span className="ws-answer-score" data-grade={answerGrade(score)}>
          Score {score}
        </span>
      </div>
      <Markdown source={shown.text} />
      <ul className="ws-answer-options">
        {shown.options.map((option, o) => {
          const correct = shown.answers.includes(o)
          const picked = picks.includes(o)
          return (
            <li key={o} data-correct={correct || undefined} data-picked={picked || undefined}>
              <span>{option}</span>
              {picked && <span className="ws-tag">Your answer</span>}
              {correct && <span className="ws-tag ws-tag-correct">Correct</span>}
            </li>
          )
        })}
      </ul>
      {picks.length === 0 && <p className="text-body-secondary">Not answered.</p>}
      <div className="ws-explanation">
        <Markdown source={shown.explanation} />
      </div>
    </section>
  )
}
