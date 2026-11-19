import { useId } from 'react'
import { Button, Dropdown, Form } from 'react-bootstrap'
import { DIFFICULTIES } from '@/content/schema'
import { MAX_ITEMS, type ItemOrder } from '@/core/bridge'
import type { TopicRecord } from '@/core/topics'

export interface Order extends ItemOrder {
  topic: string
}

interface Props {
  topics: TopicRecord[]
  value: Order
  onChange: (order: Order) => void
  disabled?: boolean
}

// What to add: the topic, its concepts to focus on, the difficulty and how many.
export function ItemOrderForm({ topics, value, onChange, disabled }: Props) {
  const id = useId()
  const set = (change: Partial<Order>) => onChange({ ...value, ...change })
  const topic = topics.find((t) => t.id === value.topic)
  return (
    <fieldset className="ws-order" disabled={disabled}>
      <legend className="h5">What to add</legend>
      <Form.Group controlId={`${id}-topic`}>
        <Form.Label>Topic</Form.Label>
        <Form.Select
          value={value.topic}
          onChange={(e) => set({ topic: e.target.value, focus: [] })}
        >
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {!t.enabled && ' (disabled)'}
            </option>
          ))}
        </Form.Select>
      </Form.Group>
      <FocusField
        concepts={topic?.concepts ?? []}
        focus={value.focus}
        onChange={(focus) => set({ focus })}
      />
      <div className="ws-order-difficulty">
        <span className="form-label d-block" id={`${id}-difficulty`}>
          Difficulty
        </span>
        <div className="ws-seg ws-seg-text" role="group" aria-labelledby={`${id}-difficulty`}>
          {[...DIFFICULTIES, 'Mixed' as const].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.difficulty === d}
              onClick={() => set({ difficulty: d })}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <Form.Group controlId={`${id}-count`} className="ws-order-count">
        <Form.Label>How many</Form.Label>
        <Form.Select value={value.count} onChange={(e) => set({ count: Number(e.target.value) })}>
          {Array.from({ length: MAX_ITEMS }, (_, n) => (
            <option key={n + 1}>{n + 1}</option>
          ))}
        </Form.Select>
      </Form.Group>
    </fieldset>
  )
}

interface FocusProps {
  concepts: TopicRecord['concepts']
  focus: string[]
  onChange: (focus: string[]) => void
}

// None chosen means any concept of the topic.
function FocusField({ concepts, focus, onChange }: FocusProps) {
  const id = useId()
  const areas = [...new Set(concepts.map((c) => c.group))]
  const toggle = (name: string) =>
    onChange(focus.includes(name) ? focus.filter((n) => n !== name) : [...focus, name])
  const summary =
    focus.length === 0 ? 'Any concept' : focus.length === 1 ? focus[0] : `${focus.length} concepts`
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
          disabled={concepts.length === 0}
        >
          {summary}
        </Dropdown.Toggle>
        <Dropdown.Menu className="ws-concepts-menu">
          <div className="ws-concepts-links">
            <Button
              variant="link"
              size="sm"
              disabled={focus.length === 0}
              onClick={() => onChange([])}
            >
              Any
            </Button>
          </div>
          {areas.map((area, a) => (
            <fieldset key={area}>
              <legend>{area}</legend>
              {concepts
                .filter((c) => c.group === area)
                .toSorted((x, y) => x.name.localeCompare(y.name))
                .map((c) => (
                  <Form.Check
                    key={c.id}
                    id={`${id}-${a}-${c.id}`}
                    label={c.name}
                    checked={focus.includes(c.name)}
                    onChange={() => toggle(c.name)}
                  />
                ))}
            </fieldset>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </div>
  )
}
