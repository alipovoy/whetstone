import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button, Dropdown, Form } from 'react-bootstrap'
import { DIFFICULTIES, type Source } from '@/content/schema'
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
  statuses?: { value: ProblemStatus; label: string }[]
  sources?: { value: Source; label: string }[]
  filter: ProblemFilter
  onFilter: (filter: ProblemFilter) => void
  children: ReactNode
}

// Search, topic, concepts, difficulty, and status or source; the topics and concepts are those of
// the entries.
export function Filters({ entries, statuses, sources, filter, onFilter, children }: Props) {
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
        {statuses && (
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
        )}
        {sources && (
          <Form.Group controlId={`${id}-source`}>
            <Form.Label>Source</Form.Label>
            <Form.Select
              value={filter.source ?? ''}
              onChange={(e) =>
                set({ source: sources.find((s) => s.value === e.target.value)?.value })
              }
            >
              <option value="">Any source</option>
              {sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}
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

// A problem shows while any of its concepts is checked; all checked is no filter. An area's box
// checks or unchecks all of its concepts.
function ConceptsField({ groups, off, onChange }: ConceptsFieldProps) {
  const id = useId()
  const names = [...new Set(groups.flatMap((g) => g.names))]
  const checked = names.filter((n) => !off.includes(n))
  const toggle = (name: string) =>
    onChange(off.includes(name) ? off.filter((n) => n !== name) : [...off, name])
  const toggleArea = (group: string[], on: boolean) =>
    onChange(on ? off.filter((n) => !group.includes(n)) : [...new Set([...off, ...group])])
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
          {groups.map((group, g) => {
            const shown = group.names.filter((n) => !off.includes(n)).length
            const all = shown === group.names.length
            return (
              <fieldset key={group.area ?? ''}>
                <legend>
                  <Form.Check
                    id={`${id}-${g}`}
                    label={group.area ?? 'No area'}
                    checked={all}
                    ref={(box: HTMLInputElement | null) => {
                      if (box) box.indeterminate = shown > 0 && !all
                    }}
                    onChange={() => toggleArea(group.names, !all)}
                  />
                </legend>
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
            )
          })}
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
