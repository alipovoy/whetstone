import { describe, expect, it } from 'vitest'
import type { Problem, Question } from '@/content/schema'
import { problemLibrary, questionLibrary } from './library'
import { applicableFilter, filterEntries } from './problems'
import { newTopic, type TopicRecord } from './topics'

const problem: Problem = {
  id: 'p',
  concepts: ['stacks'],
  difficulty: 'Easy',
  language: 'python',
  wordings: [{ title: 'Brackets', statement: 'S', examples: [], constraints: [] }],
  starter_code: 'def f(): pass',
  reference_solution: 'def f(): return 1',
  tests: 'def test_a(): pass\ndef test_b(): pass',
  visible_tests: ['test_a'],
  hints: ['h1', 'h2', 'h3'],
  summary: 's',
  source: 'built-in',
}

const question: Question = {
  id: 'q',
  type: 'single',
  difficulty: 'Medium',
  concepts: ['stacks'],
  wordings: [{ text: 'Which?', options: ['a', 'b'] }],
  answers: [1],
  explanation: 'Because',
  summary: 'Stack order',
  source: 'user',
}

const record = (id: string, created: number, change: Partial<TopicRecord>): TopicRecord => ({
  ...newTopic(id, id.toUpperCase(), created),
  concepts: [{ id: 'stacks', name: 'Stacks', group: 'Linear' }],
  ...change,
})

describe('problemLibrary', () => {
  const later = record('b', 2, {
    enabled: false,
    problems: [{ ...problem, id: 'q', source: 'user', wordings: [{ title: 'Queue' }] }],
  })
  const first = record('a', 1, {
    problems: [
      problem,
      { ...problem, id: 'r', concepts: ['stacks', 'gone'] },
      { id: 's', concepts: 'stacks', source: 'robot' },
    ],
  })
  const entries = problemLibrary([later, first])

  it('lists every stored problem by topic age, the served ones with the problem', () => {
    expect(entries.map((e) => [e.topic.id, e.id, e.title, e.source, !!e.item])).toEqual([
      ['a', 'p', 'Brackets', 'built-in', true],
      ['a', 'r', 'Brackets', 'built-in', false],
      ['a', 's', 'Untitled problem', undefined, false],
      ['b', 'q', 'Queue', 'user', false],
    ])
    expect(entries[0]).toMatchObject({
      topic: { id: 'a', name: 'A', enabled: true, concepts: first.concepts },
      concepts: [{ name: 'Stacks', area: 'Linear' }],
      difficulty: 'Easy',
      type: undefined,
      errors: [],
    })
    expect(entries[3].topic.enabled).toBe(false)
  })

  it('gives the reasons a problem is not served, and what it can still read of it', () => {
    expect(entries[1].errors).toEqual(['concepts: “gone” is not a concept of the topic'])
    expect(entries[1].concepts).toEqual([{ name: 'Stacks', area: 'Linear' }, { name: 'gone' }])
    expect(entries[2].errors.length).toBeGreaterThan(1)
    expect(entries[2]).toMatchObject({ concepts: [], difficulty: '' })
    expect(entries[2].raw).toEqual({ id: 's', concepts: 'stacks', source: 'robot' })
  })

  it('filters by source, dropping a source no problem has', () => {
    expect(filterEntries(entries, { source: 'user' }).map((e) => e.id)).toEqual(['q'])
    expect(applicableFilter({ source: 'ai', status: 'new' }, entries, [])).toEqual({})
  })
})

describe('questionLibrary', () => {
  const entries = questionLibrary([
    record('a', 1, {
      problems: [problem],
      questions: [
        question,
        { ...question, id: 'm', type: 'multiple', answers: [0, 1], summary: 'All right' },
        { id: 'x', type: 'open', summary: ' ' },
      ],
    }),
  ])

  it('lists every stored question with its type, the served ones with the question', () => {
    expect(entries.map((e) => [e.id, e.title, e.type, e.difficulty, !!e.item])).toEqual([
      ['q', 'Stack order', 'single', 'Medium', true],
      ['m', 'All right', 'multiple', 'Medium', false],
      ['x', 'Untitled question', undefined, '', false],
    ])
    expect(entries[1].errors).toEqual(['at least one option must be wrong'])
  })

  it('filters by type, dropping a type no question has', () => {
    expect(filterEntries(entries, { type: 'multiple' }).map((e) => e.id)).toEqual(['m'])
    const singles = entries.filter((e) => e.type === 'single')
    expect(applicableFilter({ type: 'multiple' }, singles, [])).toEqual({})
  })
})
