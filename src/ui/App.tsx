import { useEffect, useState, useSyncExternalStore } from 'react'
import { Badge, Container, Navbar } from 'react-bootstrap'
import type { TopicFile } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import type { RunnerStatus } from '@/runner/types'
import { ProblemPage } from './ProblemPage'

export type AppRunner = Pick<PyodideRunner, 'run' | 'test' | 'warmUp' | 'status' | 'subscribe'>

const STATUS: Record<RunnerStatus['state'], { bg: string; label: string }> = {
  idle: { bg: 'secondary', label: 'Python not loaded' },
  loading: { bg: 'warning', label: 'Preparing Python' },
  ready: { bg: 'success', label: 'Python is ready' },
  failed: { bg: 'danger', label: 'Python stopped' },
}

export function App({ topic, runner }: { topic: TopicFile; runner: AppRunner }) {
  const [index, setIndex] = useState(0)
  const problem = topic.problems[index]

  useEffect(() => runner.warmUp(), [runner])

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
        <ProblemPage
          key={problem.id}
          problem={problem}
          runner={runner}
          onNext={() => setIndex((index + 1) % topic.problems.length)}
        />
      </Container>
    </>
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
