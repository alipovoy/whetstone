import {
  conceptNames,
  type Difficulty,
  type Problem,
  type QuestionType,
  type Source,
  type Topic,
  type TopicFile,
} from '@/content/schema'
import { lastGraded, latestAttempt, type Attempt } from './attempt'

export const SOLVED_SCORE = 90

export const PROBLEM_STATUSES = ['new', 'in-progress', 'solved', 'needs-work'] as const
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number]

export interface ItemFilter {
  search?: string
  topic?: string
  // Concepts are unchecked by name, so a new concept starts checked.
  offConcepts?: string[]
  difficulty?: Difficulty
  status?: ProblemStatus
  source?: Source
  type?: QuestionType
}

// What the filters read: the problems list, the history of graded attempts and the libraries have it.
export interface Filterable {
  topic: { id: string; name: string }
  title: string
  concepts: EntryConcept[]
  difficulty: string
  status?: ProblemStatus
  source?: Source
  type?: QuestionType
}

// A concept no longer in its topic has no area.
export interface EntryConcept {
  name: string
  area?: string
}

export interface ConceptGroup {
  area?: string
  names: string[]
}

export interface ProblemEntry extends Filterable {
  topic: Topic
  problem: Problem
  status: ProblemStatus
  graded?: Attempt
}

// An open attempt is the one to come back to, so it outranks an earlier grade.
export function problemStatus(latest?: Attempt, graded?: Attempt): ProblemStatus {
  if (latest && !latest.grade) return 'in-progress'
  if (!graded?.grade) return 'new'
  return graded.grade.score >= SOLVED_SCORE ? 'solved' : 'needs-work'
}

export function problemEntries(topics: TopicFile[], attempts: Attempt[]): ProblemEntry[] {
  return topics.flatMap(({ topic, problems }) =>
    problems.map((problem) => {
      const latest = latestAttempt(attempts, topic.id, problem.id)
      const graded = lastGraded(attempts, topic.id, problem.id)
      return {
        topic,
        problem,
        title: problem.wordings[0].title,
        concepts: entryConcepts(topic, problem.concepts, conceptNames(topic, problem.concepts)),
        difficulty: problem.difficulty,
        graded,
        status: problemStatus(latest, graded),
      }
    }),
  )
}

export function filterEntries<T extends Filterable>(entries: T[], filter: ItemFilter): T[] {
  const words = (filter.search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter(
    (e) =>
      (!filter.topic || e.topic.id === filter.topic) &&
      (!filter.offConcepts || e.concepts.some((c) => !filter.offConcepts?.includes(c.name))) &&
      (!filter.difficulty || e.difficulty === filter.difficulty) &&
      (!filter.status || e.status === filter.status) &&
      (!filter.source || e.source === filter.source) &&
      (!filter.type || e.type === filter.type) &&
      words.every((w) =>
        [e.title, ...e.concepts.map((c) => c.name)].join(' ').toLowerCase().includes(w),
      ),
  )
}

export function entryConcepts(topic: Topic | undefined, ids: string[], names: string[]) {
  return ids.map((id, i): EntryConcept => ({
    name: names[i],
    area: topic?.concepts.find((c) => c.id === id)?.group,
  }))
}

// The concepts the entries have, by name under their areas in order of first use. The same name in two
// topics is one concept, and the same area is one area.
export function conceptGroups(entries: Filterable[], topic?: string): ConceptGroup[] {
  const groups = new Map<string | undefined, Set<string>>()
  for (const entry of entries.filter((e) => !topic || e.topic.id === topic))
    for (const { name, area } of entry.concepts) {
      if (!groups.has(area)) groups.set(area, new Set())
      groups.get(area)?.add(name)
    }
  return [...groups].map(([area, names]) => ({
    area,
    names: [...names].toSorted((a, b) => a.localeCompare(b)),
  }))
}

// A topic from an old address may be gone, and a status, a source or a type may be one the list
// cannot have; each would hide every entry while its field reads "All", so it is dropped. Unchecked
// concepts are kept only while the topic offers them, so all checked always reads as no filter.
export function applicableFilter(
  filter: ItemFilter,
  entries: Filterable[],
  statuses: readonly ProblemStatus[] = PROBLEM_STATUSES,
): ItemFilter {
  const topic = entries.some((e) => e.topic.id === filter.topic) ? filter.topic : undefined
  const offered = new Set(conceptGroups(entries, topic).flatMap((g) => g.names))
  const off = [...new Set(filter.offConcepts)].filter((name) => offered.has(name))
  const status = statuses.find((s) => s === filter.status)
  const source = entries.some((e) => e.source && e.source === filter.source)
    ? filter.source
    : undefined
  const type = entries.some((e) => e.type && e.type === filter.type) ? filter.type : undefined
  return { ...filter, topic, offConcepts: off.length ? off : undefined, status, source, type }
}
