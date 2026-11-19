import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert } from 'react-bootstrap'
import { latestAttempt, startAttempt, type Attempt, type Grade } from '@/core/attempt'
import { startQuiz, submitQuiz, type Quiz, type QuizSetup } from '@/core/quiz'
import { newTopic, served, type TopicRecord } from '@/core/topics'
import type { Problem, Topic } from '@/content/schema'
import type { PyodideRunner } from '@/runner/pyodide'
import type { Records } from '@/storage/database'
import { HomePage } from './HomePage'
import { SubMenuPage, TopBar } from './Layout'
import { ProblemPage } from './ProblemPage'
import { ProblemsPage } from './ProblemsPage'
import { QuizPage } from './QuizPage'
import { QuizzesPage } from './QuizzesPage'
import { TopicPage } from './TopicPage'
import { TopicsPage } from './TopicsPage'
import { Link } from './Link'
import { href, navigate, replaceRoute, sectionOf, useRoute, type Route } from './route'
import { AttemptReport, CodingReport, QuizReport } from './ReportsPages'
import { AppearancePage } from './SectionPages'

export type AppRunner = Pick<PyodideRunner, 'run' | 'test' | 'warmUp' | 'status' | 'subscribe'>

export interface AppStorage {
  store: {
    attempts: Pick<Records<Attempt>, 'put' | 'delete'>
    topics: Pick<Records<TopicRecord>, 'put' | 'delete'>
    quizzes: Pick<Records<Quiz>, 'put' | 'delete'>
  } | null
  attempts: Attempt[]
  topics: TopicRecord[]
  quizzes: Quiz[]
  skipped: number
  error?: string
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
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(storage.error)
  const route = useRoute(busy)

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
    navigate({ page: 'topic', id: topic.id })
  }
  const deleteTopic = (id: string) => {
    setTopicList(topicsNow.current.filter((t) => t.id !== id))
    store?.topics.delete(id).catch((error: unknown) => setSaveError(message(error)))
    navigate({ page: 'topics' })
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
    navigate({ page: 'quiz', id: quiz.id })
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

  // The address of a problem opens its latest attempt, so starting one saves it first.
  const start = (topic: Topic, problem: Problem) => {
    save(startAttempt(crypto.randomUUID(), topic.id, problem, problem.starter_code, Date.now()))
    navigate({ page: 'solve', topic: topic.id, problem: problem.id })
  }
  const resume = (topic: Topic, problem: Problem) =>
    navigate({ page: 'solve', topic: topic.id, problem: problem.id })
  // Every open attempt goes: Start over, before Discard replaced it, left one behind the latest.
  const discard = (topic: Topic, problem: Problem) => {
    const ids = attempts
      .filter((a) => a.topic === topic.id && a.problem === problem.id && !a.grade)
      .map((a) => a.id)
    setAttempts((list) => list.filter((a) => !ids.includes(a.id)))
    if (store)
      Promise.all(ids.map((id) => store.attempts.delete(id))).catch((error: unknown) =>
        setSaveError(message(error)),
      )
  }

  const owner = route.page === 'solve' ? enabled.find((f) => f.topic.id === route.topic) : undefined
  const target =
    route.page === 'solve' ? owner?.problems.find((p) => p.id === route.problem) : undefined

  // The list as last filtered, for the way back from a problem.
  const [list, setList] = useState<Route>({ page: 'problems' })
  if (route.page === 'problems' && href(route) !== href(list)) setList(route)
  // The same for the graded attempts.
  const [history, setHistory] = useState<Route>({ page: 'reports', section: 'coding' })
  if (route.page === 'reports' && route.section === 'coding' && href(route) !== href(history))
    setHistory(route)

  const section = sectionOf(route)
  const topic = route.page === 'topic' ? topics.find((t) => t.id === route.id) : undefined
  const quiz = route.page === 'quiz' ? quizzes.find((q) => q.id === route.id) : undefined
  const graded =
    route.page === 'attempt'
      ? attempts.find((a): a is Attempt & { grade: Grade } => a.id === route.id && !!a.grade)
      : undefined
  const servedProblem = (attempt: Attempt): Route | undefined =>
    enabled.some(
      (f) => f.topic.id === attempt.topic && f.problems.some((p) => p.id === attempt.problem),
    )
      ? { page: 'solve', topic: attempt.topic, problem: attempt.problem }
      : undefined

  const settings = (children: ReactNode) => (
    <div className="ws-page">
      <SubMenuPage
        label="Settings"
        placement="side"
        held={busy}
        items={[
          { label: 'Appearance', to: { page: 'appearance' }, current: route.page === 'appearance' },
          {
            label: 'Topics',
            to: { page: 'topics' },
            current: route.page === 'topics' || route.page === 'topic',
          },
        ]}
      >
        {children}
      </SubMenuPage>
    </div>
  )

  return (
    <div className="ws-app" data-ws-section={section}>
      <TopBar section={section} held={busy} />
      <main className="ws-main">
        {(saveError || storage.skipped > 0) && (
          <div className="ws-page pb-0">
            {saveError && (
              <Alert variant="warning" className="mb-0">
                Your work is not being saved: {saveError}
              </Alert>
            )}
            {storage.skipped > 0 && (
              <Alert variant="info" dismissible className="mb-0">
                {storage.skipped} saved records could not be read by this version of Whetstone and
                were not loaded.
              </Alert>
            )}
          </div>
        )}
        {route.page === 'home' && (
          <HomePage
            topics={enabled}
            attempts={attempts}
            quizzes={quizzes}
            onStart={start}
            onResume={resume}
          />
        )}
        {route.page === 'solve' &&
          (owner && target ? (
            <div className="ws-solve">
              <ProblemPage
                key={`${owner.topic.id}/${target.id}`}
                topic={owner.topic}
                problem={target}
                initial={latestAttempt(attempts, owner.topic.id, target.id)}
                attempts={attempts}
                runner={runner}
                onSave={save}
                onBusy={setBusy}
                back={list}
              />
            </div>
          ) : (
            <div className="ws-page">
              <Missing what="This problem" back={list} />
            </div>
          ))}
        {route.page === 'problems' && (
          <div className="ws-page">
            <ProblemsPage
              topics={enabled}
              attempts={attempts}
              filter={route.filter ?? {}}
              onFilter={(filter) => replaceRoute({ page: 'problems', filter })}
              onStart={start}
              onResume={resume}
              onDiscard={discard}
            />
          </div>
        )}
        {route.page === 'quizzes' && (
          <div className="ws-page">
            <QuizzesPage
              topics={enabled}
              quizzes={quizzes}
              onStart={beginQuiz}
              onOpen={(id) => navigate({ page: 'quiz', id })}
              onDiscard={discardQuiz}
            />
          </div>
        )}
        {route.page === 'quiz' && (
          <div className="ws-page">
            {quiz ? (
              <QuizPage
                key={quiz.id}
                quiz={quiz}
                onChange={(change) => updateQuiz(quiz.id, change)}
              />
            ) : (
              <Missing what="This quiz" back={{ page: 'quizzes' }} />
            )}
          </div>
        )}
        {(route.page === 'reports' || route.page === 'attempt') && (
          <div className="ws-page">
            <SubMenuPage
              label="Reports"
              placement="top"
              items={[
                {
                  label: 'Coding problems',
                  to: history,
                  current: route.page === 'attempt' || route.section === 'coding',
                },
                {
                  label: 'Quizzes',
                  to: { page: 'reports', section: 'quizzes' },
                  current: route.page === 'reports' && route.section === 'quizzes',
                },
              ]}
            >
              {route.page === 'reports' && route.section === 'coding' && (
                <CodingReport
                  topics={topics}
                  attempts={attempts}
                  filter={route.filter ?? {}}
                  onFilter={(filter) =>
                    replaceRoute({ page: 'reports', section: 'coding', filter })
                  }
                />
              )}
              {route.page === 'reports' && route.section === 'quizzes' && (
                <QuizReport quizzes={quizzes} />
              )}
              {route.page === 'attempt' &&
                (graded ? (
                  <AttemptReport
                    key={graded.id}
                    attempt={graded}
                    problem={servedProblem(graded)}
                    back={history}
                  />
                ) : (
                  <Missing
                    what="This attempt"
                    back={history}
                    why="Only graded attempts are kept in the report."
                  />
                ))}
            </SubMenuPage>
          </div>
        )}
        {route.page === 'appearance' && settings(<AppearancePage />)}
        {route.page === 'topics' &&
          settings(
            <TopicsPage
              topics={topics}
              onCreate={createTopic}
              onEnable={(id, on) => updateTopic(id, (t) => ({ ...t, enabled: on }))}
            />,
          )}
        {route.page === 'topic' &&
          settings(
            topic ? (
              <TopicPage
                key={topic.id}
                topic={topic}
                runner={runner}
                onChange={(change) => updateTopic(topic.id, change)}
                onDelete={() => deleteTopic(topic.id)}
                onBusy={setBusy}
              />
            ) : (
              <Missing what="This topic" back={{ page: 'topics' }} />
            ),
          )}
      </main>
    </div>
  )
}

interface MissingProps {
  what: string
  back: Route
  why?: string
}

function Missing({ what, back, why = 'It was deleted, or its topic is disabled.' }: MissingProps) {
  return (
    <div className="ws-panel ws-empty">
      <h1 className="h4">{what} is not available</h1>
      <p className="text-body-secondary">{why}</p>
      <Link className="btn btn-primary" to={back}>
        Go back
      </Link>
    </div>
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
