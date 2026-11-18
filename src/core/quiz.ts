import { z } from 'zod'
import { conceptName, type Question, type TopicFile } from '@/content/schema'
import { choiceScore, quizScore } from './scoring'

// Bumped when the stored shape changes; records of another version are skipped, not migrated.
export const QUIZ_VERSION = 1

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
  concept: z.string(),
  concept_name: z.string(),
  type: z.enum(['single', 'multiple']),
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

export interface Candidate {
  topic: TopicFile['topic']
  question: Question
}

export function candidates(topics: TopicFile[], types: QuestionType[]): Candidate[] {
  return topics.flatMap(({ topic, questions }) =>
    questions.filter((q) => types.includes(q.type)).map((question) => ({ topic, question })),
  )
}

export interface QuizSetup {
  topics: TopicFile[]
  types: QuestionType[]
  size: number
  minutes?: number
}

// The quiz copies what it shows, so it stays readable after its topics change.
export function startQuiz(
  id: string,
  { topics, types, size, minutes }: QuizSetup,
  now: number,
  random: () => number = Math.random,
): Quiz {
  const chosen = shuffle(candidates(topics, types), random).slice(0, size)
  if (chosen.length === 0) throw new Error('No questions of the chosen types in the chosen topics')
  return {
    version: QUIZ_VERSION,
    id,
    started_at: now,
    updated_at: now,
    deadline: minutes ? now + minutes * 60_000 : undefined,
    questions: chosen.map((c) => show(c, random)),
    picks: chosen.map(() => []),
    flagged: chosen.map(() => false),
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
    concept: question.concept,
    concept_name: conceptName(topic, question.concept),
    type: question.type,
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
