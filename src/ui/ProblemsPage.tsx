import { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import type { Problem, Topic, TopicFile } from '@/content/schema'
import type { Attempt } from '@/core/attempt'
import {
  applicableFilter,
  filterEntries,
  problemEntries,
  PROBLEM_STATUSES,
  type ProblemEntry,
  type ItemFilter,
} from '@/core/problems'
import { Filters } from './Filters'
import { Icon } from './icons'
import { Link } from './Link'
import { addItemsFor } from './route'
import { ConceptTags, statusOptions, StatusPill, TestMarks } from './progress'

const STATUSES = statusOptions(PROBLEM_STATUSES)

interface Props {
  topics: TopicFile[]
  attempts: Attempt[]
  filter: ItemFilter
  onFilter: (filter: ItemFilter) => void
  onStart: (topic: Topic, problem: Problem) => void
  onResume: (topic: Topic, problem: Problem) => void
  onDiscard: (topic: Topic, problem: Problem) => void
}

export function ProblemsPage({
  topics,
  attempts,
  filter: asked,
  onFilter,
  onStart,
  onResume,
  onDiscard,
}: Props) {
  const entries = useMemo(() => problemEntries(topics, attempts), [topics, attempts])
  const filter = applicableFilter(asked, entries)
  const shown = filterEntries(entries, filter)
  const filtered = Object.values(filter).some(Boolean)

  const open = (e: ProblemEntry) =>
    e.status === 'in-progress' ? onResume(e.topic, e.problem) : onStart(e.topic, e.problem)
  // An open attempt is resumed, so a random pick never throws away work.
  const random = () => open(shown[Math.floor(Math.random() * shown.length)])

  return (
    <>
      <h1 className="h3 mb-0">Coding problems</h1>
      {entries.length === 0 ? (
        <div className="ws-panel ws-empty">
          <h2 className="h5 mb-0">No problems to practise</h2>
          <p className="text-body-secondary">Add problems to a topic, or enable one.</p>
          <div className="d-flex flex-wrap justify-content-center gap-2">
            <Link className="btn btn-primary" to={{ page: 'add-items', list: 'problems' }}>
              Add problems
            </Link>
            <Link className="btn btn-outline-secondary" to={{ page: 'topics' }}>
              Open Settings, Topics
            </Link>
          </div>
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
                ? `${shown.length} of ${entries.length} problems`
                : `${entries.length} problems`}
            </p>
            <Button
              variant="link"
              className="ms-auto"
              disabled={!filtered}
              onClick={() => onFilter({})}
            >
              Clear filters
            </Button>
            <Button onClick={random} disabled={shown.length === 0}>
              <Icon name="shuffle" />
              Start a random one
            </Button>
          </Filters>
          <section className="ws-panel" aria-label="Problems">
            {shown.length === 0 ? (
              <div className="ws-empty">
                <h2 className="h5 mb-0">No problems match these filters</h2>
                <p className="text-body-secondary">
                  Widen the search, clear the filters, or add some.
                </p>
                <div className="d-flex flex-wrap justify-content-center gap-2">
                  <Button variant="outline-secondary" onClick={() => onFilter({})}>
                    Clear filters
                  </Button>
                  <Link className="btn btn-primary" to={addItemsFor('problems', filter, entries)}>
                    Add problems
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="ws-problems">
                {shown.map((e) => (
                  <ProblemRow
                    key={`${e.topic.id}/${e.problem.id}`}
                    entry={e}
                    onStart={() => onStart(e.topic, e.problem)}
                    onResume={() => onResume(e.topic, e.problem)}
                    onDiscard={() => {
                      if (confirm(`Discard your work on "${e.title}"?`))
                        onDiscard(e.topic, e.problem)
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}

interface ProblemRowProps {
  entry: ProblemEntry
  onStart: () => void
  onResume: () => void
  onDiscard: () => void
}

function ProblemRow({ entry, onStart, onResume, onDiscard }: ProblemRowProps) {
  const { topic, problem, title, concepts, graded, status } = entry
  const unfinished = status === 'in-progress'
  return (
    <li className="ws-problem" aria-label={title}>
      <div className="ws-problem-name">
        <Link to={{ page: 'solve', topic: topic.id, problem: problem.id }}>{title}</Link>
        <div className="ws-problem-meta">
          <span>{topic.name}</span>
          <ConceptTags names={concepts.map((c) => c.name)} />
        </div>
      </div>
      <span className="ws-difficulty" data-level={problem.difficulty}>
        {problem.difficulty}
      </span>
      <TestMarks grade={graded?.grade} />
      <span className="ws-last-score">
        {graded?.grade && (
          <>
            <span className="visually-hidden">Last score </span>
            {graded.grade.score}
          </>
        )}
      </span>
      <StatusPill status={status} />
      <div className="ws-problem-actions">
        {unfinished ? (
          <>
            <Button size="sm" aria-label={`Resume ${title}`} onClick={onResume}>
              Resume
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              aria-label={`Discard ${title}`}
              onClick={onDiscard}
            >
              Discard
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline-primary"
            aria-label={`Start ${title}`}
            onClick={onStart}
          >
            Start
          </Button>
        )}
      </div>
    </li>
  )
}
