import { z } from 'zod'

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must use lowercase letters, digits and hyphens only')
const text = z.string().refine((s) => s.trim().length > 0, 'must not be empty')

export const ConceptSchema = z.object({ id, name: text, group: text })

const TopicSchema = z.object({
  id,
  name: text,
  concepts: z.array(ConceptSchema).min(1, 'a topic needs at least one concept'),
})

const ExampleSchema = z.object({ input: text, output: text, explanation: text.optional() })

const WordingSchema = z.object({
  title: text,
  statement: text,
  examples: z.array(ExampleSchema),
  constraints: z.array(text),
})

export const MAX_CONCEPTS = 3

const conceptList = <T extends z.ZodType>(item: T, key: (c: z.infer<T>) => string) =>
  z
    .array(item)
    .min(1, 'needs at least one concept')
    .max(MAX_CONCEPTS, `has at most ${MAX_CONCEPTS} concepts`)
    .refine((list) => new Set(list.map(key)).size === list.length, 'a concept repeats')

const conceptIds = conceptList(id, (c) => c)
const namedConcepts = conceptList(ConceptSchema.omit({ id: true }), (c) =>
  c.name.trim().toLowerCase(),
)

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
export const DifficultySchema = z.enum(DIFFICULTIES)

export const ProblemSchema = z.object({
  id,
  concepts: conceptIds,
  difficulty: DifficultySchema,
  language: z.literal('python'),
  wordings: z.array(WordingSchema).min(1, 'needs at least one wording'),
  starter_code: text,
  reference_solution: text,
  tests: text,
  visible_tests: z.array(text).min(1, 'needs at least one visible test'),
  hints: z.array(text).length(3, 'needs exactly three hints'),
  summary: text,
  source: z.enum(['built-in', 'user', 'ai']),
})

// What a person or a chat writes: the app assigns id and source, and concepts are named, not referenced.
export const DraftProblemSchema = ProblemSchema.omit({ id: true, source: true }).extend({
  concepts: namedConcepts,
})

const QuestionWordingSchema = z.object({
  text,
  options: z.array(text).min(2, 'needs at least two options'),
})

export const QuestionSchema = z.object({
  id,
  type: z.enum(['single', 'multiple']),
  difficulty: DifficultySchema,
  concepts: conceptIds,
  wordings: z.array(QuestionWordingSchema).min(1, 'needs at least one wording'),
  // Indexes into the options; every wording lists its options in the same order.
  answers: z.array(z.number().int().min(0)).min(1, 'needs at least one answer'),
  explanation: text,
  summary: text,
  source: z.enum(['built-in', 'user', 'ai']),
})

export const DraftQuestionSchema = QuestionSchema.omit({ id: true, source: true }).extend({
  concepts: namedConcepts,
})

export const TopicFileSchema = z.object({
  topic: TopicSchema,
  problems: z.array(ProblemSchema),
  questions: z.array(QuestionSchema),
})

export type TopicFile = z.infer<typeof TopicFileSchema>
export type Topic = z.infer<typeof TopicSchema>
export type Concept = z.infer<typeof ConceptSchema>
export type Problem = z.infer<typeof ProblemSchema>
export type Wording = z.infer<typeof WordingSchema>
export type Question = z.infer<typeof QuestionSchema>
export type Difficulty = z.infer<typeof DifficultySchema>

// A concept missing from its topic is shown by its id.
export function conceptNames(topic: Topic, concepts: string[]): string[] {
  return concepts.map((key) => topic.concepts.find((c) => c.id === key)?.name ?? key)
}

export function conceptRefs(topic: Topic, concepts: string[]): { id: string; name: string }[] {
  const names = conceptNames(topic, concepts)
  return concepts.map((key, i) => ({ id: key, name: names[i] }))
}

// Areas are concept groups, each listed once; a concept missing from its topic has none.
export function conceptAreas(topic: Topic, concepts: string[]): string[] {
  const areas = concepts.flatMap((key) => topic.concepts.find((c) => c.id === key)?.group ?? [])
  return [...new Set(areas)]
}

export type Validation = { ok: true; file: TopicFile } | { ok: false; errors: string[] }

export function validateTopicFile(input: unknown): Validation {
  const parsed = TopicFileSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }
  const errors = crossChecks(parsed.data)
  return errors.length ? { ok: false, errors } : { ok: true, file: parsed.data }
}

function crossChecks({ topic, problems, questions }: TopicFile): string[] {
  const errors: string[] = []
  const concepts = new Set(topic.concepts.map((c) => c.id))
  if (concepts.size !== topic.concepts.length) errors.push('topic.concepts: a concept id repeats')
  const ids = new Set<string>()
  for (const p of problems) {
    if (ids.has(p.id)) errors.push(`${p.id}: id repeats`)
    ids.add(p.id)
    errors.push(...missingConcepts(p, concepts))
    errors.push(...testErrors(p).map((e) => `${p.id}: ${e}`))
  }
  for (const q of questions) {
    if (ids.has(q.id)) errors.push(`${q.id}: id repeats`)
    ids.add(q.id)
    errors.push(...missingConcepts(q, concepts))
    errors.push(...answerErrors(q).map((e) => `${q.id}: ${e}`))
  }
  return errors
}

function missingConcepts(item: Problem | Question, known: Set<string>): string[] {
  return item.concepts
    .filter((c) => !known.has(c))
    .map((c) => `${item.id}: concept "${c}" is not in the topic`)
}

export function answerErrors(q: Pick<Question, 'type' | 'wordings' | 'answers'>): string[] {
  const errors: string[] = []
  const count = q.wordings[0].options.length
  if (q.wordings.some((w) => w.options.length !== count)) {
    errors.push('every wording needs the same number of options')
  }
  if (q.wordings.some((w) => new Set(w.options).size !== w.options.length)) {
    errors.push('an option repeats')
  }
  if (new Set(q.answers).size !== q.answers.length) errors.push('an answer repeats')
  if (q.answers.some((a) => a >= count))
    errors.push(`an answer is not an option index (0 to ${count - 1})`)
  if (q.type === 'single' && q.answers.length !== 1)
    errors.push('a single choice has exactly one answer')
  // When every option is correct, picking all of them needs no knowledge.
  if (new Set(q.answers).size >= count) errors.push('at least one option must be wrong')
  return errors
}

export function testErrors(p: Pick<Problem, 'tests' | 'visible_tests'>): string[] {
  const errors: string[] = []
  const defined = testNames(p.tests)
  for (const name of p.visible_tests) {
    if (!defined.has(name)) errors.push(`visible test "${name}" is not defined`)
  }
  if ([...defined].every((name) => p.visible_tests.includes(name))) {
    errors.push('every test is visible; at least one must be hidden')
  }
  return errors
}

export function testNames(tests: string): Set<string> {
  return new Set([...tests.matchAll(/^def (test_\w+)\s*\(/gm)].map((m) => m[1]))
}
