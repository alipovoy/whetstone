import { useState } from 'react'
import { Button } from 'react-bootstrap'
import type { Problem, Topic, TopicFile } from '@/content/schema'
import { latestAttempt, type Attempt } from '@/core/attempt'
import type { Quiz } from '@/core/quiz'
import { plural } from './format'
import { Icon } from './icons'
import { Link } from './Link'

const RECENT = 5
const DAY_MS = 86_400_000

interface Found {
  topic: Topic
  problem: Problem
}

interface Props {
  topics: TopicFile[]
  attempts: Attempt[]
  quizzes: Quiz[]
  onStart: (topic: Topic, problem: Problem) => void
  onResume: (topic: Topic, problem: Problem) => void
}

export function HomePage({ topics, attempts, quizzes, onStart, onResume }: Props) {
  const [now] = useState(() => Date.now())
  const find = (a: Attempt): Found | undefined => {
    const file = topics.find((t) => t.topic.id === a.topic)
    const problem = file?.problems.find((p) => p.id === a.problem)
    return file && problem && { topic: file.topic, problem }
  }
  // Only the latest attempt of a problem can be continued: its address opens that one.
  const unfinished = attempts
    .filter((a) => !a.grade && latestAttempt(attempts, a.topic, a.problem) === a)
    .toSorted((a, b) => b.updated_at - a.updated_at)
    .flatMap((attempt) => {
      const found = find(attempt)
      return found ? [{ attempt, ...found }] : []
    })[0]
  const all = topics.flatMap((t) => t.problems.map((problem) => ({ topic: t.topic, problem })))
  const random = () => {
    const pick = all[Math.floor(Math.random() * all.length)]
    onStart(pick.topic, pick.problem)
  }

  return (
    <div className="ws-page ws-home">
      <section className="ws-panel ws-hero" aria-labelledby="home-title">
        <h1 id="home-title">Practise for the technical interview</h1>
        <p className="ws-lead">
          Solve Python problems against their tests and take timed quizzes. Your code runs in this
          browser.
        </p>
        {unfinished && (
          <div className="ws-resume">
            <div>
              <h2 className="h5 mb-1">Continue: {unfinished.problem.wordings[0].title}</h2>
              <p className="text-body-secondary small mb-0">
                {unfinished.problem.difficulty}, {minutes(unfinished.attempt.elapsed_ms)} spent
              </p>
            </div>
            <Button size="lg" onClick={() => onResume(unfinished.topic, unfinished.problem)}>
              Continue
            </Button>
          </div>
        )}
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-secondary" onClick={random} disabled={all.length === 0}>
            <Icon name="shuffle" />
            Random problem
          </Button>
          <Link className="btn btn-outline-secondary" to={{ page: 'quizzes' }}>
            <Icon name="quiz" />
            Build a quiz
          </Link>
          <Link className="btn btn-outline-secondary" to={{ page: 'add-items', list: 'problems' }}>
            <Icon name="plus" />
            Add problems
          </Link>
          <Link className="btn btn-outline-secondary" to={{ page: 'add-items', list: 'questions' }}>
            <Icon name="plus" />
            Add questions
          </Link>
        </div>
      </section>
      <div className="ws-home-side">
        <Recent attempts={attempts} quizzes={quizzes} now={now} find={find} />
        <section className="ws-panel p-4" aria-labelledby="progress-title">
          <h2 id="progress-title" className="h5">
            Your progress
          </h2>
          <p className="text-body-secondary small mb-0">
            Progress is saved in this browser only. Clearing the site data removes it. Signing in to
            keep it on a server comes later.
          </p>
        </section>
      </div>
    </div>
  )
}

interface RecentProps {
  attempts: Attempt[]
  quizzes: Quiz[]
  now: number
  find: (a: Attempt) => Found | undefined
}

function Recent({ attempts, quizzes, now, find }: RecentProps) {
  const items = [
    ...attempts.flatMap((a) => {
      if (!a.grade) return []
      const found = find(a)
      return [
        {
          key: a.id,
          at: a.grade.at,
          title: a.grade.asked.wording.title,
          kind: 'Coding problem',
          score: a.grade.score,
          to: found && ({ page: 'solve', topic: a.topic, problem: a.problem } as const),
        },
      ]
    }),
    ...quizzes.flatMap((q) =>
      q.result
        ? [
            {
              key: q.id,
              at: q.result.at,
              title: `Quiz: ${[...new Set(q.questions.map((s) => s.topic_name))].join(', ')}`,
              kind: plural(q.questions.length, 'question'),
              score: q.result.score,
              to: { page: 'quiz', id: q.id } as const,
            },
          ]
        : [],
    ),
  ]
    .toSorted((a, b) => b.at - a.at)
    .slice(0, RECENT)

  return (
    <section className="ws-panel p-4" aria-labelledby="recent-title">
      <h2 id="recent-title" className="h5">
        Recent
      </h2>
      {items.length === 0 ? (
        <p className="text-body-secondary mb-0">
          Nothing yet. Graded problems and finished quizzes show here.
        </p>
      ) : (
        <ul className="ws-recent">
          {items.map((item) => (
            <li key={item.key}>
              {item.to ? <Link to={item.to}>{item.title}</Link> : <span>{item.title}</span>}
              <span className="ws-when">
                {item.kind}, {when(item.at, now)}
              </span>
              <span className="ws-score" aria-label={`Score ${item.score}`}>
                {item.score}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 1 ? 'under a minute' : `${m} min`
}

function when(at: number, now: number): string {
  const days = Math.floor(startOfDay(now) / DAY_MS) - Math.floor(startOfDay(at) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function startOfDay(t: number): number {
  const d = new Date(t)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}
