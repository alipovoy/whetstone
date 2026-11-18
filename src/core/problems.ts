import {
  conceptArea,
  conceptName,
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

export interface ProblemEntry {
  topic: Topic
  problem: Problem
  title: string
  concept: string
  area: string
  latest?: Attempt
  graded?: Attempt
  status: ProblemStatus
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
        concept: conceptName(topic, problem.concept),
        area: conceptArea(topic, problem.concept),
        latest,
        graded,
        status: problemStatus(latest, graded),
      }
    }),
  )
}

export function filterProblems(entries: ProblemEntry[], filter: ProblemFilter): ProblemEntry[] {
  const words = (filter.search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return entries.filter(
    (e) =>
      (!filter.topic || e.topic.id === filter.topic) &&
      (!filter.area || e.area === filter.area) &&
      (!filter.difficulty || e.problem.difficulty === filter.difficulty) &&
      (!filter.status || e.status === filter.status) &&
      words.every((w) => `${e.title} ${e.concept}`.toLowerCase().includes(w)),
  )
}

// The same area name in two topics is one area. Only areas with problems count.
export function problemAreas(entries: ProblemEntry[], topic?: string): string[] {
  return [...new Set(entries.filter((e) => !topic || e.topic.id === topic).map((e) => e.area))]
}

// A topic or area from an old address may be gone, or not go together; either would hide every
// problem while its field reads "All", so it is dropped.
export function applicableFilter(filter: ProblemFilter, entries: ProblemEntry[]): ProblemFilter {
  const topic = entries.some((e) => e.topic.id === filter.topic) ? filter.topic : undefined
  const area =
    filter.area !== undefined && problemAreas(entries, topic).includes(filter.area)
      ? filter.area
      : undefined
  return { ...filter, topic, area }
}
