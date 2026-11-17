import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Badge, Button, Container, ListGroup, Navbar, Stack } from 'react-bootstrap'
import { lastGraded, latestAttempt, startAttempt, type Attempt } from '@/core/attempt'
import type { Problem, TopicFile } from '@/content/schema'
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
  const [attempts, setAttempts] = useState(storage.attempts)
  const [session, setSession] = useState<{ problem: Problem; attempt: Attempt } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(storage.error)

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

  const start = (problem: Problem) =>
    setSession({
      problem,
      attempt: startAttempt(
        crypto.randomUUID(),
        topic.topic.id,
        problem,
        problem.starter_code,
        Date.now(),
      ),
    })

  return (
    <>
      <Navbar className="border-bottom mb-3">
        <Container>
          <Navbar.Brand
            href="#"
            aria-disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              if (!busy) setSession(null)
            }}
          >
            Whetstone
          </Navbar.Brand>
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
        {session ? (
          <ProblemPage
            key={session.attempt.id}
            topic={topic.topic}
            problem={session.problem}
            initial={session.attempt}
            attempts={attempts}
            runner={runner}
            onSave={save}
            onBusy={setBusy}
          />
        ) : (
          <ProblemList
            topic={topic}
            attempts={attempts}
            onStart={start}
            onResume={(problem, attempt) => setSession({ problem, attempt })}
          />
        )}
      </Container>
    </>
  )
}

interface ProblemListProps {
  topic: TopicFile
  attempts: Attempt[]
  onStart: (problem: Problem) => void
  onResume: (problem: Problem, attempt: Attempt) => void
}

function ProblemList({ topic, attempts, onStart, onResume }: ProblemListProps) {
  return (
    <section aria-label="Problems">
      <h1 className="h3">Problems</h1>
      <ListGroup as="ul">
        {topic.problems.map((problem) => {
          const title = problem.wordings[0].title
          const latest = latestAttempt(attempts, topic.topic.id, problem.id)
          const unfinished = latest && !latest.grade ? latest : undefined
          const graded = lastGraded(attempts, topic.topic.id, problem.id)?.grade
          return (
            <ListGroup.Item as="li" key={problem.id} aria-label={title}>
              <Stack direction="horizontal" gap={2} className="flex-wrap">
                <span className="fw-semibold">{title}</span>
                <Badge bg="secondary">{problem.difficulty}</Badge>
                {graded && <span className="text-body-secondary">Last score {graded.score}</span>}
                {unfinished && <Badge bg="info">In progress</Badge>}
                <Stack direction="horizontal" gap={2} className="ms-auto">
                  {unfinished && (
                    <Button
                      size="sm"
                      variant="primary"
                      aria-label={`Resume ${title}`}
                      onClick={() => onResume(problem, unfinished)}
                    >
                      Resume
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={unfinished ? 'outline-primary' : 'primary'}
                    aria-label={`Start ${title}`}
                    onClick={() => onStart(problem)}
                  >
                    Start
                  </Button>
                </Stack>
              </Stack>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </section>
  )
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
