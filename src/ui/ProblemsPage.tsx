import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Form } from 'react-bootstrap'
import { DIFFICULTIES, type Problem, type Topic, type TopicFile } from '@/content/schema'
import type { Attempt } from '@/core/attempt'
import {
  applicableFilter,
  filterProblems,
  problemAreas,
  problemEntries,
  PROBLEM_STATUSES,
  SOLVED_SCORE,
  type ProblemEntry,
  type ProblemFilter,
  type ProblemStatus,
} from '@/core/problems'
import { Icon } from './icons'
import { Link } from './Link'
import { STATUS_LABEL, StatusPill, TestMarks } from './progress'

const STATUS_OPTION: Record<ProblemStatus, string> = {
  ...STATUS_LABEL,
  solved: `Solved (score ${SOLVED_SCORE} or more)`,
  'needs-work': `Needs work (score under ${SOLVED_SCORE})`,
}

interface Props {
  topics: TopicFile[]
  attempts: Attempt[]
  filter: ProblemFilter
  onFilter: (filter: ProblemFilter) => void
  onStart: (topic: Topic, problem: Problem) => void
  onResume: (topic: Topic, problem: Problem) => void
}

// Typing writes the address after a pause: browsers limit how often a page may replace it.
const SEARCH_DELAY_MS = 300

export function ProblemsPage({
  topics,
  attempts,
  filter: asked,
  onFilter,
  onStart,
  onResume,
}: Props) {
  const entries = useMemo(() => problemEntries(topics, attempts), [topics, attempts])
  const filter = applicableFilter(asked, entries)
  const shown = filterProblems(entries, filter)
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
          <Link className="btn btn-primary" to={{ page: 'topics' }}>
            Open Settings, Topics
          </Link>
        </div>
      ) : (
        <>
          <Filters
            topics={topics.filter((t) => t.problems.length > 0)}
            entries={entries}
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
                <p className="text-body-secondary">Widen the search or clear the filters.</p>
                <Button variant="outline-secondary" onClick={() => onFilter({})}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <ul className="ws-problems">
                {shown.map((e) => (
                  <ProblemRow
                    key={`${e.topic.id}/${e.problem.id}`}
                    entry={e}
                    onStart={() => onStart(e.topic, e.problem)}
                    onResume={() => onResume(e.topic, e.problem)}
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

interface FiltersProps {
  topics: TopicFile[]
  entries: ProblemEntry[]
  filter: ProblemFilter
  onFilter: (filter: ProblemFilter) => void
  children: ReactNode
}

function Filters({ topics, entries, filter, onFilter, children }: FiltersProps) {
  const id = useId()
  const areas = problemAreas(entries, filter.topic)
  const set = (change: ProblemFilter) => onFilter({ ...filter, ...change })

  return (
    <section className="ws-panel ws-filters" aria-label="Filters">
      <div className="ws-filter-fields">
        <Form.Group className="ws-filter-search" controlId={`${id}-search`}>
          <Form.Label>Search</Form.Label>
          <SearchField value={filter.search ?? ''} onChange={(search) => set({ search })} />
        </Form.Group>
        <Form.Group controlId={`${id}-topic`}>
          <Form.Label>Topic</Form.Label>
          <Form.Select
            value={filter.topic ?? ''}
            onChange={(e) => set({ topic: e.target.value || undefined })}
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.topic.id} value={t.topic.id}>
                {t.topic.name}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Form.Group controlId={`${id}-area`}>
          <Form.Label>Area</Form.Label>
          <Form.Select
            value={filter.area ?? ''}
            onChange={(e) => set({ area: e.target.value || undefined })}
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <div>
          <span className="form-label d-block" id={`${id}-difficulty`}>
            Difficulty
          </span>
          <div className="ws-seg ws-seg-text" role="group" aria-labelledby={`${id}-difficulty`}>
            {[undefined, ...DIFFICULTIES].map((d) => (
              <button
                key={d ?? 'any'}
                type="button"
                aria-pressed={filter.difficulty === d}
                onClick={() => set({ difficulty: d })}
              >
                {d ?? 'Any'}
              </button>
            ))}
          </div>
        </div>
        <Form.Group controlId={`${id}-status`}>
          <Form.Label>Status</Form.Label>
          <Form.Select
            value={filter.status ?? ''}
            onChange={(e) => set({ status: PROBLEM_STATUSES.find((s) => s === e.target.value) })}
          >
            <option value="">Any status</option>
            {PROBLEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_OPTION[s]}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </div>
      <div className="ws-filter-foot">{children}</div>
    </section>
  )
}

interface SearchFieldProps {
  value: string
  onChange: (search?: string) => void
}

function SearchField({ value, onChange }: SearchFieldProps) {
  const [text, setText] = useState(value)
  // A change from outside, such as Clear filters or Back, replaces what was typed.
  const [outside, setOutside] = useState(value)
  if (value !== outside) {
    setOutside(value)
    setText(value)
  }
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })
  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => latest.current(text || undefined), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, value])
  return (
    <Form.Control
      type="search"
      placeholder="Title or concept"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  )
}

interface ProblemRowProps {
  entry: ProblemEntry
  onStart: () => void
  onResume: () => void
}

function ProblemRow({ entry, onStart, onResume }: ProblemRowProps) {
  const { topic, problem, title, concept, graded, status } = entry
  const unfinished = status === 'in-progress'
  return (
    <li className="ws-problem" aria-label={title}>
      <div className="ws-problem-name">
        <Link to={{ page: 'solve', topic: topic.id, problem: problem.id }}>{title}</Link>
        <span>
          {concept}, {topic.name}
        </span>
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
        {unfinished && (
          <Button size="sm" aria-label={`Resume ${title}`} onClick={onResume}>
            Resume
          </Button>
        )}
        <Button
          size="sm"
          variant={unfinished ? 'outline-secondary' : 'outline-primary'}
          aria-label={`${unfinished ? 'Start over' : 'Start'} ${title}`}
          onClick={onStart}
        >
          {unfinished ? 'Start over' : 'Start'}
        </Button>
      </div>
    </li>
  )
}
