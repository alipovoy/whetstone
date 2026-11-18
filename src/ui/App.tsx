import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, Container, ListGroup, Nav, Navbar, Stack } from 'react-bootstrap'
import { lastGraded, latestAttempt, startAttempt, type Attempt } from '@/core/attempt'
import { startQuiz, submitQuiz, type Quiz, type QuizSetup } from '@/core/quiz'
import { newTopic, served, type TopicRecord } from '@/core/topics'
import type { Problem, Topic, TopicFile } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import type { Records } from '@/storage/database'
import { ProblemPage } from './ProblemPage'
import { QuizPage } from './QuizPage'
import { QuizzesPage } from './QuizzesPage'
import { TopicPage } from './TopicPage'
import { TopicsPage } from './TopicsPage'

export type AppRunner = Pick<PyodideRunner, 'run' | 'test' | 'warmUp' | 'status' | 'subscribe'>

export interface AppStorage {
  store: {
    attempts: Pick<Records<Attempt>, 'put'>
    topics: Pick<Records<TopicRecord>, 'put' | 'delete'>
    quizzes: Pick<Records<Quiz>, 'put' | 'delete'>
  } | null
  attempts: Attempt[]
  topics: TopicRecord[]
  quizzes: Quiz[]
  skipped: number
  error?: string
}

type View =
  | { page: 'problems' }
  | { page: 'settings' }
  | { page: 'topic'; id: string }
  | { page: 'quizzes' }
  | { page: 'quiz'; id: string }
  | { page: 'solve'; topic: Topic; problem: Problem; attempt: Attempt }

const EQUAL = { flex: '1 1 0' }

type Section = 'problems' | 'quizzes' | 'settings'

const SECTION: Record<View['page'], Section> = {
  problems: 'problems',
  solve: 'problems',
  quizzes: 'quizzes',
  quiz: 'quizzes',
  settings: 'settings',
  topic: 'settings',
}

interface Props {
  runner: AppRunner
  storage: AppStorage
}

export function App({ runner, storage }: Props) {
  const [attempts, setAttempts] = useState(storage.attempts)
  const [topics, setTopics] = useState(storage.topics)
  // The latest topics, so a change is computed once, outside a state updater, and then saved.
  const topicsNow = useRef(storage.topics)
  const [quizzes, setQuizzes] = useState(storage.quizzes)
  const quizzesNow = useRef(storage.quizzes)
  const [view, setView] = useState<View>({ page: 'problems' })
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(storage.error)

  useEffect(() => runner.warmUp(), [runner])

  const { store } = storage

  const save = useCallback(
    (attempt: Attempt) => {
      setAttempts((list) => [...list.filter((a) => a.id !== attempt.id), attempt])
      store?.attempts.put(attempt).catch((error: unknown) => setSaveError(message(error)))
    },
    [store],
  )

  const setTopicList = (list: TopicRecord[]) => {
    topicsNow.current = list
    setTopics(list)
  }
  const putTopic = (topic: TopicRecord) => {
    setTopicList([...topicsNow.current.filter((t) => t.id !== topic.id), topic])
    store?.topics.put(topic).catch((error: unknown) => setSaveError(message(error)))
  }
  const updateTopic = (id: string, change: (topic: TopicRecord) => TopicRecord) => {
    const current = topicsNow.current.find((t) => t.id === id)
    if (current) putTopic({ ...change(current), updated_at: Date.now() })
  }
  const createTopic = (name: string) => {
    const topic = newTopic(crypto.randomUUID(), name, Date.now())
    putTopic(topic)
    setView({ page: 'topic', id: topic.id })
  }
  const deleteTopic = (id: string) => {
    setTopicList(topicsNow.current.filter((t) => t.id !== id))
    store?.topics.delete(id).catch((error: unknown) => setSaveError(message(error)))
    setView({ page: 'settings' })
  }

  const setQuizList = (list: Quiz[]) => {
    quizzesNow.current = list
    setQuizzes(list)
  }
  const updateQuiz = useCallback(
    (id: string, change: (quiz: Quiz) => Quiz) => {
      const current = quizzesNow.current.find((q) => q.id === id)
      const next = current && change(current)
      if (!next || next === current) return
      quizzesNow.current = [...quizzesNow.current.filter((q) => q.id !== id), next]
      setQuizzes(quizzesNow.current)
      store?.quizzes.put(next).catch((error: unknown) => setSaveError(message(error)))
    },
    [store],
  )
  const discardQuiz = (id: string) => {
    setQuizList(quizzesNow.current.filter((q) => q.id !== id))
    store?.quizzes.delete(id).catch((error: unknown) => setSaveError(message(error)))
  }
  const beginQuiz = (setup: QuizSetup) => {
    const quiz = startQuiz(crypto.randomUUID(), setup, Date.now())
    setQuizList([...quizzesNow.current, quiz])
    store?.quizzes.put(quiz).catch((error: unknown) => setSaveError(message(error)))
    setView({ page: 'quiz', id: quiz.id })
  }

  // The countdown runs on the wall clock: a quiz is submitted at its deadline on any page.
  // Another tab may have started a second quiz, so the earliest deadline goes first.
  const timed = quizzes
    .filter((q) => !q.result && q.deadline !== undefined)
    .toSorted((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))[0]
  const deadline = timed?.deadline
  const timedId = timed?.id
  useEffect(() => {
    if (timedId === undefined || deadline === undefined) return
    const timer = setTimeout(
      () => updateQuiz(timedId, (q) => submitQuiz(q, Date.now())),
      Math.max(0, deadline - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [timedId, deadline, updateQuiz])

  const enabled = useMemo(
    () =>
      topics
        .filter((t) => t.enabled)
        .toSorted((a, b) => a.created_at - b.created_at)
        .map((t) => served(t).file),
    [topics],
  )

  const start = (topic: Topic, problem: Problem) =>
    setView({
      page: 'solve',
      topic,
      problem,
      attempt: startAttempt(
        crypto.randomUUID(),
        topic.id,
        problem,
        problem.starter_code,
        Date.now(),
      ),
    })

  const go = (next: View) => (event: React.MouseEvent) => {
    event.preventDefault()
    if (!busy) setView(next)
  }
  const section = SECTION[view.page]
  const menuLink = (label: string, page: Section) => (
    <a
      className={page === section ? 'nav-link active' : 'nav-link'}
      href="#"
      aria-current={page === section ? 'page' : undefined}
      aria-disabled={busy}
      onClick={go({ page })}
    >
      {label}
    </a>
  )
  const topic = view.page === 'topic' ? topics.find((t) => t.id === view.id) : undefined
  const quiz = view.page === 'quiz' ? quizzes.find((q) => q.id === view.id) : undefined

  return (
    <>
      <Navbar className="border-bottom mb-3">
        <Container>
          {/* Equal sides keep Code and Quiz in the centre; me-0 lets the name fit half a phone screen.
              Not flex-fill: its !important basis is auto, so the sides would follow their text. */}
          <Navbar.Brand as="span" className="me-0" style={EQUAL}>
            Whetstone
          </Navbar.Brand>
          <Nav>
            {menuLink('Code', 'problems')}
            {menuLink('Quiz', 'quizzes')}
          </Nav>
          <Nav className="justify-content-end" style={EQUAL}>
            {menuLink('Settings', 'settings')}
          </Nav>
        </Container>
      </Navbar>
      <Container as="main" className="pb-4">
        {saveError && <Alert variant="warning">Your work is not being saved: {saveError}</Alert>}
        {storage.skipped > 0 && (
          <Alert variant="info" dismissible>
            {storage.skipped} saved records could not be read by this version of Whetstone and were
            not loaded.
          </Alert>
        )}
        {view.page === 'solve' && (
          <ProblemPage
            key={view.attempt.id}
            topic={view.topic}
            problem={view.problem}
            initial={view.attempt}
            attempts={attempts}
            runner={runner}
            onSave={save}
            onBusy={setBusy}
          />
        )}
        {view.page === 'problems' && (
          <ProblemList
            topics={enabled}
            attempts={attempts}
            onStart={start}
            onResume={(owner, problem, attempt) =>
              setView({ page: 'solve', topic: owner, problem, attempt })
            }
          />
        )}
        {view.page === 'settings' && (
          <TopicsPage
            topics={topics}
            onCreate={createTopic}
            onOpen={(id) => setView({ page: 'topic', id })}
          />
        )}
        {topic && (
          <TopicPage
            key={topic.id}
            topic={topic}
            runner={runner}
            onChange={(change) => updateTopic(topic.id, change)}
            onDelete={() => deleteTopic(topic.id)}
            onBusy={setBusy}
          />
        )}
        {view.page === 'quizzes' && (
          <QuizzesPage
            topics={enabled}
            quizzes={quizzes}
            onStart={beginQuiz}
            onOpen={(id) => setView({ page: 'quiz', id })}
            onDiscard={discardQuiz}
          />
        )}
        {quiz && (
          <QuizPage key={quiz.id} quiz={quiz} onChange={(change) => updateQuiz(quiz.id, change)} />
        )}
      </Container>
    </>
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface ProblemListProps {
  topics: TopicFile[]
  attempts: Attempt[]
  onStart: (topic: Topic, problem: Problem) => void
  onResume: (topic: Topic, problem: Problem, attempt: Attempt) => void
}

function ProblemList({ topics, attempts, onStart, onResume }: ProblemListProps) {
  const shown = topics.filter((t) => t.problems.length > 0)
  return (
    <section aria-label="Problems">
      <h1 className="h3">Problems</h1>
      {shown.length === 0 && (
        <p>No problems to practise. Add problems to a topic, or enable one, under Settings.</p>
      )}
      {shown.map(({ topic, problems }) => (
        <section key={topic.id} aria-label={topic.name} className="mb-3">
          <h2 className="h5">{topic.name}</h2>
          <ListGroup as="ul">
            {problems.map((problem) => (
              <ProblemRow
                key={problem.id}
                problem={problem}
                latest={latestAttempt(attempts, topic.id, problem.id)}
                graded={lastGraded(attempts, topic.id, problem.id)}
                onStart={() => onStart(topic, problem)}
                onResume={(attempt) => onResume(topic, problem, attempt)}
              />
            ))}
          </ListGroup>
        </section>
      ))}
    </section>
  )
}

interface ProblemRowProps {
  problem: Problem
  latest?: Attempt
  graded?: Attempt
  onStart: () => void
  onResume: (attempt: Attempt) => void
}

function ProblemRow({ problem, latest, graded, onStart, onResume }: ProblemRowProps) {
  const title = problem.wordings[0].title
  const unfinished = latest && !latest.grade ? latest : undefined
  return (
    <ListGroup.Item as="li" aria-label={title}>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <span className="fw-semibold">{title}</span>
        <Badge bg="secondary">{problem.difficulty}</Badge>
        {graded?.grade && (
          <span className="text-body-secondary">Last score {graded.grade.score}</span>
        )}
        {unfinished && <Badge bg="info">In progress</Badge>}
        <Stack direction="horizontal" gap={2} className="ms-auto">
          {unfinished && (
            <Button
              size="sm"
              variant="primary"
              aria-label={`Resume ${title}`}
              onClick={() => onResume(unfinished)}
            >
              Resume
            </Button>
          )}
          <Button
            size="sm"
            variant={unfinished ? 'outline-primary' : 'primary'}
            aria-label={`${unfinished ? 'Start over' : 'Start'} ${title}`}
            onClick={onStart}
          >
            {unfinished ? 'Start over' : 'Start'}
          </Button>
        </Stack>
      </Stack>
    </ListGroup.Item>
  )
}
