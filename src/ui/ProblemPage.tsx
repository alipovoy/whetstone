import { useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Badge, Button, ListGroup } from 'react-bootstrap'
import {
  gradeAttempt,
  lastGraded,
  openAttempt,
  remainingMs,
  startAttempt,
  type Attempt,
  type Grade,
} from '@/core/attempt'
import { problemStatus } from '@/core/problems'
import { failureText, hintCap, MAX_HINTS } from '@/core/scoring'
import type { Problem, Topic } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import { RUN_LIMIT_MS, type RunnerStatus, type RunResult, type TestResult } from '@/runner/types'
import { CodeEditor } from './CodeEditor'
import { Countdown } from './Countdown'
import { Link } from './Link'
import { Markdown } from './Markdown'
import { StatusPill, TestMarks } from './progress'
import type { Route } from './route'
import { SplitView } from './SplitView'

export type Runner = Pick<PyodideRunner, 'run' | 'test' | 'status' | 'subscribe'>

type Outcome =
  | { kind: 'run'; result: RunResult }
  | { kind: 'tests'; result: TestResult }
  | { kind: 'failed'; error: string }

interface Props {
  topic: Topic
  problem: Problem
  // Without an attempt, a new one starts.
  initial?: Attempt
  attempts: Attempt[]
  runner: Runner
  onSave: (attempt: Attempt) => void
  onBusy: (busy: boolean) => void
  // The list to return to, with its filter.
  back: Route
}

// Hidden-tab time is not counted; a longer gap between ticks means the page was asleep.
const TICK_MS = 1000
const MAX_TICK_MS = 2 * TICK_MS

export function ProblemPage({
  topic,
  problem,
  initial,
  attempts,
  runner,
  onSave,
  onBusy,
  back,
}: Props) {
  const [attempt, setAttempt] = useState(
    () =>
      initial ??
      startAttempt(crypto.randomUUID(), topic.id, problem, problem.starter_code, Date.now()),
  )
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const wording = problem.wordings[0]
  const last = lastGraded(attempts, topic.id, problem.id)
  const open = !attempt.grade
  const hintsShown = open ? attempt.hints_used : 0

  // Id and time are taken outside the updater, which React may run more than once.
  const change = (update: (a: Attempt, now: number) => Attempt) => {
    const now = Date.now()
    const nextId = crypto.randomUUID()
    setAttempt((a) => ({ ...update(openAttempt(a, problem, nextId, now), now), updated_at: now }))
  }

  useEffect(() => onSave(attempt), [attempt, onSave])
  useEffect(() => onBusy(busy), [busy, onBusy])

  useEffect(() => {
    if (!open) return
    let before = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      const delta = Math.min(now - before, MAX_TICK_MS)
      before = now
      if (document.visibilityState !== 'visible') return
      setAttempt((a) => (a.grade ? a : { ...a, elapsed_ms: a.elapsed_ms + delta, updated_at: now }))
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [open])

  async function act(job: () => Promise<void>) {
    setBusy(true)
    setOutcome(null)
    try {
      await job()
    } finally {
      setBusy(false)
    }
  }

  const run = () =>
    act(async () =>
      setOutcome({ kind: 'run', result: await runner.run(attempt.code, RUN_LIMIT_MS) }),
    )
  const runTests = () =>
    act(async () =>
      setOutcome({
        kind: 'tests',
        result: await runner.test(attempt.code, problem.tests, problem.visible_tests, RUN_LIMIT_MS),
      }),
    )
  const grade = () =>
    act(async () => {
      const result = await runner.test(attempt.code, problem.tests, [], RUN_LIMIT_MS)
      // Python failing to start is not the solution's fault, so the attempt stays open.
      if (result.error && !result.timedOut) {
        setOutcome({ kind: 'failed', error: result.error })
        return
      }
      const error =
        result.error ??
        result.loadError ??
        (result.testsError && failureText(result.testsError, true))
      change((a, now) =>
        gradeAttempt(a, topic, problem, { tests: result.tests, error, loaded: !error }, now),
      )
    })

  const concept = topic.concepts.find((c) => c.id === problem.concept)?.name ?? problem.concept
  const status = problemStatus(attempt, attempt.grade && attempt)

  const statement = (
    <div className="ws-statement">
      <h1 className="h3">{wording.title}</h1>
      <p className="ws-statement-meta">
        <span className="ws-difficulty" data-level={problem.difficulty}>
          {problem.difficulty}
        </span>
        {concept}, {topic.name}
      </p>
      <Markdown source={wording.statement} />
      {wording.examples.map((example, i) => (
        <div key={i}>
          <h2 className="h6">Example {i + 1}</h2>
          <pre className="ws-example">{`Input: ${example.input}\nOutput: ${example.output}`}</pre>
          {example.explanation && <p className="small">{example.explanation}</p>}
        </div>
      ))}
      {wording.constraints.length > 0 && (
        <>
          <h2 className="h6">Constraints</h2>
          <ul className="small">
            {wording.constraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      <Hints
        hints={problem.hints.slice(0, hintsShown)}
        onMore={
          hintsShown < MAX_HINTS
            ? () => change((a) => ({ ...a, hints_used: a.hints_used + 1 }))
            : undefined
        }
        nextCap={hintCap(hintsShown + 1)}
        disabled={busy}
      />
      {last && (
        <details className="ws-reference">
          <summary>Reference solution</summary>
          <pre>{problem.reference_solution}</pre>
        </details>
      )}
    </div>
  )

  const editor = (
    <div className="ws-code">
      <div className="ws-code-bar">
        <StatusPill status={status} />
        {open && <span className="ws-cap">Max score {hintCap(hintsShown)}</span>}
        {open && <Countdown ms={remainingMs(attempt)} />}
        <span className="ms-auto">
          <RuntimeStatus runner={runner} />
        </span>
      </div>
      <CodeEditor
        className="ws-code-editor"
        initialValue={attempt.code}
        onChange={(code) => change((a) => ({ ...a, code }))}
        label="Solution code"
        readOnly={busy}
      />
      <div className="ws-code-actions">
        <Button variant="outline-secondary" onClick={run} disabled={busy}>
          Run
        </Button>
        <Button variant="outline-primary" onClick={runTests} disabled={busy}>
          Run tests
        </Button>
        <Button variant="primary" onClick={grade} disabled={busy}>
          Grade
        </Button>
        {busy && (
          <span role="status" className="text-body-secondary">
            Running…
          </span>
        )}
        {!open && (
          <Link className="btn btn-outline-secondary ms-auto" to={back} held={busy}>
            Back to problems
          </Link>
        )}
      </div>
      {(outcome || last?.grade) && (
        <div className="ws-results">
          {outcome && <OutcomeView outcome={outcome} visible={problem.visible_tests} />}
          {last?.grade && <GradeView grade={last.grade} />}
        </div>
      )}
    </div>
  )

  return (
    <SplitView
      left={{ label: 'Problem', content: statement }}
      right={{ label: 'Code', content: editor }}
    />
  )
}

interface HintsProps {
  hints: string[]
  onMore?: () => void
  nextCap: number
  disabled: boolean
}

function Hints({ hints, onMore, nextCap, disabled }: HintsProps) {
  return (
    <section aria-label="Hints">
      {hints.map((hint, i) => (
        <p key={i} className="ws-hint">
          <strong>Hint {i + 1}.</strong> {hint}
        </p>
      ))}
      {onMore && (
        <Button variant="outline-secondary" size="sm" onClick={onMore} disabled={disabled}>
          Show hint {hints.length + 1} (max score {nextCap})
        </Button>
      )}
    </section>
  )
}

function OutcomeView({ outcome, visible }: { outcome: Outcome; visible: string[] }) {
  if (outcome.kind === 'failed') {
    return (
      <Alert variant="danger">
        <pre className="mb-0">{outcome.error}</pre>
      </Alert>
    )
  }
  if (outcome.kind === 'run') {
    const { stdout, error } = outcome.result
    return (
      <section aria-label="Output">
        {stdout && <pre className="bg-body-tertiary p-2 rounded">{stdout}</pre>}
        {error && (
          <Alert variant="danger">
            <pre className="mb-0">{error}</pre>
          </Alert>
        )}
        {!stdout && !error && <p className="text-body-secondary">No output.</p>}
      </section>
    )
  }

  const { result } = outcome
  const problemText =
    result.error ?? result.loadError ?? (result.testsError && failureText(result.testsError, true))
  return (
    <section aria-label="Test results">
      {problemText && (
        <Alert variant="danger">
          <pre className="mb-0">{problemText}</pre>
        </Alert>
      )}
      {!problemText && <TestList tests={result.tests} visible={visible} />}
    </section>
  )
}

function GradeView({ grade }: { grade: Grade }) {
  return (
    <section aria-label="Grade">
      <div className="ws-grade-head">
        <h2 className="h4">Score: {grade.score} / 100</h2>
        <TestMarks grade={grade} />
      </div>
      {grade.hint_cap < grade.code_score && (
        <p className="text-body-secondary">
          Tests earned {grade.code_score}; hints capped the score at {grade.hint_cap}.
        </p>
      )}
      {grade.error && (
        <Alert variant="danger">
          <pre className="mb-0">{grade.error}</pre>
        </Alert>
      )}
      {!grade.error && <TestList tests={grade.tests} visible={grade.asked.visible_tests} />}
    </section>
  )
}

function TestList({ tests, visible }: { tests: TestResult['tests']; visible: string[] }) {
  const passed = tests.filter((t) => t.passed).length
  return (
    <>
      <p>
        {passed} of {tests.length} tests passed
      </p>
      <ListGroup>
        {tests.map((test) => {
          const hidden = !visible.includes(test.name)
          return (
            <ListGroup.Item key={test.name} variant={test.passed ? 'success' : 'danger'}>
              <div>
                {test.passed ? '✓' : '✗'} {hidden ? 'Hidden test' : test.name}
                {!hidden && test.doc && <span className="text-body-secondary"> — {test.doc}</span>}
              </div>
              {test.message && (
                <pre className="mb-0 small">{failureText(test.message, hidden)}</pre>
              )}
              {!hidden && test.stdout && <pre className="mb-0 small">{test.stdout}</pre>}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </>
  )
}

const STATUS: Record<RunnerStatus['state'], { bg: string; label: string }> = {
  idle: { bg: 'secondary', label: 'Python not loaded' },
  loading: { bg: 'warning', label: 'Preparing Python' },
  ready: { bg: 'success', label: 'Python is ready' },
  failed: { bg: 'danger', label: 'Python stopped' },
}

function RuntimeStatus({ runner }: { runner: Runner }) {
  const status = useSyncExternalStore(runner.subscribe, runner.status)
  const { bg, label } = STATUS[status.state]
  const detail = status.detail && status.state !== 'ready' ? `${label}: ${status.detail}` : label
  return (
    <Badge bg={bg} text={bg === 'warning' ? 'dark' : undefined} role="status" title={detail}>
      {label}
    </Badge>
  )
}
