import { conceptNames, SOURCES, type Problem, type Topic } from '@/content/schema'
import { entryConcepts, type Filterable } from './problems'
import { readProblem, titleOf, type TopicRecord } from './topics'

// A stored problem, served or not: one that breaks the current rules has the reasons instead.
export interface LibraryEntry extends Filterable {
  topic: Topic & { enabled: boolean }
  id: string
  raw: TopicRecord['problems'][number]
  problem?: Problem
  errors: string[]
}

export function libraryEntries(records: TopicRecord[]): LibraryEntry[] {
  return records
    .toSorted((a, b) => a.created_at - b.created_at)
    .flatMap((record) => {
      const topic = { id: record.id, name: record.name, concepts: record.concepts }
      const known = new Set(record.concepts.map((c) => c.id))
      return record.problems.map((raw): LibraryEntry => {
        const read = readProblem(raw, known)
        const ids = read.ok ? read.item.concepts : strings(raw.concepts)
        return {
          topic: { ...topic, enabled: record.enabled },
          id: raw.id,
          raw,
          problem: read.ok ? read.item : undefined,
          errors: read.ok ? [] : read.errors,
          title: titleOf(raw) ?? 'Untitled problem',
          concepts: entryConcepts(topic, ids, conceptNames(topic, ids)),
          difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : '',
          source: SOURCES.find((s) => s === raw.source),
        }
      })
    })
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
