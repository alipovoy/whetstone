import { z } from 'zod'
import { conceptName, type Difficulty, type Problem, type Topic } from '@/content/schema'
import { codingScore, hintCap } from './scoring'

// Bumped when the stored shape changes; records of another version are skipped, not migrated.
export const ATTEMPT_VERSION = 1

const MINUTE_MS = 60_000

export const TIME_LIMIT_MS: Record<Difficulty, number> = {
  Easy: 15 * MINUTE_MS,
  Medium: 30 * MINUTE_MS,
  Hard: 45 * MINUTE_MS,
}

// The stored shape is frozen per version and deliberately looser than the content rules, so a
// change to what can be served never makes saved work unreadable.
const time = z.number().int().min(0)
const score = z.number().int().min(0).max(100)

const AskedSchema = z.object({
  topic_name: z.string(),
  concept: z.string(),
  concept_name: z.string(),
  language: z.string(),
  difficulty: z.string(),
  wording: z.object({
    title: z.string(),
    statement: z.string(),
    examples: z.array(
      z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() }),
    ),
    constraints: z.array(z.string()),
  }),
  tests: z.string(),
  visible_tests: z.array(z.string()),
  hints: z.array(z.string()),
})

const GradedTestSchema = z.object({
  name: z.string(),
  doc: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  stdout: z.string(),
})

const GradeSchema = z.object({
  at: time,
  asked: AskedSchema,
  tests: z.array(GradedTestSchema),
  error: z.string().optional(),
  code_score: score,
  hint_cap: score,
  score,
})

export const AttemptSchema = z
  .object({
    version: z.literal(ATTEMPT_VERSION),
    id: z.uuid(),
    topic: z.string(),
    problem: z.string(),
    // Index of the wording shown, chosen when the attempt starts.
    wording: z.number().int().min(0),
    started_at: time,
    updated_at: time,
    code: z.string(),
    hints_used: z.number().int().min(0).max(3),
    elapsed_ms: time,
    limit_ms: time,
    grade: GradeSchema.optional(),
  })
  .superRefine((a, ctx) => {
    // Only rules that hold by construction: clock order is not checked, as clocks can step back.
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    const g = a.grade
    if (!g) return
    if (g.score !== Math.min(g.code_score, g.hint_cap)) issue('score is not the capped code score')
    if (g.asked.hints.length !== a.hints_used) issue('the hints copied differ from hints_used')
  })

export type Attempt = z.infer<typeof AttemptSchema>
export type Grade = z.infer<typeof GradeSchema>
export type GradedTest = z.infer<typeof GradedTestSchema>

export interface GradeInput {
  tests: GradedTest[]
  error?: string
  loaded: boolean
}

export function startAttempt(
  attemptId: string,
  topic: string,
  problem: Problem,
  code: string,
  now: number,
): Attempt {
  return {
    version: ATTEMPT_VERSION,
    id: attemptId,
    topic,
    problem: problem.id,
    wording: 0,
    started_at: now,
    updated_at: now,
    code,
    hints_used: 0,
    elapsed_ms: 0,
    limit_ms: TIME_LIMIT_MS[problem.difficulty],
  }
}

// A graded attempt is closed: changing it starts a new attempt from its code.
export function openAttempt(
  attempt: Attempt,
  problem: Problem,
  newId: string,
  now: number,
): Attempt {
  return attempt.grade ? startAttempt(newId, attempt.topic, problem, attempt.code, now) : attempt
}

export function gradeAttempt(
  attempt: Attempt,
  topic: Topic,
  problem: Problem,
  input: GradeInput,
  now: number,
): Attempt {
  const passed = input.tests.filter((t) => t.passed).length
  const code_score = codingScore({ passed, total: input.tests.length, loaded: input.loaded })
  const hint_cap = hintCap(attempt.hints_used)
  return {
    ...attempt,
    updated_at: now,
    grade: {
      at: now,
      asked: {
        topic_name: topic.name,
        concept: problem.concept,
        concept_name: conceptName(topic, problem.concept),
        language: problem.language,
        difficulty: problem.difficulty,
        wording: problem.wordings[attempt.wording] ?? problem.wordings[0],
        tests: problem.tests,
        visible_tests: problem.visible_tests,
        hints: problem.hints.slice(0, attempt.hints_used),
      },
      tests: input.tests,
      error: input.error,
      code_score,
      hint_cap,
      score: Math.min(code_score, hint_cap),
    },
  }
}

export function remainingMs(attempt: Attempt): number {
  return attempt.limit_ms - attempt.elapsed_ms
}

export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function newest(attempts: Attempt[]): Attempt | undefined {
  return attempts.reduce<Attempt | undefined>(
    (best, a) => (!best || a.updated_at > best.updated_at ? a : best),
    undefined,
  )
}

// Problem ids are unique only within a topic.
export function latestAttempt(
  attempts: Attempt[],
  topic: string,
  problem: string,
): Attempt | undefined {
  return newest(attempts.filter((a) => a.topic === topic && a.problem === problem))
}

export function lastGraded(
  attempts: Attempt[],
  topic: string,
  problem: string,
): Attempt | undefined {
  return newest(attempts.filter((a) => a.topic === topic && a.problem === problem && a.grade))
}
