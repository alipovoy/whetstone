import {
  conceptNames,
  QUESTION_TYPES,
  SOURCES,
  type Problem,
  type Question,
  type Topic,
} from '@/content/schema'
import { entryConcepts, type Filterable } from './problems'
import {
  readProblem,
  readQuestion,
  titleOf,
  type ItemList,
  type ItemReader,
  type TopicRecord,
} from './topics'

// A stored item, served or not: one that breaks the current rules has the reasons instead.
export interface LibraryEntry<T = Problem | Question> extends Filterable {
  topic: Topic & { enabled: boolean }
  id: string
  raw: TopicRecord[ItemList][number]
  item?: T
  errors: string[]
}

export const problemLibrary = (records: TopicRecord[]): LibraryEntry<Problem>[] =>
  libraryEntries(records, 'problems', readProblem)

export const questionLibrary = (records: TopicRecord[]): LibraryEntry<Question>[] =>
  libraryEntries(records, 'questions', readQuestion)

function libraryEntries<T extends Problem | Question>(
  records: TopicRecord[],
  list: ItemList,
  read: ItemReader<T>,
): LibraryEntry<T>[] {
  return records
    .toSorted((a, b) => a.created_at - b.created_at)
    .flatMap((record) => {
      const topic = { id: record.id, name: record.name, concepts: record.concepts }
      const known = new Set(record.concepts.map((c) => c.id))
      return record[list].map((raw): LibraryEntry<T> => {
        const reading = read(raw, known)
        const ids = reading.ok ? reading.item.concepts : strings(raw.concepts)
        return {
          topic: { ...topic, enabled: record.enabled },
          id: raw.id,
          raw,
          item: reading.ok ? reading.item : undefined,
          errors: reading.ok ? [] : reading.errors,
          title: titleOf(raw) ?? (list === 'problems' ? 'Untitled problem' : 'Untitled question'),
          concepts: entryConcepts(topic, ids, conceptNames(topic, ids)),
          difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : '',
          type: list === 'questions' ? QUESTION_TYPES.find((t) => t === raw.type) : undefined,
          source: SOURCES.find((s) => s === raw.source),
        }
      })
    })
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
