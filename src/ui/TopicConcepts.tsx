import { useState } from 'react'
import { Button, Form, ListGroup, Stack } from 'react-bootstrap'
import type { TopicFile } from '@/content/schema'
import {
  addConcept,
  conceptMap,
  conceptUsage,
  deleteConcept,
  editConcept,
  type ConceptChange,
  type TopicRecord,
} from '@/core/topics'
import { conceptGroups } from '@/core/problems'
import { libraryEntries } from '@/core/library'
import { capital, plural } from './format'
import { Link } from './Link'
import type { Route } from './route'

interface Props {
  topic: TopicRecord
  file: TopicFile
  locked: boolean
  onChange: (change: (topic: TopicRecord) => TopicRecord) => void
}

const AREAS = 'concept-areas'

export function TopicConcepts({ topic, file, locked, onChange }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const areas = [...new Set(topic.concepts.map((c) => c.group))]
  // The library lists every stored problem, served or not, and filters by the concepts left
  // unchecked, including those a broken problem names but the topic no longer has.
  const named = conceptGroups(libraryEntries([topic])).flatMap((g) => g.names)
  const problemsOf = (name: string): Route => ({
    page: 'library',
    filter: { topic: topic.id, offConcepts: named.filter((n) => n !== name) },
    disabled: !topic.enabled || undefined,
  })

  function remove(id: string, name: string) {
    const used = conceptUsage(topic, id)
    let message = `Delete the concept “${name}”?`
    if (used.problems + used.questions > 0)
      message += ` It will be removed from ${items(used.problems, used.questions)}.`
    const { problems, questions } = used.only
    const one = problems + questions === 1
    if (problems + questions > 0)
      message += ` ${capital(items(problems, questions))} ${one ? 'has' : 'have'} no other concept and will be deleted too.`
    if (problems > 0)
      message += ` Past attempts at the deleted ${problems === 1 ? 'problem' : 'problems'} will be kept.`
    if (confirm(message)) onChange((t) => deleteConcept(t, id))
  }

  return (
    <section aria-label="Concepts">
      <h2 className="h5">Concepts</h2>
      <datalist id={AREAS}>
        {areas.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>
      {locked && (
        <p className="text-body-secondary small">
          Save or cancel the open question first to change concepts.
        </p>
      )}
      <ConceptForm
        label="New concept"
        submit="New concept"
        className="mb-3"
        disabled={locked}
        clearOnSave
        onSave={(name, area) => addConcept(topic, name, area)}
        onSaved={(record) => onChange(() => record)}
      />
      {topic.concepts.length === 0 ? (
        <p className="text-body-secondary">
          None yet: adding a problem or question adds its concepts.
        </p>
      ) : (
        conceptMap(file).map(({ area, concepts }) => (
          <section key={area} aria-label={area} className="ws-concept-area">
            <h3 className="h6">{area}</h3>
            <ListGroup as="ul">
              {concepts.map((c) => {
                const problemCount = conceptUsage(topic, c.id).problems
                return (
                  <ListGroup.Item as="li" key={c.id} aria-label={c.name}>
                    {editing === c.id ? (
                      <ConceptForm
                        label={`Edit ${c.name}`}
                        submit="Save"
                        initial={{ name: c.name, area }}
                        disabled={locked}
                        onSave={(name, newArea) => editConcept(topic, c.id, name, newArea)}
                        onSaved={(record) => {
                          onChange(() => record)
                          setEditing(null)
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <Stack direction="horizontal" gap={2} className="flex-wrap">
                        <span>{c.name}</span>
                        <span className="text-body-secondary small ms-auto">
                          <ProblemCount
                            count={problemCount}
                            name={c.name}
                            to={
                              problemCount
                                ? problemsOf(c.name)
                                : { page: 'add-problems', topic: topic.id, concepts: [c.name] }
                            }
                          />
                          , {plural(c.questions, 'question')}
                        </span>
                        <Stack direction="horizontal" gap={2}>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            aria-label={`Edit ${c.name}`}
                            disabled={locked || editing !== null}
                            onClick={() => setEditing(c.id)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            aria-label={`Delete ${c.name}`}
                            disabled={locked || editing !== null}
                            onClick={() => remove(c.id, c.name)}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </Stack>
                    )}
                  </ListGroup.Item>
                )
              })}
            </ListGroup>
          </section>
        ))
      )}
    </section>
  )
}

// A count links to the problems, or to adding the first ones.
function ProblemCount({ count, name, to }: { count: number; name: string; to: Route }) {
  return (
    <Link
      to={to}
      aria-label={count ? `${plural(count, 'problem')} of ${name}` : `Add problems of ${name}`}
    >
      {plural(count, 'problem')}
    </Link>
  )
}

const items = (problems: number, questions: number) =>
  [problems > 0 && plural(problems, 'problem'), questions > 0 && plural(questions, 'question')]
    .filter(Boolean)
    .join(' and ')

interface FormProps {
  label: string
  submit: string
  className?: string
  initial?: { name: string; area: string }
  disabled: boolean
  clearOnSave?: boolean
  onSave: (name: string, area: string) => ConceptChange
  onSaved: (record: TopicRecord) => void
  onCancel?: () => void
}

function ConceptForm({
  label,
  submit,
  className,
  initial,
  disabled,
  clearOnSave,
  ...on
}: FormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [area, setArea] = useState(initial?.area ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <Form
      aria-label={label}
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        const saved = on.onSave(name, area)
        if (!saved.ok) return setError(saved.error)
        setError(null)
        if (clearOnSave) {
          setName('')
          setArea('')
        }
        on.onSaved(saved.record)
      }}
    >
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Form.Control
          aria-label="Concept name"
          placeholder="Concept name"
          className="w-auto flex-grow-1"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Form.Control
          aria-label="Area"
          placeholder="Area"
          list={AREAS}
          className="w-auto flex-grow-1"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />
        <Stack direction="horizontal" gap={2}>
          <Button
            type="submit"
            variant={on.onCancel ? 'primary' : 'outline-primary'}
            className="text-nowrap"
            disabled={disabled || !name.trim() || !area.trim()}
          >
            {submit}
          </Button>
          {on.onCancel && (
            <Button variant="outline-secondary" onClick={on.onCancel}>
              Cancel
            </Button>
          )}
        </Stack>
      </Stack>
      {error && (
        <div role="alert" className="text-danger small mt-1">
          {error}
        </div>
      )}
    </Form>
  )
}
