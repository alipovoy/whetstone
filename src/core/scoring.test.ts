import { describe, expect, it } from 'vitest'
import { choiceScore, codingScore, failureText, hintCap, quizScore } from './scoring'

describe('codingScore', () => {
  it.each([
    [10, 10, 100],
    [9, 10, 75],
    [8, 10, 75],
    [6, 10, 60],
    [5, 10, 50],
    [4, 10, 40],
    [1, 10, 10],
    [0, 10, 0],
    [2, 3, 67],
  ])('%i of %i tests passed scores %i', (passed, total, expected) => {
    expect(codingScore({ passed, total, loaded: true })).toBe(expected)
  })

  it('scores 0 when the code does not load or there are no tests', () => {
    expect(codingScore({ passed: 0, total: 5, loaded: false })).toBe(0)
    expect(codingScore({ passed: 0, total: 0, loaded: true })).toBe(0)
  })
})

describe('failureText', () => {
  const message =
    'AssertionError: expected 3\n  hidden_tests.py, line 4, in test_x\n    assert f() == 3'

  it('shows only the first line for a hidden test', () => {
    expect(failureText(message, true)).toBe('AssertionError: expected 3')
  })

  it('shows the whole message for a visible test', () => {
    expect(failureText(message, false)).toBe(message)
  })
})

describe('hintCap', () => {
  it.each([
    [0, 100],
    [1, 90],
    [2, 75],
    [3, 55],
  ])('%i hints cap the score at %i', (hints, cap) => {
    expect(hintCap(hints)).toBe(cap)
  })
})

describe('choiceScore', () => {
  it.each([
    [[1], [1], 4, 100],
    [[0], [1], 4, 0],
    [[], [1], 4, 0],
    [[0, 2], [0, 2], 4, 100],
    [[0], [0, 2], 4, 50],
    [[0, 1], [0, 2], 4, 0],
    [[0, 2, 1], [0, 2], 4, 50],
    [[0, 1, 2, 3], [0, 2], 4, 0],
  ])('picks %j of answers %j among %i options score %i', (picks, answers, options, expected) => {
    expect(choiceScore(picks, answers, options)).toBe(expected)
  })
})

describe('quizScore', () => {
  it('weighs a multiple choice twice a single choice', () => {
    expect(
      quizScore([
        { type: 'single', score: 100 },
        { type: 'multiple', score: 50 },
      ]),
    ).toBe(67)
  })
})
