import { z } from 'zod'

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must use lowercase letters, digits and hyphens only')
const text = z.string().refine((s) => s.trim().length > 0, 'must not be empty')

const ConceptSchema = z.object({ id, name: text, group: text })

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

const ProblemSchema = z.object({
  id,
  concept: id,
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
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

export const TopicFileSchema = z.object({
  topic: TopicSchema,
  problems: z.array(ProblemSchema),
})

export type TopicFile = z.infer<typeof TopicFileSchema>
export type Topic = z.infer<typeof TopicSchema>
export type Problem = z.infer<typeof ProblemSchema>
export type Wording = z.infer<typeof WordingSchema>

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

function crossChecks({ topic, problems }: TopicFile): string[] {
  const errors: string[] = []
  const concepts = new Set(topic.concepts.map((c) => c.id))
  if (concepts.size !== topic.concepts.length) errors.push('topic.concepts: a concept id repeats')
  const ids = new Set<string>()
  for (const p of problems) {
    if (ids.has(p.id)) errors.push(`${p.id}: id repeats`)
    ids.add(p.id)
    if (!concepts.has(p.concept)) errors.push(`${p.id}: concept "${p.concept}" is not in the topic`)
    const defined = testNames(p.tests)
    for (const name of p.visible_tests) {
      if (!defined.has(name)) errors.push(`${p.id}: visible test "${name}" is not defined`)
    }
    if ([...defined].every((name) => p.visible_tests.includes(name))) {
      errors.push(`${p.id}: every test is visible; at least one must be hidden`)
    }
  }
  return errors
}

export function testNames(tests: string): Set<string> {
  return new Set([...tests.matchAll(/^def (test_\w+)\s*\(/gm)].map((m) => m[1]))
}
