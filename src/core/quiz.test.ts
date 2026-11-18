import { describe, expect, it } from 'vitest'
import type { Question, TopicFile } from '@/content/schema'
import { candidates, choose, QuizSchema, startQuiz, submitQuiz, timeLeft, toggleFlag } from './quiz'

const question = (id: string, type: Question['type'], answers: number[]): Question => ({
  id,
  type,
  concept: 'c',
  wordings: [
    { text: `${id} first`, options: ['a', 'b', 'c', 'd'] },
    { text: `${id} second`, options: ['A', 'B', 'C', 'D'] },
  ],
  answers,
  explanation: 'Because',
  summary: id,
  source: 'user',
})

const topic = (id: string, questions: Question[]): TopicFile => ({
  topic: { id, name: id.toUpperCase(), concepts: [{ id: 'c', name: 'Concept', group: 'G' }] },
  problems: [],
  questions,
})

const topics = [
  topic('t1', [question('s1', 'single', [1]), question('m1', 'multiple', [0, 2])]),
  topic('t2', [question('s2', 'single', [3])]),
]

// Takes the given values in turn: for a shuffle, 0.99 keeps an item in place.
const sequence = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

const ID = '00000000-0000-4000-8000-000000000000'

describe('candidates', () => {
  it('takes the questions of the chosen types from every chosen topic', () => {
    const ids = (types: Question['type'][]) => candidates(topics, types).map((c) => c.question.id)
    expect(ids(['single'])).toEqual(['s1', 's2'])
    expect(ids(['single', 'multiple'])).toEqual(['s1', 'm1', 's2'])
  })
})

describe('startQuiz', () => {
  it('copies one wording per question, with its options shuffled and the answers following them', () => {
    const quiz = startQuiz(
      ID,
      { topics, types: ['multiple'], size: 10 },
      5,
      sequence(0.6, 0, 0.99, 0.99),
    )
    expect(QuizSchema.safeParse(quiz).success).toBe(true)
    // Wording 2 of 2; the shuffle swaps the first and last option: d b c a, so a and c move to 3 and 2.
    expect(quiz.questions).toEqual([
      {
        topic: 't1',
        topic_name: 'T1',
        question: 'm1',
        concept: 'c',
        concept_name: 'Concept',
        type: 'multiple',
        wording: 1,
        text: 'm1 second',
        options: ['D', 'B', 'C', 'A'],
        answers: [2, 3],
        explanation: 'Because',
      },
    ])
    expect(quiz).toMatchObject({ picks: [[]], flagged: [false], deadline: undefined })
  })

  it('takes at most the asked number of questions and sets a deadline from the minutes', () => {
    const quiz = startQuiz(ID, { topics, types: ['single', 'multiple'], size: 2, minutes: 10 }, 5)
    expect(quiz.questions).toHaveLength(2)
    expect(quiz.deadline).toBe(5 + 10 * 60_000)
    expect(timeLeft(quiz, 5 + 60_000)).toBe(9 * 60_000)
    expect(timeLeft(quiz, quiz.deadline! + 1)).toBe(0)
  })

  it('takes no answer or flag after the deadline, and is submitted at the deadline', () => {
    const quiz = startQuiz(ID, { topics, types: ['single'], size: 1, minutes: 1 }, 0)
    const deadline = quiz.deadline!
    expect(choose(quiz, 0, 0, deadline)).toBe(quiz)
    expect(toggleFlag(quiz, 0, deadline)).toBe(quiz)
    expect(submitQuiz(choose(quiz, 0, 0, deadline - 1), deadline * 5).result?.at).toBe(deadline)
  })

  it('refuses when nothing matches', () => {
    expect(() =>
      startQuiz(ID, { topics: [topic('t', [])], types: ['single'], size: 5 }, 0),
    ).toThrow()
  })
})

describe('answering and submitting', () => {
  const quiz = startQuiz(ID, { topics, types: ['single', 'multiple'], size: 3 }, 0, () => 0.99)
  const [single, multiple] = [
    quiz.questions.findIndex((q) => q.type === 'single'),
    quiz.questions.findIndex((q) => q.type === 'multiple'),
  ]

  it('replaces a single pick and toggles multiple picks', () => {
    let q = choose(choose(quiz, single, 0, 1), single, 2, 2)
    expect(q.picks[single]).toEqual([2])
    q = choose(choose(choose(q, multiple, 2, 3), multiple, 0, 4), multiple, 2, 5)
    expect(q.picks[multiple]).toEqual([0])
    expect(q.updated_at).toBe(5)
    expect(toggleFlag(q, single, 6).flagged[single]).toBe(true)
  })

  it('scores each question and the quiz, weighted by type, then changes no more', () => {
    let q = quiz
    for (const [i, shown] of q.questions.entries()) {
      for (const answer of shown.type === 'single' || i === multiple ? shown.answers : [])
        q = choose(q, i, answer, 1)
    }
    q = choose(q, single, (q.questions[single].answers[0] + 1) % 4, 2)
    const done = submitQuiz(q, 9)
    expect(QuizSchema.safeParse(done).success).toBe(true)
    expect(done.result?.at).toBe(9)
    expect(done.result?.scores[single]).toBe(0)
    expect(done.result?.scores[multiple]).toBe(100)
    // Weights: two single choices (one right) and one multiple choice: (0 + 100 + 2 × 100) / 4.
    expect(done.result?.score).toBe(75)
    expect(choose(done, single, 0, 10)).toBe(done)
    expect(toggleFlag(done, single, 10)).toBe(done)
    expect(submitQuiz(done, 10)).toBe(done)
  })
})
