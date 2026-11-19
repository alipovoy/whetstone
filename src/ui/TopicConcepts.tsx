import { ListGroup, Stack } from 'react-bootstrap'
import { conceptMap, conceptUsage, type ItemList, type TopicRecord } from '@/core/topics'
import { conceptGroups } from '@/core/problems'
import { problemLibrary, questionLibrary } from '@/core/library'
import { plural } from './format'
import { Link } from './Link'
import type { Route } from './route'

// A concept comes with the first item that names it and goes with the last one.
export function TopicConcepts({ topic }: { topic: TopicRecord }) {
  // A library lists every stored item, served or not, and filters by the concepts left
  // unchecked, including an id a broken item names that the topic lacks.
  const named: Record<ItemList, string[]> = {
    problems: conceptGroups(problemLibrary([topic])).flatMap((g) => g.names),
    questions: conceptGroups(questionLibrary([topic])).flatMap((g) => g.names),
  }
  const itemsOf = (list: ItemList, name: string): Route => ({
    page: 'library',
    list,
    filter: { topic: topic.id, offConcepts: named[list].filter((n) => n !== name) },
    disabled: !topic.enabled || undefined,
  })

  return (
    <section aria-label="Concepts">
      <h2 className="h5">Concepts</h2>
      {topic.concepts.length === 0 ? (
        <p className="text-body-secondary">
          None yet. Concepts join as you{' '}
          <Link to={{ page: 'add-items', list: 'problems', topic: topic.id }}>add problems</Link> or{' '}
          <Link to={{ page: 'add-items', list: 'questions', topic: topic.id }}>add questions</Link>.
        </p>
      ) : (
        conceptMap(topic.concepts).map(({ area, concepts }) => (
          <section key={area} aria-label={area} className="ws-concept-area">
            <h3 className="h6">{area}</h3>
            <ListGroup as="ul">
              {concepts.map((c) => {
                const used = conceptUsage(topic, c.id)
                return (
                  <ListGroup.Item as="li" key={c.id} aria-label={c.name}>
                    <Stack direction="horizontal" gap={2} className="flex-wrap">
                      <span>{c.name}</span>
                      <span className="text-body-secondary small ms-auto">
                        <Count
                          count={used.problems}
                          noun="problem"
                          name={c.name}
                          to={itemsOf('problems', c.name)}
                        />
                        ,{' '}
                        <Count
                          count={used.questions}
                          noun="question"
                          name={c.name}
                          to={itemsOf('questions', c.name)}
                        />
                      </span>
                    </Stack>
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

interface CountProps {
  count: number
  noun: string
  name: string
  to: Route
}

function Count({ count, noun, name, to }: CountProps) {
  const text = plural(count, noun)
  return count ? (
    <Link to={to} aria-label={`${text} of ${name}`}>
      {text}
    </Link>
  ) : (
    <span>{text}</span>
  )
}
