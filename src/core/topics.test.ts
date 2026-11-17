import { describe, expect, it } from 'vitest'
import type { Problem } from '@/content/schema'
import {
  approveDraft,
  checkErrors,
  draftText,
  newTopic,
  readDraft,
  served,
  type Draft,
  type TopicRecord,
} from './topics'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

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

const draft = (text: string, replaces?: string): Draft => ({
  id: uuid(1),
  text,
  source: 'ai',
  replaces,
})

const authored = (change: object = {}) =>
  JSON.stringify({ ...JSON.parse(draftText(problem, topic.concepts)), ...change })

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

describe('readDraft', () => {
  it('names the concept in the text and finds it again by name', () => {
    expect(JSON.parse(draftText(problem, topic.concepts))).toMatchObject({
      concept: { name: 'Two pointers', group: 'Arrays' },
    })
    expect(JSON.parse(draftText(problem, topic.concepts))).not.toHaveProperty('id')
    const read = readDraft(
      topic,
      draft(authored({ concept: { name: 'two POINTERS', group: 'x' } })),
      'new',
    )
    expect(read).toEqual({
      ok: true,
      problem: { ...problem, id: 'new', source: 'ai' },
      concept: undefined,
    })
  })

  it('adds an unknown concept with an id made from its name', () => {
    const read = readDraft(
      topic,
      draft(authored({ concept: { name: 'Two  pointers!', group: 'G' } })),
      'n',
    )
    expect(read).toMatchObject({
      ok: true,
      problem: { concept: 'two-pointers-2' },
      concept: { id: 'two-pointers-2', name: 'Two  pointers!', group: 'G' },
    })
  })

  it('keeps the id and source of the problem it replaces, whatever the text says', () => {
    const read = readDraft(topic, draft(authored({ id: 'other', source: 'user' }), 'p'), 'n')
    expect(read).toMatchObject({ ok: true, problem: { id: 'p', source: 'built-in' } })
  })

  it.each([
    ['broken JSON', '{', /not valid JSON/],
    ['a missing field', authored({ hints: ['one'] }), /hints: needs exactly three hints/],
    [
      'no hidden test',
      authored({ visible_tests: ['test_a', 'test_b'] }),
      /at least one must be hidden/,
    ],
  ])('rejects %s', (_, text, error) => {
    const read = readDraft(topic, draft(text), 'n')
    expect(read.ok).toBe(false)
    expect(read.ok ? [] : read.errors.join('\n')).toMatch(error)
  })
})

describe('approveDraft', () => {
  it('adds a new problem with its concept and drops the draft', () => {
    const concept = { id: 'c', name: 'C', group: 'G' }
    const next = approveDraft({ ...topic, drafts: [draft('')] }, uuid(1), {
      problem: { ...problem, id: 'q', concept: 'c' },
      concept,
    })
    expect(next.problems.map((p) => p.id)).toEqual(['p', 'q'])
    expect(next.concepts).toContainEqual(concept)
    expect(next.drafts).toEqual([])
  })

  it('replaces a problem in place', () => {
    const next = approveDraft(topic, uuid(1), { problem: { ...problem, summary: 'new' } })
    expect(next.problems).toEqual([{ ...problem, summary: 'new' }])
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
