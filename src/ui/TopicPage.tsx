import { useState } from 'react'
import { Alert, Badge, Button, Form, ListGroup, Stack } from 'react-bootstrap'
import { QUESTION_TEMPLATE, questionRequest, readItems } from '@/core/bridge'
import {
  addQuestions,
  deleteItem,
  itemText,
  served,
  type ItemErrors,
  type TopicRecord,
} from '@/core/topics'
import { conceptNames } from '@/content/schema'
import { CodeBlock } from './CodeBlock'
import { CodeEditor } from './CodeEditor'
import { ConceptTags } from './progress'
import { TopicConcepts } from './TopicConcepts'

interface Props {
  topic: TopicRecord
  onChange: (change: (topic: TopicRecord) => TopicRecord) => void
  onDelete: () => void
}

// The editor adds new questions, or replaces the one being edited.
interface Editing {
  text: string
  replaces?: { id: string; title: string }
}

// Problems are added, edited and deleted in Settings, Coding problems.
export function TopicPage({ topic, onChange, onDelete }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const { file, unreadable } = served(topic)
  const questions = file.questions.map((q) => ({
    id: q.id,
    title: q.summary,
    badge: `${q.difficulty}, ${q.type === 'single' ? 'single choice' : 'multiple choice'}`,
    concepts: conceptNames(file.topic, q.concepts),
    text: itemText(q, topic.concepts),
  }))
  const request = {
    topic: topic.name,
    concepts: topic.concepts,
    existing: questions.map((r) => r.title),
  }

  return (
    <Stack gap={4}>
      <Header topic={topic} onChange={onChange} onDelete={onDelete} />

      <TopicConcepts
        topic={topic}
        file={file}
        // An open editor holds concept names; a change under it would bring them back.
        locked={editing !== null}
        onChange={onChange}
      />

      <section aria-labelledby="questions-title">
        <h2 id="questions-title" className="h5">
          Questions
        </h2>
        {unreadable.questions > 0 && (
          <Alert variant="warning">
            {unreadable.questions} questions do not follow the current content rules and are not
            served.
          </Alert>
        )}
        <ListGroup as="ul" className="mb-2">
          {questions.map(({ id, title, badge, concepts, text }) => (
            <ListGroup.Item as="li" key={id} aria-label={title}>
              <Stack direction="horizontal" gap={2} className="flex-wrap">
                <span className="fw-semibold">{title}</span>
                <Badge bg="secondary">{badge}</Badge>
                <ConceptTags names={concepts} />
                <Stack direction="horizontal" gap={2} className="ms-auto">
                  <Button
                    size="sm"
                    variant="outline-primary"
                    aria-label={`Edit ${title}`}
                    disabled={editing !== null}
                    onClick={() => setEditing({ text, replaces: { id, title } })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    aria-label={`Delete ${title}`}
                    disabled={editing !== null}
                    onClick={() => {
                      if (confirm(`Delete "${title}"?`))
                        onChange((t) => deleteItem(t, 'questions', id))
                    }}
                  >
                    Delete
                  </Button>
                </Stack>
              </Stack>
            </ListGroup.Item>
          ))}
        </ListGroup>
        {editing ? (
          <QuestionEditor
            topic={topic}
            initial={editing}
            onDone={(next) => {
              onChange(() => next)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button variant="primary" onClick={() => setEditing({ text: '' })}>
            New question
          </Button>
        )}
        <div className="mt-4">
          <Snippet
            label="Chat bot request for questions"
            value={questionRequest(request)}
            language="markdown"
          />
          <Snippet label="Question template" value={QUESTION_TEMPLATE} language="json" />
        </div>
      </section>
    </Stack>
  )
}

interface EditorProps {
  topic: TopicRecord
  initial: Editing
  onDone: (topic: TopicRecord) => void
  onCancel: () => void
}

function QuestionEditor({ topic, initial, onDone, onCancel }: EditorProps) {
  const [text, setText] = useState(initial.text)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<ItemErrors[]>([])
  const { replaces } = initial

  function submit() {
    setError(null)
    setFailed([])
    const read = readItems(text, 'questions')
    if ('error' in read) return setError(read.error)
    const added = addQuestions(topic, read.items, () => crypto.randomUUID(), replaces?.id)
    if (added.ok) onDone(added.record)
    else setFailed(added.errors)
  }

  return (
    <section aria-label={replaces ? `Edit ${replaces.title}` : 'New question'}>
      <p className="text-body-secondary mb-2">
        {replaces
          ? 'Edit the question as JSON.'
          : 'Paste one question, a list of questions, or a chat bot answer.'}{' '}
        Each question is checked first. Nothing is added unless every question passes.
      </p>
      <div className="mb-2">
        <CodeEditor
          initialValue={initial.text}
          onChange={setText}
          label="Question JSON"
          language="json"
        />
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {failed.length > 0 && (
        <Alert variant="danger">
          Nothing was {replaces ? 'saved' : 'added'}.
          {failed.map(({ item, title, errors }) => (
            <div key={item} className="mt-2">
              Question {item}
              {title && ` “${title}”`}:
              <ul className="mb-0">
                {errors.map((e, i) => (
                  <li key={i} style={{ whiteSpace: 'pre-wrap' }}>
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Alert>
      )}
      <Stack direction="horizontal" gap={2}>
        <Button onClick={submit} disabled={!text.trim()}>
          {replaces ? 'Save' : 'Add'}
        </Button>
        <Button variant="outline-secondary" onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </section>
  )
}

interface HeaderProps {
  topic: TopicRecord
  onChange: Props['onChange']
  onDelete: () => void
}

function Header({ topic, onChange, onDelete }: HeaderProps) {
  const [name, setName] = useState(topic.name)
  return (
    <div>
      <h1 className="h3">{topic.name}</h1>
      <Stack direction="horizontal" gap={3} className="flex-wrap">
        <Form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onChange((t) => ({ ...t, name: name.trim() }))
          }}
        >
          <Stack direction="horizontal" gap={2}>
            <Form.Control
              aria-label="Topic name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline-secondary"
              disabled={!name.trim() || name.trim() === topic.name}
            >
              Rename
            </Button>
          </Stack>
        </Form>
        <Form.Check
          type="switch"
          role="switch"
          id={`enabled-${topic.id}`}
          label="Enabled"
          checked={topic.enabled}
          onChange={(event) => onChange((t) => ({ ...t, enabled: event.target.checked }))}
        />
        <Button
          variant="outline-danger"
          className="ms-auto"
          onClick={() => {
            if (confirm(`Delete the topic "${topic.name}"? Its past attempts will be kept.`))
              onDelete()
          }}
        >
          Delete topic
        </Button>
      </Stack>
    </div>
  )
}

function Snippet(props: { label: string; value: string; language: 'json' | 'markdown' }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="mb-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{props.label}</summary>
      {/* Mounted when shown: the editor measures its lines when it is created. */}
      {open && (
        <div className="mt-2">
          <CodeBlock {...props} />
        </div>
      )}
    </details>
  )
}
