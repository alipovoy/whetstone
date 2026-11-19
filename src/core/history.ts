import type { Topic } from '@/content/schema'
import type { Attempt, Grade } from './attempt'
import { entryConcepts, problemStatus, type Filterable, type ProblemStatus } from './problems'

export const HISTORY_STATUSES = ['solved', 'needs-work'] as const

export interface HistoryEntry extends Filterable {
  attempt: Attempt
  grade: Grade
  status: ProblemStatus
}

// A grade keeps the problem as asked, so an attempt reads the same after its problem changes or
// goes. Only the topic's current name and the concepts' areas come from the topic, if it is kept.
export function historyEntries(topics: Topic[], attempts: Attempt[]): HistoryEntry[] {
  return attempts
    .flatMap((attempt) => {
      const { grade } = attempt
      if (!grade) return []
      const { asked } = grade
      const topic = topics.find((t) => t.id === attempt.topic)
      return [
        {
          attempt,
          grade,
          topic: { id: attempt.topic, name: topic?.name ?? asked.topic_name },
          title: asked.wording.title,
          concepts: entryConcepts(
            topic,
            asked.concepts.map((c) => c.id),
            asked.concepts.map((c) => c.name),
          ),
          difficulty: asked.difficulty,
          status: problemStatus(attempt, attempt),
        },
      ]
    })
    .toSorted((a, b) => b.grade.at - a.grade.at)
}
