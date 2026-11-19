import { describe, expect, it } from 'vitest'
import type { Problem } from '@/content/schema'
import { libraryEntries } from './library'
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

const record = (id: string, created: number, change: Partial<TopicRecord>): TopicRecord => ({
  ...newTopic(id, id.toUpperCase(), created),
  concepts: [{ id: 'stacks', name: 'Stacks', group: 'Linear' }],
  ...change,
})

describe('libraryEntries', () => {
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
  const entries = libraryEntries([later, first])

  it('lists every stored problem by topic age, the served ones with the problem', () => {
    expect(entries.map((e) => [e.topic.id, e.id, e.title, e.source, !!e.problem])).toEqual([
      ['a', 'p', 'Brackets', 'built-in', true],
      ['a', 'r', 'Brackets', 'built-in', false],
      ['a', 's', 'Untitled problem', undefined, false],
      ['b', 'q', 'Queue', 'user', false],
    ])
    expect(entries[0]).toMatchObject({
      topic: { id: 'a', name: 'A', enabled: true, concepts: first.concepts },
      concepts: [{ name: 'Stacks', area: 'Linear' }],
      difficulty: 'Easy',
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
