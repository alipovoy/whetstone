import { describe, expect, it } from 'vitest'
import type { Difficulty, TopicFile } from '@/content/schema'
import { gradeAttempt, startAttempt, type Attempt } from './attempt'
import {
  applicableFilter,
  conceptGroups,
  filterEntries,
  problemEntries,
  problemStatus,
} from './problems'

const problem = (id: string, concept: string, difficulty: Difficulty, title: string) => ({
  id,
  concepts: [concept],
  difficulty,
  language: 'python' as const,
  wordings: [{ title, statement: 's', examples: [], constraints: [] }],
  starter_code: 'x',
  reference_solution: 'x',
  tests: 'def test_a():\n    pass\n',
  visible_tests: ['test_a'],
  hints: ['1', '2', '3'],
  summary: 's',
  source: 'built-in' as const,
})

const files: TopicFile[] = [
  {
    topic: {
      id: 'algo',
      name: 'Algorithms',
      concepts: [
        { id: 'stacks', name: 'Stacks', group: 'Linear' },
        { id: 'graphs', name: 'Graphs', group: 'Trees and graphs' },
        { id: 'unused', name: 'Unused', group: 'Questions only' },
      ],
    },
    problems: [
      problem('brackets', 'stacks', 'Easy', 'Balanced brackets'),
      problem('islands', 'graphs', 'Medium', 'Count the islands'),
    ],
    questions: [],
  },
  {
    topic: {
      id: 'str',
      name: 'Strings',
      concepts: [{ id: 'scan', name: 'Scanning', group: 'Linear' }],
    },
    problems: [problem('vowels', 'scan', 'Easy', 'Count vowels')],
    questions: [],
  },
]

const graded = (id: string, topic: string, p: string, passed: number, at: number): Attempt => {
  const file = files.find((f) => f.topic.id === topic)!
  const prob = file.problems.find((x) => x.id === p)!
  const tests = [true, true, true, true].map((_, i) => ({
    name: `test_${i}`,
    doc: '',
    passed: i < passed,
    stdout: '',
  }))
  return gradeAttempt(
    startAttempt(id, topic, prob, 'x', at),
    file.topic,
    prob,
    { tests, loaded: true },
    at,
  )
}
const open = (id: string, topic: string, p: string, at: number): Attempt => {
  const prob = files.flatMap((f) => f.problems).find((x) => x.id === p)!
  return startAttempt(id, topic, prob, 'x', at)
}

describe('problem status', () => {
  it('is New, Solved at 90 or more, Needs work below', () => {
    expect(problemStatus()).toBe('new')
    const solved = graded('a', 'algo', 'brackets', 4, 1)
    expect(problemStatus(solved, solved)).toBe('solved')
    const failing = graded('b', 'algo', 'brackets', 3, 1)
    expect(failing.grade?.score).toBe(75)
    expect(problemStatus(failing, failing)).toBe('needs-work')
  })

  it('is In progress while the latest attempt is open, even after a grade', () => {
    const solved = graded('a', 'algo', 'brackets', 4, 1)
    expect(problemStatus(open('b', 'algo', 'brackets', 2), solved)).toBe('in-progress')
  })
})

describe('problem list', () => {
  const attempts = [
    graded('a', 'algo', 'brackets', 4, 1),
    graded('b', 'algo', 'islands', 1, 1),
    open('c', 'algo', 'islands', 2),
  ]
  const entries = problemEntries(files, attempts)
  const titles = (filter: Parameters<typeof filterEntries>[1]) =>
    filterEntries(entries, filter).map((e) => e.title)

  it('lists every problem in topic order with its concepts, their areas and status', () => {
    expect(entries.map((e) => [e.title, e.concepts, e.status])).toEqual([
      ['Balanced brackets', [{ name: 'Stacks', area: 'Linear' }], 'solved'],
      ['Count the islands', [{ name: 'Graphs', area: 'Trees and graphs' }], 'in-progress'],
      ['Count vowels', [{ name: 'Scanning', area: 'Linear' }], 'new'],
    ])
    expect(entries[1].graded?.grade?.score).toBe(25)
  })

  it('filters by every field together', () => {
    expect(titles({})).toHaveLength(3)
    expect(titles({ topic: 'str' })).toEqual(['Count vowels'])
    expect(titles({ offConcepts: ['Graphs'] })).toEqual(['Balanced brackets', 'Count vowels'])
    expect(titles({ offConcepts: ['Graphs'], topic: 'algo' })).toEqual(['Balanced brackets'])
    expect(titles({ offConcepts: ['Stacks', 'Graphs', 'Scanning'] })).toEqual([])
    expect(titles({ difficulty: 'Medium' })).toEqual(['Count the islands'])
    expect(titles({ status: 'new' })).toEqual(['Count vowels'])
    expect(titles({ status: 'solved', difficulty: 'Medium' })).toEqual([])
  })

  it('searches the title and the concept, every word, in any case', () => {
    expect(titles({ search: 'COUNT' })).toEqual(['Count the islands', 'Count vowels'])
    expect(titles({ search: 'count graphs' })).toEqual(['Count the islands'])
    expect(titles({ search: '  stacks  ' })).toEqual(['Balanced brackets'])
    expect(titles({ search: 'Algorithms' })).toEqual([])
  })

  it('keeps a problem of several concepts while any of them is checked', () => {
    const [algo] = files
    const both = {
      ...problem('paths', 'graphs', 'Hard', 'Shortest path'),
      concepts: ['graphs', 'stacks'],
    }
    const [entry] = problemEntries([{ ...algo, problems: [both] }], [])
    expect(entry.concepts).toEqual([
      { name: 'Graphs', area: 'Trees and graphs' },
      { name: 'Stacks', area: 'Linear' },
    ])
    for (const filter of [{ offConcepts: ['Graphs'] }, { offConcepts: ['Stacks'] }])
      expect(filterEntries([entry], filter)).toEqual([entry])
    expect(filterEntries([entry], { offConcepts: ['Graphs', 'Stacks'] })).toEqual([])
    expect(filterEntries([entry], { search: 'stacks' })).toEqual([entry])
  })

  it('drops a topic that no problem has, and unchecked concepts the topic does not offer', () => {
    expect(
      applicableFilter({ topic: 'gone', offConcepts: ['Graphs', 'Gone'], status: 'new' }, entries),
    ).toEqual({ offConcepts: ['Graphs'], status: 'new' })
    expect(applicableFilter({ topic: 'str', offConcepts: ['Graphs'] }, entries)).toEqual({
      topic: 'str',
    })
    expect(applicableFilter({ offConcepts: ['Unused'] }, entries)).toEqual({})
  })

  it('offers the concepts that have problems, once each, under their areas', () => {
    expect(conceptGroups(entries)).toEqual([
      { area: 'Linear', names: ['Scanning', 'Stacks'] },
      { area: 'Trees and graphs', names: ['Graphs'] },
    ])
    expect(conceptGroups(entries, 'str')).toEqual([{ area: 'Linear', names: ['Scanning'] }])
  })
})
