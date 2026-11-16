import { describe, expect, it } from 'vitest'
import algorithms from './algorithms.json'
import { testNames, validateTopicFile } from './schema'

const clone = () => structuredClone(algorithms) as typeof algorithms

describe('built-in topic', () => {
  it('is valid', () => {
    const result = validateTopicFile(algorithms)
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('is "Algorithms & data structures" with about 8 problems, all built-in', () => {
    expect(algorithms.topic.name).toBe('Algorithms & data structures')
    expect(algorithms.problems).toHaveLength(8)
    expect(new Set(algorithms.problems.map((p) => p.source))).toEqual(new Set(['built-in']))
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
    file.problems[0].concept = 'nope'
    file.problems[1].id = file.problems[0].id
    const result = validateTopicFile(file)
    expect(result.ok ? [] : result.errors).toEqual([
      'pair-with-sum: concept "nope" is not in the topic',
      'pair-with-sum: id repeats',
    ])
  })

  it('requires visible tests to exist and one test to stay hidden', () => {
    const file = clone()
    file.problems[0].tests = 'def test_a():\n    pass\n'
    file.problems[0].visible_tests = ['test_a', 'test_b']
    const result = validateTopicFile(file)
    expect(result.ok ? [] : result.errors).toEqual([
      'pair-with-sum: visible test "test_b" is not defined',
      'pair-with-sum: every test is visible; at least one must be hidden',
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
