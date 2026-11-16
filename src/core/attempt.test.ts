import { describe, expect, it } from 'vitest'
import type { Problem, Topic } from '@/content/schema'
import {
  AttemptSchema,
  formatClock,
  gradeAttempt,
  lastGraded,
  latestAttempt,
  openAttempt,
  remainingMs,
  resumeProblem,
  startAttempt,
  type Attempt,
  type GradedTest,
} from './attempt'

const topic: Topic = {
  id: 't',
  name: 'Topic',
  concepts: [{ id: 'c', name: 'Concept', group: 'G' }],
}

const problem: Problem = {
  id: 'p',
  concept: 'c',
  difficulty: 'Medium',
  language: 'python',
  wordings: [{ title: 'T', statement: 'S', examples: [], constraints: [] }],
  starter_code: 'def f(): pass',
  reference_solution: 'def f(): return 1',
  tests: 'def test_a(): pass\ndef test_b(): pass',
  visible_tests: ['test_a'],
  hints: ['h1', 'h2', 'h3'],
  summary: 's',
  source: 'built-in',
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const test = (name: string, passed: boolean): GradedTest => ({ name, doc: '', passed, stdout: '' })
const allPass = { tests: [test('test_a', true), test('test_b', true)], loaded: true }

describe('startAttempt', () => {
  it('starts with the code given, no hints and the time limit of the difficulty', () => {
    const attempt = startAttempt(uuid(1), 't', problem, 'code', 1000)
    expect(attempt).toMatchObject({
      problem: 'p',
      code: 'code',
      hints_used: 0,
      elapsed_ms: 0,
      limit_ms: 30 * 60_000,
      started_at: 1000,
    })
    expect(AttemptSchema.safeParse(attempt).success).toBe(true)
  })
})

describe('gradeAttempt', () => {
  const start = startAttempt(uuid(1), 't', problem, 'code', 0)

  it('caps the score by the hints used and keeps a copy of what was asked', () => {
    const graded = gradeAttempt({ ...start, hints_used: 2 }, topic, problem, allPass, 5000)
    expect(graded.grade).toMatchObject({
      at: 5000,
      code_score: 100,
      hint_cap: 75,
      score: 75,
      asked: {
        topic_name: 'Topic',
        concept_name: 'Concept',
        tests: problem.tests,
        visible_tests: ['test_a'],
        hints: ['h1', 'h2'],
      },
    })
    expect(AttemptSchema.safeParse(graded).success).toBe(true)
  })

  it('keeps the lower code score under the cap', () => {
    const input = { tests: [test('test_a', true), test('test_b', false)], loaded: true }
    const graded = gradeAttempt({ ...start, hints_used: 1 }, topic, problem, input, 1)
    expect(graded.grade).toMatchObject({ code_score: 50, hint_cap: 90, score: 50 })
  })

  it('scores 0 when the code did not load', () => {
    const input = { tests: [], error: 'Timed out', loaded: false }
    expect(gradeAttempt(start, topic, problem, input, 1).grade).toMatchObject({
      score: 0,
      error: 'Timed out',
    })
  })
})

describe('openAttempt', () => {
  it('keeps an open attempt and replaces a graded one with a new attempt from its code', () => {
    const open = { ...startAttempt(uuid(1), 't', problem, 'code', 0), hints_used: 2 }
    expect(openAttempt(open, problem, uuid(2), 9)).toBe(open)
    const next = openAttempt(gradeAttempt(open, topic, problem, allPass, 5), problem, uuid(2), 9)
    expect(next).toMatchObject({ id: uuid(2), code: 'code', hints_used: 0, started_at: 9 })
    expect(next.grade).toBeUndefined()
  })
})

describe('AttemptSchema', () => {
  const graded = gradeAttempt(
    startAttempt(uuid(1), 't', problem, '', 0),
    topic,
    problem,
    allPass,
    5,
  )

  it.each([
    ['another version', { version: 2 }],
    ['an id that is not a UUID', { id: 'a1' }],
    ['a score that does not follow from its parts', { grade: { ...graded.grade!, score: 90 } }],
    ['hints copied that differ from hints used', { hints_used: 1 }],
    ['a grade after the last update', { updated_at: 4 }],
  ])('rejects %s', (_, change) => {
    expect(AttemptSchema.safeParse({ ...graded, ...change }).success).toBe(false)
  })

  it('reads a saved grade even after the content rules change', () => {
    const asked = { ...graded.grade!.asked, difficulty: 'Expert', concept: 'Not An Id' }
    expect(AttemptSchema.safeParse({ ...graded, grade: { ...graded.grade!, asked } }).success).toBe(
      true,
    )
  })
})

describe('time', () => {
  it('counts down and stops at zero', () => {
    const attempt = startAttempt(uuid(1), 't', problem, 'code', 0)
    expect(formatClock(remainingMs({ ...attempt, elapsed_ms: 61_500 }))).toBe('28:59')
    expect(formatClock(remainingMs({ ...attempt, elapsed_ms: 31 * 60_000 }))).toBe('0:00')
  })
})

describe('finding attempts', () => {
  const at = (n: number, topicId: string, problemId: string, updated: number, graded = false) => {
    const attempt = startAttempt(uuid(n), topicId, { ...problem, id: problemId }, '', 0)
    const result: Attempt = graded
      ? gradeAttempt(attempt, topic, problem, allPass, updated)
      : { ...attempt, updated_at: updated }
    return result
  }
  const attempts = [
    at(1, 't', 'p', 10, true),
    at(2, 't', 'p', 20),
    at(3, 't', 'q', 30, true),
    at(4, 't', 'r', 5),
    at(5, 'other', 'p', 40, true),
  ]

  it('finds the latest attempt and the last graded one of a problem in its topic', () => {
    expect(latestAttempt(attempts, 't', 'p')?.id).toBe(uuid(2))
    expect(lastGraded(attempts, 't', 'p')?.id).toBe(uuid(1))
    expect(lastGraded(attempts, 't', 'r')).toBeUndefined()
  })

  it('resumes the problem worked on last, among the problems offered', () => {
    expect(resumeProblem(attempts, 't', ['p', 'q', 'r'])).toBe('q')
    expect(resumeProblem(attempts, 't', ['p', 'r'])).toBe('p')
    expect(resumeProblem(attempts, 't', ['x'])).toBeUndefined()
  })
})
