import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Badge, Col, Container, ListGroup, Navbar, Row } from 'react-bootstrap'
import { lastGraded, latestAttempt, resumeProblem, type Attempt } from '@/core/attempt'
import type { TopicFile } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import type { RunnerStatus } from '@/runner/types'
import type { AttemptStore } from '@/storage/attempts'
import { ProblemPage } from './ProblemPage'

export type AppRunner = Pick<PyodideRunner, 'run' | 'test' | 'warmUp' | 'status' | 'subscribe'>

export interface AppStorage {
  store: Pick<AttemptStore, 'put'> | null
  attempts: Attempt[]
  skipped: number
  error?: string
}

const STATUS: Record<RunnerStatus['state'], { bg: string; label: string }> = {
  idle: { bg: 'secondary', label: 'Python not loaded' },
  loading: { bg: 'warning', label: 'Preparing Python' },
  ready: { bg: 'success', label: 'Python is ready' },
  failed: { bg: 'danger', label: 'Python stopped' },
}

interface Props {
  topic: TopicFile
  runner: AppRunner
  storage: AppStorage
}

export function App({ topic, runner, storage }: Props) {
  const problems = topic.problems
  const [attempts, setAttempts] = useState(storage.attempts)
  const [current, setCurrent] = useState(
    () =>
      resumeProblem(
        storage.attempts,
        topic.topic.id,
        problems.map((p) => p.id),
      ) ?? problems[0].id,
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(storage.error)
  const index = problems.findIndex((p) => p.id === current)
  const problem = problems[index]

  useEffect(() => runner.warmUp(), [runner])

  const { store } = storage
  const save = useCallback(
    (attempt: Attempt) => {
      setAttempts((list) => [...list.filter((a) => a.id !== attempt.id), attempt])
      store
        ?.put(attempt)
        .catch((error: unknown) =>
          setSaveError(error instanceof Error ? error.message : String(error)),
        )
    },
    [store],
  )

  return (
    <>
      <Navbar className="border-bottom mb-3">
        <Container>
          <Navbar.Brand>Whetstone</Navbar.Brand>
          <Navbar.Text className="me-auto">{topic.topic.name}</Navbar.Text>
          <RuntimeStatus runner={runner} />
        </Container>
      </Navbar>
      <Container as="main" className="pb-4">
        {saveError && <Alert variant="warning">Your work is not being saved: {saveError}</Alert>}
        {storage.skipped > 0 && (
          <Alert variant="info" dismissible>
            {storage.skipped} saved attempts could not be read by this version of Whetstone and were
            not loaded.
          </Alert>
        )}
        <Row className="g-4">
          <Col md={3} as="nav" aria-label="Problems">
            <ListGroup>
              {problems.map((p) => (
                <ListGroup.Item
                  key={p.id}
                  action
                  active={p.id === current}
                  disabled={busy}
                  onClick={() => setCurrent(p.id)}
                >
                  <div>{p.wordings[0].title}</div>
                  <small className="d-flex gap-2">
                    <span>{p.difficulty}</span>
                    <ProblemState attempts={attempts} topic={topic.topic.id} problem={p.id} />
                  </small>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>
          <Col md={9}>
            <ProblemPage
              key={problem.id}
              topic={topic.topic}
              problem={problem}
              attempts={attempts}
              runner={runner}
              onSave={save}
              onBusy={setBusy}
              onNext={() => setCurrent(problems[(index + 1) % problems.length].id)}
            />
          </Col>
        </Row>
      </Container>
    </>
  )
}

interface ProblemStateProps {
  attempts: Attempt[]
  topic: string
  problem: string
}

function ProblemState({ attempts, topic, problem }: ProblemStateProps) {
  const graded = lastGraded(attempts, topic, problem)?.grade
  if (graded) return <span className="ms-auto">Last score {graded.score}</span>
  if (latestAttempt(attempts, topic, problem)) return <span className="ms-auto">In progress</span>
  return null
}

function RuntimeStatus({ runner }: { runner: AppRunner }) {
  const status = useSyncExternalStore(runner.subscribe, runner.status)
  const { bg, label } = STATUS[status.state]
  const detail = status.detail && status.state !== 'ready' ? `${label}: ${status.detail}` : label
  return (
    <Badge bg={bg} text={bg === 'warning' ? 'dark' : undefined} role="status" title={detail}>
      {label}
    </Badge>
  )
}
