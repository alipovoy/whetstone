import { z } from 'zod'
import {
  conceptAreas,
  DIFFICULTIES,
  DifficultySchema,
  type Difficulty,
  type Question,
  type TopicFile,
} from '@/content/schema'
import { named } from './attempt'
import { choiceScore, quizScore } from './scoring'

// Bumped when the stored shape changes; records of another version are skipped, not migrated.
export const QUIZ_VERSION = 2

export type QuestionType = Question['type']

// The stored shape is frozen per version and deliberately looser than the content rules, so a
// change to what can be served never makes a saved quiz unreadable.
const time = z.number().int().min(0)
const score = z.number().int().min(0).max(100)
const indexes = z.array(z.number().int().min(0))

// A question as it was shown: one wording, its options in the shown order, answers into them.
const ShownSchema = z.object({
  topic: z.string(),
  topic_name: z.string(),
  question: z.string(),
  concepts: z.array(z.object({ id: z.string(), name: z.string() })),
  type: z.enum(['single', 'multiple']),
  // Quizzes stored before questions had a difficulty lack it.
  difficulty: DifficultySchema.optional(),
  wording: z.number().int().min(0),
  text: z.string(),
  options: z.array(z.string()),
  answers: indexes,
  explanation: z.string(),
})

const ResultSchema = z.object({
  at: time,
  scores: z.array(score),
  score,
})

export const QuizSchema = z
  .object({
    version: z.literal(QUIZ_VERSION),
    id: z.uuid(),
    started_at: time,
    updated_at: time,
    // Wall clock: the quiz is submitted at this moment, whether or not it is on screen.
    deadline: time.optional(),
    questions: z.array(ShownSchema).min(1),
    picks: z.array(indexes),
    flagged: z.array(z.boolean()),
    result: ResultSchema.optional(),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    const n = q.questions.length
    if (q.picks.length !== n || q.flagged.length !== n) issue('picks or flags per question differ')
    if (q.result && q.result.scores.length !== n) issue('scores per question differ')
  })

export type Quiz = z.infer<typeof QuizSchema>
export type Shown = z.infer<typeof ShownSchema>

export const QUESTION_MINUTES: Record<Difficulty, number> = { Easy: 1, Medium: 2, Hard: 3 }

export interface QuizFilter {
  topics: string[]
  // Areas left out; a new area is in until it is switched off. A question stays in while any of
  // its areas is in.
  offAreas: string[]
  types: QuestionType[]
  difficulties: Difficulty[]
}

export interface Candidate {
  topic: TopicFile['topic']
  question: Question
  areas: string[]
}

function all(topics: TopicFile[], chosen: string[]): Candidate[] {
  return topics
    .filter((t) => chosen.includes(t.topic.id))
    .flatMap(({ topic, questions }) =>
      questions.map((question) => ({
        topic,
        question,
        areas: conceptAreas(topic, question.concepts),
      })),
    )
}

export function candidates(topics: TopicFile[], filter: QuizFilter): Candidate[] {
  return all(topics, filter.topics).filter(
    ({ question, areas }) =>
      areas.some((a) => !filter.offAreas.includes(a)) &&
      filter.types.includes(question.type) &&
      filter.difficulties.includes(question.difficulty),
  )
}

// The same area name in two topics is one area.
export function quizAreas(topics: TopicFile[], chosen: string[]): string[] {
  return [...new Set(all(topics, chosen).flatMap((c) => c.areas))]
}

// Each question has a fixed rank for a given seed, so the draw holds still while the count or
// the filters change, and the time limit shown before the start is the one the quiz gets.
export function drawQuestions(list: Candidate[], size: number, seed: number): Candidate[] {
  return list
    .map((c) => ({ c, rank: hash(`${seed}/${c.topic.id}/${c.question.id}`) }))
    .toSorted((a, b) => a.rank - b.rank)
    .slice(0, size)
    .map(({ c }) => c)
}

// FNV-1a: a quick, well-spread hash of a string.
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

export interface TimeLimit {
  minutes: number
  counts: Record<Difficulty, number>
}

export function timeLimit(questions: Pick<Question, 'difficulty'>[]): TimeLimit {
  const counts: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 }
  for (const q of questions) counts[q.difficulty]++
  const minutes = DIFFICULTIES.reduce((sum, d) => sum + counts[d] * QUESTION_MINUTES[d], 0)
  return { minutes, counts }
}

export interface QuizSetup {
  questions: Candidate[]
  timed: boolean
}

// The quiz copies what it shows, so it stays readable after its topics change.
export function startQuiz(
  id: string,
  { questions, timed }: QuizSetup,
  now: number,
  random: () => number = Math.random,
): Quiz {
  if (questions.length === 0) throw new Error('No questions match the chosen settings')
  const { minutes } = timeLimit(questions.map((c) => c.question))
  return {
    version: QUIZ_VERSION,
    id,
    started_at: now,
    updated_at: now,
    deadline: timed ? now + minutes * 60_000 : undefined,
    questions: questions.map((c) => show(c, random)),
    picks: questions.map(() => []),
    flagged: questions.map(() => false),
  }
}

function show({ topic, question }: Candidate, random: () => number): Shown {
  const index = Math.floor(random() * question.wordings.length)
  const wording = question.wordings[index]
  // order[shown index] = authored index
  const order = shuffle([...wording.options.keys()], random)
  return {
    topic: topic.id,
    topic_name: topic.name,
    question: question.id,
    concepts: named(topic, question.concepts),
    type: question.type,
    difficulty: question.difficulty,
    wording: index,
    text: wording.text,
    options: order.map((i) => wording.options[i]),
    answers: order.flatMap((authored, shown) =>
      question.answers.includes(authored) ? [shown] : [],
    ),
    explanation: question.explanation,
  }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const list = [...items]
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// Closed once submitted or past its deadline, even before the deadline submits it.
function closed(quiz: Quiz, now: number): boolean {
  return quiz.result !== undefined || (quiz.deadline !== undefined && now >= quiz.deadline)
}

// A single choice replaces the pick; a multiple choice toggles it.
export function choose(quiz: Quiz, index: number, option: number, now: number): Quiz {
  if (closed(quiz, now)) return quiz
  const current = quiz.picks[index]
  const next =
    quiz.questions[index].type === 'single'
      ? [option]
      : current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option].toSorted((a, b) => a - b)
  return { ...quiz, updated_at: now, picks: quiz.picks.with(index, next) }
}

export function toggleFlag(quiz: Quiz, index: number, now: number): Quiz {
  if (closed(quiz, now)) return quiz
  return { ...quiz, updated_at: now, flagged: quiz.flagged.with(index, !quiz.flagged[index]) }
}

// A quiz reopened after its deadline counts as submitted at the deadline.
export function submitQuiz(quiz: Quiz, now: number): Quiz {
  if (quiz.result) return quiz
  const at = Math.min(now, quiz.deadline ?? now)
  const scores = quiz.questions.map((q, i) =>
    choiceScore(quiz.picks[i], q.answers, q.options.length),
  )
  const total = quizScore(quiz.questions.map((q, i) => ({ type: q.type, score: scores[i] })))
  return { ...quiz, updated_at: now, result: { at, scores, score: total } }
}

export function timeLeft(quiz: Quiz, now: number): number | undefined {
  return quiz.deadline === undefined ? undefined : Math.max(0, quiz.deadline - now)
}

export interface ConceptScore {
  topic: string
  concept: string
  topic_name: string
  concept_name: string
  questions: number
  score: number
}

export interface QuizReport {
  correct: number
  partly: number
  wrong: number
  // Only for a timed quiz: an untimed one may have been left open for days.
  time?: { used_ms: number; limit_ms: number }
  concepts: ConceptScore[]
}

export type AnswerGrade = 'correct' | 'partly' | 'wrong'

export function answerGrade(points: number): AnswerGrade {
  return points === 100 ? 'correct' : points > 0 ? 'partly' : 'wrong'
}

type Scored = { type: QuestionType; score: number }

export function quizReport(quiz: Quiz): QuizReport | undefined {
  const { result } = quiz
  if (!result) return undefined
  // A question counts fully toward each of its concepts.
  const groups = new Map<string, Omit<ConceptScore, 'questions' | 'score'> & { scores: Scored[] }>()
  quiz.questions.forEach((shown, i) => {
    for (const concept of shown.concepts) {
      const key = `${shown.topic}/${concept.id}`
      const group = groups.get(key) ?? {
        topic: shown.topic,
        concept: concept.id,
        topic_name: shown.topic_name,
        concept_name: concept.name,
        scores: [],
      }
      group.scores.push({ type: shown.type, score: result.scores[i] })
      groups.set(key, group)
    }
  })
  const counts = { correct: 0, partly: 0, wrong: 0 }
  for (const points of result.scores) counts[answerGrade(points)]++
  return {
    ...counts,
    time:
      quiz.deadline === undefined
        ? undefined
        : { used_ms: result.at - quiz.started_at, limit_ms: quiz.deadline - quiz.started_at },
    concepts: [...groups.values()]
      .map(({ scores, ...concept }) => ({
        ...concept,
        questions: scores.length,
        score: quizScore(scores),
      }))
      .toSorted((a, b) => a.score - b.score),
  }
}
