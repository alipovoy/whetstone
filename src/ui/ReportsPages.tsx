import { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import type { Topic } from '@/content/schema'
import { formatClock, type Attempt } from '@/core/attempt'
import { HISTORY_STATUSES, historyEntries, type HistoryEntry } from '@/core/history'
import { applicableFilter, filterEntries, type ProblemFilter } from '@/core/problems'
import type { Quiz } from '@/core/quiz'
import { Filters } from './Filters'
import { Link } from './Link'
import { GradeDetails } from './ProblemPage'
import { statusOptions, StatusPill, TestMarks } from './progress'
import type { Route } from './route'

const STATUSES = statusOptions(HISTORY_STATUSES)

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const hintsText = (n: number) => (n === 0 ? 'No hints' : n === 1 ? '1 hint' : `${n} hints`)
const attemptsText = (n: number) => (n === 1 ? '1 graded attempt' : `${n} graded attempts`)

interface CodingProps {
  topics: Topic[]
  attempts: Attempt[]
  filter: ProblemFilter
  onFilter: (filter: ProblemFilter) => void
}

export function CodingReport({ topics, attempts, filter: asked, onFilter }: CodingProps) {
  const entries = useMemo(() => historyEntries(topics, attempts), [topics, attempts])
  // The address may carry a status no graded attempt has, such as In progress.
  const status = HISTORY_STATUSES.find((s) => s === asked.status)
  const filter = applicableFilter({ ...asked, status }, entries)
  const shown = filterEntries(entries, filter)
  const filtered = Object.values(filter).some(Boolean)

  return (
    <section aria-labelledby="report-title" className="ws-report-page">
      <h1 id="report-title" className="h3 mb-0">
        Coding problems
      </h1>
      {entries.length === 0 ? (
        <div className="ws-panel ws-empty">
          <h2 className="h5 mb-0">No graded attempts yet</h2>
          <p className="text-body-secondary">Every solution you grade is kept here.</p>
          <Link className="btn btn-primary" to={{ page: 'problems' }}>
            Solve a problem
          </Link>
        </div>
      ) : (
        <>
          <Filters
            entries={entries}
            statuses={STATUSES}
            filter={filter}
            onFilter={(f) => onFilter(applicableFilter(f, entries))}
          >
            <p className="ws-count" aria-live="polite">
              {filtered
                ? `${shown.length} of ${attemptsText(entries.length)}`
                : attemptsText(entries.length)}
            </p>
            <Button
              variant="link"
              className="ms-auto"
              disabled={!filtered}
              onClick={() => onFilter({})}
            >
              Clear filters
            </Button>
          </Filters>
          <section className="ws-panel" aria-label="Graded attempts">
            {shown.length === 0 ? (
              <div className="ws-empty">
                <h2 className="h5 mb-0">No graded attempts match these filters</h2>
                <p className="text-body-secondary">Widen the search or clear the filters.</p>
                <Button variant="outline-secondary" onClick={() => onFilter({})}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <ul className="ws-problems">
                {shown.map((e) => (
                  <HistoryRow key={e.attempt.id} entry={e} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { attempt, grade, title, concept, topic, difficulty, status } = entry
  const at = when(grade.at)
  return (
    <li className="ws-problem ws-history" aria-label={`${title}, ${at}`}>
      <div className="ws-problem-name">
        <Link to={{ page: 'attempt', id: attempt.id }}>{title}</Link>
        <span>
          {concept}, {topic.name}
        </span>
      </div>
      <span className="ws-difficulty" data-level={difficulty}>
        {difficulty}
      </span>
      <TestMarks grade={grade} />
      <span className="ws-last-score">
        <span className="visually-hidden">Score </span>
        {grade.score}
      </span>
      <StatusPill status={status} />
      <span className="ws-history-facts">
        <span>{at}</span>
        <span>
          {hintsText(attempt.hints_used)}, {formatClock(attempt.elapsed_ms)}
        </span>
      </span>
    </li>
  )
}

interface AttemptProps {
  attempt: Attempt
  // The problem to open, while it is still served.
  problem?: Route
  back: Route
}

export function AttemptReport({ attempt, problem, back }: AttemptProps) {
  const grade = attempt.grade!
  const { asked } = grade
  return (
    <section aria-labelledby="attempt-title" className="ws-report-page">
      <div className="ws-panel ws-report-head">
        <div>
          <h1 id="attempt-title" className="h3">
            {asked.wording.title}
          </h1>
          <p className="text-body-secondary mb-0">
            <span className="ws-difficulty me-2" data-level={asked.difficulty}>
              {asked.difficulty}
            </span>
            {asked.concept_name}, {asked.topic_name}, graded {when(grade.at)}
          </p>
        </div>
        <p className="ws-report-score">
          <span className="text-body-secondary">Score </span>
          <strong>{grade.score}</strong>
        </p>
        <dl className="ws-report-facts">
          <div>
            <dt>Tests</dt>
            <dd>
              <TestMarks grade={grade} />
            </dd>
          </div>
          <div>
            <dt>Hints used</dt>
            <dd>{attempt.hints_used}</dd>
          </div>
          <div>
            <dt>Time used</dt>
            <dd>
              {formatClock(attempt.elapsed_ms)} of {formatClock(attempt.limit_ms)}
            </dd>
          </div>
        </dl>
        <div className="d-flex flex-wrap gap-2">
          {problem && (
            <Link className="btn btn-primary" to={problem}>
              Open the problem
            </Link>
          )}
          <Link className="btn btn-outline-secondary" to={back}>
            Back to graded attempts
          </Link>
        </div>
      </div>
      <section className="ws-panel ws-attempt-part" aria-label="Code">
        <h2 className="h5">Code</h2>
        <pre className="ws-attempt-code">{attempt.code}</pre>
      </section>
      <section className="ws-panel ws-attempt-part" aria-label="Test results">
        <h2 className="h5">Test results</h2>
        <GradeDetails grade={grade} />
      </section>
    </section>
  )
}

export function QuizReport({ quizzes }: { quizzes: Quiz[] }) {
  const past = quizzes.filter((q) => q.result).toSorted((a, b) => b.started_at - a.started_at)
  return (
    <section aria-labelledby="report-title" className="ws-report-page">
      <h1 id="report-title" className="h3 mb-0">
        Quizzes
      </h1>
      {past.length === 0 ? (
        <div className="ws-panel ws-empty">
          <h2 className="h5 mb-0">No quizzes taken yet</h2>
          <p className="text-body-secondary">Every quiz you submit is kept here.</p>
          <Link className="btn btn-primary" to={{ page: 'quizzes' }}>
            Build a quiz
          </Link>
        </div>
      ) : (
        <section className="ws-panel" aria-label="Past quizzes">
          <ul className="ws-problems">
            {past.map((quiz) => {
              const at = when(quiz.started_at)
              const topics = [...new Set(quiz.questions.map((q) => q.topic_name))].join(', ')
              return (
                <li key={quiz.id} className="ws-problem ws-past-quiz" aria-label={at}>
                  <div className="ws-problem-name">
                    <Link to={{ page: 'quiz', id: quiz.id }} aria-label={`Open quiz of ${at}`}>
                      {at}
                    </Link>
                    <span>
                      {topics}, {quiz.questions.length} questions
                    </span>
                  </div>
                  <span className="ws-last-score">
                    <span className="visually-hidden">Score </span>
                    {quiz.result?.score}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </section>
  )
}
