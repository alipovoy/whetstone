import { useState } from 'react'
import { Button, Form, Stack } from 'react-bootstrap'
import type { TopicRecord } from '@/core/topics'
import { TopicConcepts } from './TopicConcepts'

interface Props {
  topic: TopicRecord
  onChange: (change: (topic: TopicRecord) => TopicRecord) => void
  onDelete: () => void
}

// Problems and questions are added, edited and deleted in Settings, Coding problems and Quiz
// questions.
export function TopicPage({ topic, onChange, onDelete }: Props) {
  return (
    <Stack gap={4}>
      <Header topic={topic} onChange={onChange} onDelete={onDelete} />
      <TopicConcepts topic={topic} />
    </Stack>
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
