import { describe, expect, it } from 'vitest'
import type { Problem, Topic } from '@/content/schema'
import { gradeAttempt, startAttempt } from './attempt'
import { historyEntries } from './history'
import { filterEntries } from './problems'

const topic: Topic = {
  id: 'algo',
  name: 'Algorithms',
  concepts: [{ id: 'stacks', name: 'Stacks', group: 'Linear' }],
}

const problem: Problem = {
  id: 'brackets',
  concept: 'stacks',
  difficulty: 'Easy',
  language: 'python',
  wordings: [{ title: 'Balanced brackets', statement: 's', examples: [], constraints: [] }],
  starter_code: 'x',
  reference_solution: 'x',
  tests: 'def test_a():\n    pass\n',
  visible_tests: ['test_a'],
  hints: ['1', '2', '3'],
  summary: 's',
  source: 'built-in',
}

const graded = (id: string, passed: boolean, at: number) =>
  gradeAttempt(
    startAttempt(id, topic.id, problem, 'x', at),
    topic,
    problem,
    { tests: [{ name: 'test_a', doc: '', passed, stdout: '' }], loaded: true },
    at,
  )

describe('historyEntries', () => {
  it('lists graded attempts newest first, solved at 90 or more', () => {
    const open = startAttempt('open', topic.id, problem, 'x', 9)
    const entries = historyEntries([topic], [graded('old', true, 1), open, graded('new', false, 5)])
    expect(entries.map((e) => [e.attempt.id, e.status, e.grade.score])).toEqual([
      ['new', 'needs-work', 0],
      ['old', 'solved', 100],
    ])
    expect(entries[0]).toMatchObject({
      topic: { id: 'algo', name: 'Algorithms' },
      title: 'Balanced brackets',
      concept: 'Stacks',
      area: 'Linear',
      difficulty: 'Easy',
    })
  })

  it('reads a deleted topic from the grade, without an area', () => {
    const [entry] = historyEntries([], [graded('a', true, 1)])
    expect(entry).toMatchObject({ topic: { id: 'algo', name: 'Algorithms' }, area: '' })
  })

  it('takes the problem filters', () => {
    const entries = historyEntries([topic], [graded('a', true, 1), graded('b', false, 2)])
    expect(filterEntries(entries, { status: 'solved', search: 'stacks' })).toEqual([entries[1]])
    expect(filterEntries(entries, { area: 'Linear', difficulty: 'Medium' })).toEqual([])
  })
})
