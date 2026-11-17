import { useState } from 'react'
import { Badge, Button, Form, ListGroup, Stack } from 'react-bootstrap'
import type { TopicRecord } from '@/core/topics'

interface Props {
  topics: TopicRecord[]
  onCreate: (name: string) => void
  onOpen: (id: string) => void
}

export function TopicsPage({ topics, onCreate, onOpen }: Props) {
  const [name, setName] = useState('')
  return (
    <section aria-label="Topics">
      <h1 className="h3">Topics</h1>
      <Form
        className="mb-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onCreate(name.trim())
        }}
      >
        <Stack direction="horizontal" gap={2}>
          <Form.Control
            aria-label="New topic name"
            placeholder="New topic name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={!name.trim()} className="text-nowrap">
            Create topic
          </Button>
        </Stack>
      </Form>
      {topics.length === 0 && <p>No topics yet.</p>}
      <ListGroup as="ul">
        {topics
          .toSorted((a, b) => a.created_at - b.created_at)
          .map((topic) => (
            <ListGroup.Item as="li" key={topic.id} aria-label={topic.name}>
              <Stack direction="horizontal" gap={2} className="flex-wrap">
                <span className="fw-semibold">{topic.name}</span>
                <span className="text-body-secondary">{topic.problems.length} problems</span>
                {!topic.enabled && <Badge bg="secondary">Disabled</Badge>}
                <Button
                  size="sm"
                  variant="outline-primary"
                  className="ms-auto"
                  aria-label={`Open ${topic.name}`}
                  onClick={() => onOpen(topic.id)}
                >
                  Open
                </Button>
              </Stack>
            </ListGroup.Item>
          ))}
      </ListGroup>
    </section>
  )
}
