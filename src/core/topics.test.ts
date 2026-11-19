import { describe, expect, it } from 'vitest'
import type { Problem, Question } from '@/content/schema'
import {
  addConcept,
  addProblems,
  addQuestions,
  checkErrors,
  conceptMap,
  conceptUsage,
  deleteConcept,
  deleteItem,
  editConcept,
  itemText,
  newTopic,
  readDrafts,
  served,
  TopicRecordSchema,
  type TopicRecord,
} from './topics'

const problem: Problem = {
  id: 'p',
  concepts: ['two-pointers'],
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

const question: Question = {
  id: 'q1',
  type: 'single',
  difficulty: 'Easy',
  concepts: ['two-pointers'],
  wordings: [{ text: 'Which?', options: ['a', 'b'] }],
  answers: [1],
  explanation: 'e',
  summary: 'Which one',
  source: 'built-in',
}

const topic: TopicRecord = {
  ...newTopic('t', 'Topic', 0),
  concepts: [{ id: 'two-pointers', name: 'Two pointers', group: 'Arrays' }],
  problems: [problem],
  questions: [question],
}

const authored = (change: object = {}) => ({
  ...JSON.parse(itemText(problem, topic.concepts)),
  ...change,
})
let n = 0
const nextId = () => `new-${++n}`

describe('served', () => {
  it('serves the problems that follow the content rules and counts the rest', () => {
    const broken = { ...problem, id: 'q', hints: [] }
    const orphan = { ...problem, id: 'r', concepts: ['gone'] }
    const { file, unreadable } = served({ ...topic, problems: [problem, broken, orphan] })
    expect(file.problems.map((p) => p.id)).toEqual(['p'])
    expect(file.topic).toEqual({ id: 't', name: 'Topic', concepts: topic.concepts })
    expect(unreadable).toEqual({ problems: 2, questions: 0 })
  })

  it('serves the questions that follow the content rules and counts the rest', () => {
    const wrong = { ...question, id: 'q2', answers: [5] }
    const { file, unreadable } = served({ ...topic, questions: [question, wrong] })
    expect(file.questions).toEqual([question])
    expect(unreadable).toEqual({ problems: 0, questions: 1 })
  })

  it('reads a topic stored before questions existed', () => {
    const { questions: _, ...old } = topic
    expect(TopicRecordSchema.parse(old).questions).toEqual([])
  })
})

describe('conceptMap', () => {
  it('groups concepts by area in topic order, A–Z inside', () => {
    const twoPointers = { id: 'two-pointers', name: 'Two pointers', group: 'Arrays' }
    const graphs = { id: 'graphs', name: 'Graphs', group: 'Trees' }
    const hashing = { id: 'hashing', name: 'Hashing', group: 'Arrays' }
    expect(conceptMap([twoPointers, graphs, hashing])).toEqual([
      { area: 'Arrays', concepts: [hashing, twoPointers] },
      { area: 'Trees', concepts: [graphs] },
    ])
  })
})

describe('concepts', () => {
  const concept = topic.concepts[0]

  it('adds a concept with a new id, trimmed, unless its name is taken', () => {
    const added = addConcept(topic, ' Two  pointers ', ' Arrays ')
    expect(added.ok && added.record.concepts[1]).toEqual({
      id: 'two-pointers-2',
      name: 'Two  pointers',
      group: 'Arrays',
    })
    expect(addConcept(topic, ' two POINTERS', 'X')).toEqual({
      ok: false,
      error: 'The topic already has a concept named “two POINTERS”.',
    })
    expect(addConcept(topic, ' ', 'X')).toEqual({ ok: false, error: 'A concept needs a name.' })
    expect(addConcept(topic, 'Y', ' ')).toEqual({ ok: false, error: 'A concept needs an area.' })
  })

  it('renames a concept and moves it to another area, keeping its id', () => {
    const edited = editConcept(topic, concept.id, 'TWO pointers', 'Lists')
    expect(edited.ok && edited.record.concepts).toEqual([
      { id: 'two-pointers', name: 'TWO pointers', group: 'Lists' },
    ])
    const other = { id: 'hashing', name: 'Hashing', group: 'Arrays' }
    const both = { ...topic, concepts: [concept, other] }
    expect(editConcept(both, 'hashing', 'two pointers', 'Arrays').ok).toBe(false)
  })

  it('counts the items that use a concept, served or not, and those it is the only one of', () => {
    const shared = { ...problem, id: 'b', concepts: ['two-pointers', 'hashing'] }
    const broken = { ...question, id: 'q2', answers: [5] }
    const record = { ...topic, problems: [problem, shared], questions: [question, broken] }
    expect(conceptUsage(record, concept.id)).toEqual({
      problems: 2,
      questions: 2,
      only: { problems: 1, questions: 2 },
    })
    expect(conceptUsage(record, 'hashing')).toEqual({
      problems: 1,
      questions: 0,
      only: { problems: 0, questions: 0 },
    })
  })

  it('deletes a concept from its items, and the items it was the only concept of', () => {
    const hashing = { id: 'hashing', name: 'Hashing', group: 'Arrays' }
    const shared = { ...problem, id: 'b', concepts: ['two-pointers', 'hashing'] }
    const record = { ...topic, concepts: [concept, hashing], problems: [problem, shared] }
    expect(deleteConcept(record, concept.id)).toEqual({
      ...record,
      concepts: [hashing],
      problems: [{ ...shared, concepts: ['hashing'] }],
      questions: [],
    })
  })
})

describe('addQuestions', () => {
  const authoredQuestion = (change: object = {}) => ({
    ...JSON.parse(itemText(question, topic.concepts)),
    ...change,
  })

  it('adds questions with new ids and the concept found by name', () => {
    const added = addQuestions(topic, [authoredQuestion({ summary: 'Another' })], () => 'x')
    expect(added.ok && added.record.questions).toEqual([
      question,
      { ...question, id: 'x', summary: 'Another', source: 'user' },
    ])
  })

  it('replaces a question in place and adds nothing when one is invalid', () => {
    const edited = addQuestions(topic, [authoredQuestion({ summary: 'new' })], nextId, 'q1')
    expect(edited.ok && edited.record.questions).toEqual([{ ...question, summary: 'new' }])
    expect(
      addQuestions(topic, [authoredQuestion(), authoredQuestion({ answers: [0, 1] })], nextId),
    ).toEqual({
      ok: false,
      errors: [
        {
          item: 2,
          title: 'Which one',
          errors: ['a single choice has exactly one answer', 'at least one option must be wrong'],
        },
      ],
    })
  })

  it('deletes a question', () => {
    expect(deleteItem(topic, 'questions', 'q1').questions).toEqual([])
  })
})

describe('addProblems', () => {
  it('writes the concept by name, without the fields the app assigns', () => {
    const text = JSON.parse(itemText(problem, topic.concepts))
    expect(text).toMatchObject({ concepts: [{ name: 'Two pointers', group: 'Arrays' }] })
    expect(text).not.toHaveProperty('id')
    expect(text).not.toHaveProperty('source')
  })

  it('writes a stored problem that breaks the rules as it is, an unknown concept by its id', () => {
    const text = JSON.parse(
      itemText({ id: 'p', concepts: ['two-pointers', 'gone'], hints: 1 }, topic.concepts),
    )
    expect(text).toEqual({
      concepts: [
        { name: 'Two pointers', group: 'Arrays' },
        { name: 'gone', group: '' },
      ],
      hints: 1,
    })
    expect(JSON.parse(itemText({ id: 'p', concepts: 'x' }, topic.concepts))).toEqual({
      concepts: 'x',
    })
  })

  it('adds problems with new ids, finding a concept by name or adding it once', () => {
    const added = addProblems(
      topic,
      [
        authored({ concepts: [{ name: 'two POINTERS', group: 'x' }], id: 'p', source: 'built-in' }),
        authored({ concepts: [{ name: 'Hash maps!', group: 'G' }] }),
        authored({
          concepts: [
            { name: 'hash maps!', group: 'G' },
            { name: 'Two pointers', group: 'x' },
          ],
        }),
      ],
      () => 'x',
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(added.added.map((p) => [p.id, p.concepts, p.source])).toEqual([
      ['x', ['two-pointers'], 'user'],
      ['x', ['hash-maps'], 'user'],
      ['x', ['hash-maps', 'two-pointers'], 'user'],
    ])
    expect(added.record.problems).toHaveLength(4)
    expect(added.record.concepts.map((c) => c.id)).toEqual(['two-pointers', 'hash-maps'])
  })

  it('rejects a problem without concepts, with too many or with one twice', () => {
    const concepts = (names: string[]) => names.map((name) => ({ name, group: 'G' }))
    const errors = (names: string[]) => {
      const added = addProblems(topic, [authored({ concepts: concepts(names) })], () => 'x')
      return added.ok ? [] : added.errors[0].errors
    }
    expect(errors([])).toEqual(['concepts: needs at least one concept'])
    expect(errors(['a', 'b', 'c', 'd'])).toEqual(['concepts: has at most 3 concepts'])
    expect(errors(['Stacks', ' stacks'])).toEqual(['concepts: a concept repeats'])
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

describe('readDrafts', () => {
  it('reads each problem on its own, with the concepts it would add', () => {
    const drafts = readDrafts(
      topic,
      [authored({ concepts: [{ name: 'Graphs', group: 'Trees' }] }), authored({ hints: [] })],
      () => 'x',
    )
    expect(drafts[0]).toMatchObject({
      ok: true,
      title: 'T',
      problem: { id: 'x', concepts: ['graphs'] },
    })
    expect(drafts[0].ok && drafts[0].concepts.map((c) => c.name)).toEqual([
      'Two pointers',
      'Graphs',
    ])
    expect(drafts[1]).toMatchObject({
      ok: false,
      title: 'T',
      errors: ['hints: needs exactly three hints'],
    })
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
