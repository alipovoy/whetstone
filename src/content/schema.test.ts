import { describe, expect, it } from 'vitest'
import algorithms from './algorithms.json'
import { answerErrors, testNames, validateTopicFile, type Question } from './schema'

const clone = () => structuredClone(algorithms) as typeof algorithms

describe('built-in topic', () => {
  it('is valid', () => {
    const result = validateTopicFile(algorithms)
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('marks every item built-in', () => {
    const sources = [...algorithms.problems, ...algorithms.questions].map((i) => i.source)
    expect(new Set(sources)).toEqual(new Set(['built-in']))
  })
})

describe('answerErrors', () => {
  const question = (overrides: Partial<Question>): Question => ({
    ...(algorithms.questions[0] as Question),
    ...overrides,
  })

  it('accepts a valid question', () => {
    expect(answerErrors(question({}))).toEqual([])
  })

  it('needs the same options count in every wording and no repeated option', () => {
    expect(
      answerErrors(
        question({
          wordings: [
            { text: 'a', options: ['x', 'y', 'z'] },
            { text: 'b', options: ['x', 'x'] },
          ],
          answers: [0],
        }),
      ),
    ).toEqual(['every wording needs the same number of options', 'an option repeats'])
  })

  it('needs answers in range, unique, one for a single choice, and a wrong option', () => {
    const wordings = [{ text: 'a', options: ['x', 'y'] }]
    expect(answerErrors(question({ wordings, answers: [0, 0] }))).toEqual([
      'an answer repeats',
      'a single choice has exactly one answer',
    ])
    expect(answerErrors(question({ wordings, answers: [2] }))).toEqual([
      'an answer is not an option index (0 to 1)',
    ])
    expect(answerErrors(question({ type: 'multiple', wordings, answers: [0, 1] }))).toEqual([
      'at least one option must be wrong',
    ])
  })
})

describe('validateTopicFile', () => {
  it('reports shape errors with their path', () => {
    const file = clone()
    file.problems[0].hints = ['only one']
    expect(validateTopicFile(file)).toEqual({
      ok: false,
      errors: ['problems.0.hints: needs exactly three hints'],
    })
  })

  it('rejects an unknown concept and a repeated id', () => {
    const file = clone()
    const [first, second] = file.problems
    first.concepts = [first.concepts[0], 'nope']
    second.id = first.id
    const result = validateTopicFile(file)
    expect(result.ok ? [] : result.errors).toEqual([
      `${first.id}: concept "nope" is not in the topic`,
      `${first.id}: id repeats`,
    ])
  })

  it('requires visible tests to exist and one test to stay hidden', () => {
    const file = clone()
    const [first] = file.problems
    first.tests = 'def test_a():\n    pass\n'
    first.visible_tests = ['test_a', 'test_b']
    const result = validateTopicFile(file)
    expect(result.ok ? [] : result.errors).toEqual([
      `${first.id}: visible test "test_b" is not defined`,
      `${first.id}: every test is visible; at least one must be hidden`,
    ])
  })
})

describe('testNames', () => {
  it('finds top-level test functions only', () => {
    expect(
      testNames('def test_a():\n    def test_inner(): pass\ndef _check():\ndef test_b (x):'),
    ).toEqual(new Set(['test_a', 'test_b']))
  })
})
