import { useState } from 'react'
import { Alert, Badge, Button, ListGroup, Stack } from 'react-bootstrap'
import { codingScore, failureText } from '@/core/scoring'
import type { Problem } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import { RUN_LIMIT_MS, type RunResult, type TestResult } from '@/runner/types'
import { CodeEditor } from './CodeEditor'
import { Markdown } from './Markdown'

export type Runner = Pick<PyodideRunner, 'run' | 'test'>

type Outcome =
  | { kind: 'run'; result: RunResult }
  | { kind: 'tests'; result: TestResult }
  | { kind: 'grade'; result: TestResult }

interface Props {
  problem: Problem
  runner: Runner
  onNext: () => void
}

export function ProblemPage({ problem, runner, onNext }: Props) {
  const [code, setCode] = useState(problem.starter_code)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const wording = problem.wordings[0]

  async function act(job: () => Promise<Outcome>) {
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(await job())
    } finally {
      setBusy(false)
    }
  }

  const run = () => act(async () => ({ kind: 'run', result: await runner.run(code, RUN_LIMIT_MS) }))
  const runTests = () =>
    act(async () => ({
      kind: 'tests',
      result: await runner.test(code, problem.tests, problem.visible_tests, RUN_LIMIT_MS),
    }))
  const grade = () =>
    act(async () => ({
      kind: 'grade',
      result: await runner.test(code, problem.tests, [], RUN_LIMIT_MS),
    }))

  return (
    <Stack gap={3}>
      <div>
        <h1 className="h3">
          {wording.title} <Badge bg="secondary">{problem.difficulty}</Badge>
        </h1>
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
      <CodeEditor initialValue={problem.starter_code} onChange={setCode} label="Solution code" />
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
        <Button variant="link" className="ms-auto" onClick={onNext} disabled={busy}>
          Next problem
        </Button>
      </Stack>
      {busy && <p role="status">Running…</p>}
      {outcome && <OutcomeView outcome={outcome} visible={problem.visible_tests} />}
    </Stack>
  )
}

function OutcomeView({ outcome, visible }: { outcome: Outcome; visible: string[] }) {
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
  const testsError = result.testsError && failureText(result.testsError, true)
  const problemText = result.error ?? result.loadError ?? testsError
  const grading = outcome.kind === 'grade'
  const passed = result.tests.filter((t) => t.passed).length
  const loaded = !result.error && !result.loadError && !result.testsError

  return (
    <section aria-label={grading ? 'Grade' : 'Test results'}>
      {grading && (!result.error || result.timedOut) && (
        <h2 className="h4">
          Score: {codingScore({ passed, total: result.tests.length, loaded })} / 100
        </h2>
      )}
      {problemText && (
        <Alert variant="danger">
          <pre className="mb-0">{problemText}</pre>
        </Alert>
      )}
      {loaded && (
        <>
          <p>
            {passed} of {result.tests.length} tests passed
          </p>
          <ListGroup>
            {result.tests.map((test) => {
              const hidden = !visible.includes(test.name)
              return (
                <ListGroup.Item key={test.name} variant={test.passed ? 'success' : 'danger'}>
                  <div>
                    {test.passed ? '✓' : '✗'} {hidden ? 'Hidden test' : test.name}
                    {!hidden && test.doc && (
                      <span className="text-body-secondary"> — {test.doc}</span>
                    )}
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
      )}
    </section>
  )
}
