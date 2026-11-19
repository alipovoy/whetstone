import { useState } from 'react'
import { Button, Form, ListGroup, Stack } from 'react-bootstrap'
import { served, type TopicRecord } from '@/core/topics'
import { plural } from './format'
import { Link } from './Link'

interface Props {
  topics: TopicRecord[]
  onCreate: (name: string) => void
  onEnable: (id: string, enabled: boolean) => void
}

export function TopicsPage({ topics, onCreate, onEnable }: Props) {
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
          .map((topic) => {
            const { problems, questions } = served(topic).file
            return (
              <ListGroup.Item as="li" key={topic.id} aria-label={topic.name}>
                <Stack direction="horizontal" gap={3} className="flex-wrap">
                  <div>
                    <Link to={{ page: 'topic', id: topic.id }} className="fw-semibold">
                      {topic.name}
                    </Link>
                    <div className="text-body-secondary small">
                      {plural(topic.concepts.length, 'concept')},{' '}
                      {plural(problems.length, 'problem')}, {plural(questions.length, 'question')}
                    </div>
                  </div>
                  <Form.Check
                    type="switch"
                    role="switch"
                    id={`enabled-${topic.id}`}
                    label="Enabled"
                    className="ms-auto"
                    checked={topic.enabled}
                    onChange={(event) => onEnable(topic.id, event.target.checked)}
                  />
                </Stack>
              </ListGroup.Item>
            )
          })}
      </ListGroup>
    </section>
  )
}
