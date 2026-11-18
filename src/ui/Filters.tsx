import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Form } from 'react-bootstrap'
import { DIFFICULTIES } from '@/content/schema'
import {
  entryAreas,
  type Filterable,
  type ProblemFilter,
  type ProblemStatus,
} from '@/core/problems'

// Typing writes the address after a pause: browsers limit how often a page may replace it.
const SEARCH_DELAY_MS = 300

interface Props {
  entries: Filterable[]
  statuses: { value: ProblemStatus; label: string }[]
  filter: ProblemFilter
  onFilter: (filter: ProblemFilter) => void
  children: ReactNode
}

// Search, topic, area, difficulty and status; the topics and areas are those of the entries.
export function Filters({ entries, statuses, filter, onFilter, children }: Props) {
  const id = useId()
  const topics = [...new Map(entries.map((e) => [e.topic.id, e.topic.name])).entries()]
  const areas = entryAreas(entries, filter.topic)
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
            {topics.map(([topicId, name]) => (
              <option key={topicId} value={topicId}>
                {name}
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
            onChange={(e) =>
              set({ status: statuses.find((s) => s.value === e.target.value)?.value })
            }
          >
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
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
