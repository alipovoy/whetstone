import { describe, expect, it } from 'vitest'
import type { Problem } from '@/content/schema'
import { addProblems, checkErrors, newTopic, problemText, served, type TopicRecord } from './topics'

const problem: Problem = {
  id: 'p',
  concept: 'two-pointers',
  difficulty: 'Easy',
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

const topic: TopicRecord = {
  ...newTopic('t', 'Topic', 0),
  concepts: [{ id: 'two-pointers', name: 'Two pointers', group: 'Arrays' }],
  problems: [problem],
}

const authored = (change: object = {}) => ({
  ...JSON.parse(problemText(problem, topic.concepts)),
  ...change,
})
let n = 0
const nextId = () => `new-${++n}`

describe('served', () => {
  it('serves the problems that follow the content rules and counts the rest', () => {
    const broken = { ...problem, id: 'q', hints: [] }
    const orphan = { ...problem, id: 'r', concept: 'gone' }
    const { file, unreadable } = served({ ...topic, problems: [problem, broken, orphan] })
    expect(file.problems.map((p) => p.id)).toEqual(['p'])
    expect(file.topic).toEqual({ id: 't', name: 'Topic', concepts: topic.concepts })
    expect(unreadable).toBe(2)
  })
})

describe('addProblems', () => {
  it('writes the concept by name, without the fields the app assigns', () => {
    const text = JSON.parse(problemText(problem, topic.concepts))
    expect(text).toMatchObject({ concept: { name: 'Two pointers', group: 'Arrays' } })
    expect(text).not.toHaveProperty('id')
    expect(text).not.toHaveProperty('source')
  })

  it('adds problems with new ids, finding a concept by name or adding it once', () => {
    const added = addProblems(
      topic,
      [
        authored({ concept: { name: 'two POINTERS', group: 'x' }, id: 'p', source: 'built-in' }),
        authored({ concept: { name: 'Hash maps!', group: 'G' } }),
        authored({ concept: { name: 'hash maps!', group: 'G' } }),
      ],
      () => 'x',
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.problems.map((p) => [p.id, p.concept, p.source])).toEqual([
      ['x', 'two-pointers', 'user'],
      ['x', 'hash-maps', 'user'],
      ['x', 'hash-maps', 'user'],
    ])
    expect(added.record.problems).toHaveLength(4)
    expect(added.record.concepts.map((c) => c.id)).toEqual(['two-pointers', 'hash-maps'])
  })

  it('replaces a problem in place, keeping its id and source', () => {
    const other = { ...problem, id: 'q' }
    const added = addProblems(
      { ...topic, problems: [problem, other] },
      [authored({ summary: 'new' })],
      nextId,
      'p',
    )
    expect(added.ok && added.record.problems).toEqual([{ ...problem, summary: 'new' }, other])
  })

  it('adds nothing when any problem is invalid, and says which', () => {
    const added = addProblems(
      topic,
      [authored(), authored({ hints: ['one'] }), authored({ visible_tests: ['test_a', 'test_b'] })],
      nextId,
    )
    expect(added).toEqual({
      ok: false,
      errors: [
        { item: 2, title: 'T', errors: ['hints: needs exactly three hints'] },
        { item: 3, title: 'T', errors: ['every test is visible; at least one must be hidden'] },
      ],
    })
  })

  it('takes exactly one problem for an edit', () => {
    expect(addProblems(topic, [authored(), authored()], nextId, 'p').ok).toBe(false)
  })
})

describe('checkErrors', () => {
  const run = (...passed: boolean[]) => ({
    tests: passed.map((p, i) => ({ name: `test_${'ab'[i]}`, passed: p })),
  })

  it('accepts a reference that passes and a starter that fails', () => {
    expect(checkErrors(problem, run(true, true), run(true, false))).toEqual([])
    expect(checkErrors(problem, run(true, true), { tests: [], error: 'does not load' })).toEqual([])
  })

  it('reports a failing reference, a passing starter and tests that did not run', () => {
    expect(checkErrors(problem, run(true, false), run(true, true))).toEqual([
      'the reference solution fails test_b',
      'the starter code passes every test',
    ])
    expect(checkErrors(problem, { tests: [{ name: 'test_a', passed: true }] }, run(false))).toEqual(
      ['every test is visible; at least one must be hidden'],
    )
    expect(checkErrors(problem, { tests: [], error: 'Time limit exceeded' }, run(false))).toEqual([
      'the reference solution could not be checked: Time limit exceeded',
    ])
  })
})
