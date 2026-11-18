import { useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Badge, Button, ListGroup, Stack } from 'react-bootstrap'
import {
  formatClock,
  gradeAttempt,
  lastGraded,
  openAttempt,
  remainingMs,
  type Attempt,
  type Grade,
} from '@/core/attempt'
import { failureText, hintCap, MAX_HINTS } from '@/core/scoring'
import type { Problem, Topic } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import { RUN_LIMIT_MS, type RunnerStatus, type RunResult, type TestResult } from '@/runner/types'
import { CodeEditor } from './CodeEditor'
import { Markdown } from './Markdown'

export type Runner = Pick<PyodideRunner, 'run' | 'test' | 'status' | 'subscribe'>

type Outcome =
  | { kind: 'run'; result: RunResult }
  | { kind: 'tests'; result: TestResult }
  | { kind: 'failed'; error: string }

interface Props {
  topic: Topic
  problem: Problem
  initial: Attempt
  attempts: Attempt[]
  runner: Runner
  onSave: (attempt: Attempt) => void
  onBusy: (busy: boolean) => void
}

// Hidden-tab time is not counted; a longer gap between ticks means the page was asleep.
const TICK_MS = 1000
const MAX_TICK_MS = 2 * TICK_MS

export function ProblemPage({ topic, problem, initial, attempts, runner, onSave, onBusy }: Props) {
  const [attempt, setAttempt] = useState(initial)
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

  return (
    <Stack gap={3}>
      <div>
        <Stack direction="horizontal" gap={2} className="align-items-start">
          <h1 className="h3 me-auto">
            {wording.title} <Badge bg="secondary">{problem.difficulty}</Badge>
          </h1>
          {open && <Countdown ms={remainingMs(attempt)} />}
        </Stack>
        <Markdown source={wording.statement} />
        {wording.examples.map((example, i) => (
          <div key={i}>
            <h2 className="h6">Example {i + 1}</h2>
            <pre className="bg-body-tertiary p-2 rounded mb-1">
              {`Input: ${example.input}\nOutput: ${example.output}`}
            </pre>
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
      </div>
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
      <CodeEditor
        initialValue={attempt.code}
        onChange={(code) => change((a) => ({ ...a, code }))}
        label="Solution code"
        readOnly={busy}
      />
      <Stack direction="horizontal" gap={2}>
        <Button variant="outline-secondary" onClick={run} disabled={busy}>
          Run
        </Button>
        <Button variant="outline-primary" onClick={runTests} disabled={busy}>
          Run tests
        </Button>
        <Button variant="primary" onClick={grade} disabled={busy}>
          Grade
        </Button>
        <span className="ms-auto">
          <RuntimeStatus runner={runner} />
        </span>
      </Stack>
      {busy && <p role="status">Running…</p>}
      {outcome && <OutcomeView outcome={outcome} visible={problem.visible_tests} />}
      {last?.grade && <GradeView grade={last.grade} />}
      {last && (
        <details>
          <summary>Reference solution</summary>
          <pre className="bg-body-tertiary p-2 rounded mt-2">{problem.reference_solution}</pre>
        </details>
      )}
    </Stack>
  )
}

export function Countdown({ ms }: { ms: number }) {
  return ms > 0 ? (
    <Badge bg="light" text="dark" className="border fs-6" title="Time left">
      {formatClock(ms)}
    </Badge>
  ) : (
    <Badge bg="warning" text="dark" className="fs-6">
      Time is up
    </Badge>
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
        <Alert key={i} variant="info" className="py-2 mb-2">
          <strong>Hint {i + 1}.</strong> {hint}
        </Alert>
      ))}
      {onMore && (
        <Button variant="outline-info" size="sm" onClick={onMore} disabled={disabled}>
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
      <h2 className="h4">Score: {grade.score} / 100</h2>
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
