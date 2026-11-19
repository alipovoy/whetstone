import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, Dropdown, Form } from 'react-bootstrap'
import { DIFFICULTIES } from '@/content/schema'
import {
  conceptGroups,
  type ConceptGroup,
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

// Search, topic, concepts, difficulty and status; the topics and concepts are those of the entries.
export function Filters({ entries, statuses, filter, onFilter, children }: Props) {
  const id = useId()
  const topics = [...new Map(entries.map((e) => [e.topic.id, e.topic.name])).entries()]
  const groups = conceptGroups(entries, filter.topic)
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
        <ConceptsField
          groups={groups}
          off={filter.offConcepts ?? []}
          onChange={(offConcepts) => set({ offConcepts })}
        />
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

interface ConceptsFieldProps {
  groups: ConceptGroup[]
  off: string[]
  onChange: (off?: string[]) => void
}

// A problem shows while any of its concepts is checked; all checked is no filter.
function ConceptsField({ groups, off, onChange }: ConceptsFieldProps) {
  const id = useId()
  const names = [...new Set(groups.flatMap((g) => g.names))]
  const checked = names.filter((n) => !off.includes(n))
  const toggle = (name: string) =>
    onChange(off.includes(name) ? off.filter((n) => n !== name) : [...off, name])
  const summary =
    checked.length === names.length
      ? 'All concepts'
      : checked.length === 0
        ? 'No concepts'
        : checked.length === 1
          ? checked[0]
          : `${checked.length} of ${names.length}`
  return (
    <div>
      <span className="form-label d-block" id={`${id}-label`}>
        Concepts
      </span>
      <Dropdown autoClose="outside">
        <Dropdown.Toggle
          as="button"
          type="button"
          id={`${id}-toggle`}
          className="form-select ws-concepts-toggle"
          aria-labelledby={`${id}-label ${id}-toggle`}
        >
          {summary}
        </Dropdown.Toggle>
        <Dropdown.Menu className="ws-concepts-menu">
          <div className="ws-concepts-links">
            <Button
              variant="link"
              size="sm"
              disabled={checked.length === names.length}
              onClick={() => onChange(undefined)}
            >
              All
            </Button>
            <Button
              variant="link"
              size="sm"
              disabled={checked.length === 0}
              onClick={() => onChange(names)}
            >
              Clear
            </Button>
          </div>
          {groups.map((group, g) => (
            <fieldset key={group.area ?? ''}>
              <legend>{group.area ?? 'No area'}</legend>
              {group.names.map((name, n) => (
                <Form.Check
                  key={name}
                  id={`${id}-${g}-${n}`}
                  label={name}
                  checked={!off.includes(name)}
                  onChange={() => toggle(name)}
                />
              ))}
            </fieldset>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </div>
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
