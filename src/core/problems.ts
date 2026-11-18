import {
  conceptAreas,
  conceptNames,
  type Difficulty,
  type Problem,
  type Topic,
  type TopicFile,
} from '@/content/schema'
import { lastGraded, latestAttempt, type Attempt } from './attempt'

export const SOLVED_SCORE = 90

export const PROBLEM_STATUSES = ['new', 'in-progress', 'solved', 'needs-work'] as const
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number]

export interface ProblemFilter {
  search?: string
  topic?: string
  area?: string
  difficulty?: Difficulty
  status?: ProblemStatus
}

// What the filters read: the problems list and the history of graded attempts both have it.
export interface Filterable {
  topic: { id: string; name: string }
  title: string
  concepts: string[]
  areas: string[]
  difficulty: string
  status: ProblemStatus
}

export interface ProblemEntry extends Filterable {
  topic: Topic
  problem: Problem
  latest?: Attempt
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
        concepts: conceptNames(topic, problem.concepts),
        areas: conceptAreas(topic, problem.concepts),
        difficulty: problem.difficulty,
        latest,
        graded,
        status: problemStatus(latest, graded),
      }
    }),
  )
}

export function filterEntries<T extends Filterable>(entries: T[], filter: ProblemFilter): T[] {
  const words = (filter.search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter(
    (e) =>
      (!filter.topic || e.topic.id === filter.topic) &&
      (!filter.area || e.areas.includes(filter.area)) &&
      (!filter.difficulty || e.difficulty === filter.difficulty) &&
      (!filter.status || e.status === filter.status) &&
      words.every((w) => [e.title, ...e.concepts].join(' ').toLowerCase().includes(w)),
  )
}

// The same area name in two topics is one area. Only areas with entries count.
export function entryAreas(entries: Filterable[], topic?: string): string[] {
  return [...new Set(entries.filter((e) => !topic || e.topic.id === topic).flatMap((e) => e.areas))]
}

// A topic or area from an old address may be gone, or not go together, and a status may be one
// the list cannot have; each would hide every entry while its field reads "All", so it is dropped.
export function applicableFilter(
  filter: ProblemFilter,
  entries: Filterable[],
  statuses: readonly ProblemStatus[] = PROBLEM_STATUSES,
): ProblemFilter {
  const topic = entries.some((e) => e.topic.id === filter.topic) ? filter.topic : undefined
  const area =
    filter.area !== undefined && entryAreas(entries, topic).includes(filter.area)
      ? filter.area
      : undefined
  const status = statuses.find((s) => s === filter.status)
  return { ...filter, topic, area, status }
}
