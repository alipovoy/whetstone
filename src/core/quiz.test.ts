import { describe, expect, it } from 'vitest'
import type { Difficulty, Question, TopicFile } from '@/content/schema'
import {
  candidates,
  choose,
  drawQuestions,
  quizAreas,
  QuizSchema,
  quizReport,
  startQuiz,
  submitQuiz,
  timeLeft,
  timeLimit,
  toggleFlag,
  type QuizFilter,
} from './quiz'

const question = (
  id: string,
  type: Question['type'],
  answers: number[],
  difficulty: Difficulty = 'Easy',
  concept = 'c',
): Question => ({
  id,
  type,
  difficulty,
  concept,
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
  topic: {
    id,
    name: id.toUpperCase(),
    concepts: [
      { id: 'c', name: 'Concept', group: 'G' },
      { id: 'd', name: 'Other', group: 'H' },
    ],
  },
  problems: [],
  questions,
})

const topics = [
  topic('t1', [question('s1', 'single', [1]), question('m1', 'multiple', [0, 2], 'Hard')]),
  topic('t2', [question('s2', 'single', [3], 'Medium', 'd')]),
]

const everything: QuizFilter = {
  topics: ['t1', 't2'],
  offAreas: [],
  types: ['single', 'multiple'],
  difficulties: ['Easy', 'Medium', 'Hard'],
}
const setup = (filter: Partial<QuizFilter>, timed = false) => ({
  questions: candidates(topics, { ...everything, ...filter }),
  timed,
})

// Takes the given values in turn: for a shuffle, 0.99 keeps an item in place.
const sequence = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

const ID = '00000000-0000-4000-8000-000000000000'

describe('choosing questions', () => {
  const ids = (filter: Partial<QuizFilter>) =>
    candidates(topics, { ...everything, ...filter }).map((c) => c.question.id)

  it('takes the questions of the chosen topics, areas, types and difficulties', () => {
    expect(ids({})).toEqual(['s1', 'm1', 's2'])
    expect(ids({ topics: ['t2'] })).toEqual(['s2'])
    expect(ids({ types: ['single'] })).toEqual(['s1', 's2'])
    expect(ids({ offAreas: ['G'] })).toEqual(['s2'])
    expect(ids({ difficulties: ['Hard', 'Medium'] })).toEqual(['m1', 's2'])
    expect(ids({ topics: [] })).toEqual([])
  })

  it('offers the areas of the chosen topics', () => {
    expect(quizAreas(topics, ['t1'])).toEqual(['G'])
    expect(quizAreas(topics, ['t1', 't2'])).toEqual(['G', 'H'])
  })

  it('draws the same questions for a seed, and more of them as the count grows', () => {
    const list = candidates(topics, everything)
    const key = (n: number, seed: number) => drawQuestions(list, n, seed).map((c) => c.question.id)
    expect(key(2, 0.5)).toEqual(key(2, 0.5))
    expect(key(3, 0.5).slice(0, 2)).toEqual(key(2, 0.5))
    expect(key(2, 0.5).every((id) => key(3, 0.5).includes(id))).toBe(true)
    const seeds = new Set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((s) => key(3, s).join()))
    expect(seeds.size).toBeGreaterThan(1)
  })

  it('allows 1, 2 or 3 minutes per easy, medium or hard question', () => {
    expect(timeLimit(topics.flatMap((t) => t.questions))).toEqual({
      minutes: 6,
      counts: { Easy: 1, Medium: 1, Hard: 1 },
    })
    expect(timeLimit([]).minutes).toBe(0)
  })
})

describe('startQuiz', () => {
  it('copies one wording per question, with its options shuffled and the answers following them', () => {
    const quiz = startQuiz(ID, setup({ types: ['multiple'] }), 5, sequence(0.6, 0, 0.99, 0.99))
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
        difficulty: 'Hard',
        wording: 1,
        text: 'm1 second',
        options: ['D', 'B', 'C', 'A'],
        answers: [2, 3],
        explanation: 'Because',
      },
    ])
    expect(quiz).toMatchObject({ picks: [[]], flagged: [false], deadline: undefined })
  })

  it('sets the deadline from the difficulty of its questions when timed', () => {
    const quiz = startQuiz(ID, setup({}, true), 5)
    expect(quiz.questions).toHaveLength(3)
    expect(quiz.deadline).toBe(5 + 6 * 60_000)
    expect(timeLeft(quiz, 5 + 60_000)).toBe(5 * 60_000)
    expect(timeLeft(quiz, quiz.deadline! + 1)).toBe(0)
  })

  it('takes no answer or flag after the deadline, and is submitted at the deadline', () => {
    const quiz = startQuiz(ID, setup({ topics: ['t1'], types: ['single'] }, true), 0)
    const deadline = quiz.deadline!
    expect(choose(quiz, 0, 0, deadline)).toBe(quiz)
    expect(toggleFlag(quiz, 0, deadline)).toBe(quiz)
    expect(submitQuiz(choose(quiz, 0, 0, deadline - 1), deadline * 5).result?.at).toBe(deadline)
  })

  it('refuses when nothing matches', () => {
    expect(() => startQuiz(ID, setup({ topics: [] }), 0)).toThrow()
  })
})

describe('answering and submitting', () => {
  const quiz = startQuiz(ID, setup({}), 0, () => 0.99)
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

describe('quizReport', () => {
  it('counts the answers, the time used and the score of each concept, weakest first', () => {
    const t3 = topic('t3', [
      question('a', 'single', [0], 'Easy', 'c'),
      question('b', 'multiple', [0, 1], 'Easy', 'c'),
      question('d', 'single', [0], 'Easy', 'd'),
    ])
    let quiz = startQuiz(
      ID,
      { questions: candidates([t3], { ...everything, topics: ['t3'] }), timed: true },
      0,
      () => 0.99,
    )
    expect(quizReport(quiz)).toBeUndefined()
    const at = (id: string) => quiz.questions.findIndex((q) => q.question === id)
    const right = (id: string) => quiz.questions[at(id)].answers
    quiz = choose(quiz, at('a'), right('a')[0], 1)
    quiz = choose(quiz, at('b'), right('b')[0], 2)
    const report = quizReport(submitQuiz(quiz, 90_000))!
    expect(report).toMatchObject({
      correct: 1,
      partly: 1,
      wrong: 1,
      used_ms: 90_000,
      limit_ms: 180_000,
    })
    // Concept c: 100 for the single choice and 50 for the double-weighted multiple: (100 + 2 × 50) / 3.
    expect(report.concepts).toEqual([
      { topic_name: 'T3', concept_name: 'Other', questions: 1, score: 0 },
      { topic_name: 'T3', concept_name: 'Concept', questions: 2, score: 67 },
    ])
  })
})
