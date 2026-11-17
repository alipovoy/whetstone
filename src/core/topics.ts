import { z } from 'zod'
import {
  DraftProblemSchema,
  ProblemSchema,
  testErrors,
  type Concept,
  type Problem,
  type TopicFile,
} from '@/content/schema'

// Bumped when the stored shape changes; records of another version are skipped, not migrated.
export const TOPIC_VERSION = 1

const time = z.number().int().min(0)

// A draft is kept as text, so it can be saved while its JSON is still being fixed.
const DraftSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  source: z.enum(['user', 'ai']),
  // Id of the served problem this draft would replace once approved.
  replaces: z.string().optional(),
})

// Problems are read loosely and checked when served, so a change to the content rules hides a
// problem instead of making the whole topic unreadable.
export const TopicRecordSchema = z.object({
  version: z.literal(TOPIC_VERSION),
  id: z.string().min(1),
  name: z.string(),
  enabled: z.boolean(),
  created_at: time,
  updated_at: time,
  concepts: z.array(z.object({ id: z.string(), name: z.string(), group: z.string() })),
  problems: z.array(z.looseObject({ id: z.string() })),
  drafts: z.array(DraftSchema),
})

export type TopicRecord = z.infer<typeof TopicRecordSchema>
export type Draft = z.infer<typeof DraftSchema>

export function newTopic(id: string, name: string, now: number): TopicRecord {
  return {
    version: TOPIC_VERSION,
    id,
    name,
    enabled: true,
    created_at: now,
    updated_at: now,
    concepts: [],
    problems: [],
    drafts: [],
  }
}

export function topicFromFile({ topic, problems }: TopicFile, now: number): TopicRecord {
  return { ...newTopic(topic.id, topic.name, now), concepts: topic.concepts, problems }
}

export interface Served {
  file: TopicFile
  unreadable: number
}

export function served(record: TopicRecord): Served {
  const concepts = new Set(record.concepts.map((c) => c.id))
  const problems: Problem[] = []
  for (const raw of record.problems) {
    const parsed = ProblemSchema.safeParse(raw)
    if (parsed.success && concepts.has(parsed.data.concept) && !testErrors(parsed.data).length) {
      problems.push(parsed.data)
    }
  }
  return {
    file: { topic: { id: record.id, name: record.name, concepts: record.concepts }, problems },
    unreadable: record.problems.length - problems.length,
  }
}

export function draftText(problem: Problem, concepts: Concept[]): string {
  const { id: _id, source: _source, concept, ...rest } = problem
  const named = concepts.find((c) => c.id === concept)
  return JSON.stringify(
    { concept: { name: named?.name ?? concept, group: named?.group ?? '' }, ...rest },
    null,
    2,
  )
}

export function addDrafts(record: TopicRecord, drafts: Draft[]): TopicRecord {
  return { ...record, drafts: [...record.drafts, ...drafts] }
}

export function editDraft(record: TopicRecord, id: string, text: string): TopicRecord {
  return { ...record, drafts: record.drafts.map((d) => (d.id === id ? { ...d, text } : d)) }
}

export function rejectDraft(record: TopicRecord, id: string): TopicRecord {
  return { ...record, drafts: record.drafts.filter((d) => d.id !== id) }
}

export function deleteProblem(record: TopicRecord, id: string): TopicRecord {
  return { ...record, problems: record.problems.filter((p) => p.id !== id) }
}

export type Reading =
  { ok: true; problem: Problem; concept?: Concept } | { ok: false; errors: string[] }

// Turns a draft into the problem it would serve; `newId` is used unless it replaces a problem.
export function readDraft(record: TopicRecord, draft: Draft, newId: string): Reading {
  let json: unknown
  try {
    json = JSON.parse(draft.text)
  } catch (error) {
    return { ok: false, errors: [`not valid JSON: ${(error as Error).message}`] }
  }
  const parsed = DraftProblemSchema.safeParse(json)
  if (!parsed.success) {
    return { ok: false, errors: issues(parsed.error) }
  }
  const errors = testErrors(parsed.data)
  if (errors.length) return { ok: false, errors }

  const { concept: named, ...rest } = parsed.data
  const key = named.name.trim().toLowerCase()
  const existing = record.concepts.find((c) => c.name.trim().toLowerCase() === key)
  const concept = existing ? undefined : { id: conceptId(named.name, record.concepts), ...named }
  const replaced = record.problems.find((p) => p.id === draft.replaces)
  const problem = ProblemSchema.safeParse({
    ...rest,
    id: replaced?.id ?? newId,
    concept: (existing ?? concept)!.id,
    source: ProblemSchema.shape.source.safeParse(replaced?.source).data ?? draft.source,
  })
  if (!problem.success) return { ok: false, errors: issues(problem.error) }
  return { ok: true, problem: problem.data, concept }
}

function issues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'problem'}: ${issue.message}`)
}

function conceptId(name: string, concepts: Concept[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'concept'
  const taken = new Set(concepts.map((c) => c.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

export function approveDraft(
  record: TopicRecord,
  draftId: string,
  { problem, concept }: { problem: Problem; concept?: Concept },
): TopicRecord {
  const replaced = record.problems.some((p) => p.id === problem.id)
  return {
    ...record,
    concepts: concept ? [...record.concepts, concept] : record.concepts,
    problems: replaced
      ? record.problems.map((p) => (p.id === problem.id ? problem : p))
      : [...record.problems, problem],
    drafts: record.drafts.filter((d) => d.id !== draftId),
  }
}

export interface CheckRun {
  tests: { name: string; passed: boolean }[]
  // Why the code or the tests could not run, or why the run was stopped.
  error?: string
}

// A problem is served only when its reference passes every test and its starter fails one.
export function checkErrors(problem: Problem, reference: CheckRun, starter: CheckRun): string[] {
  if (reference.error) return [`the reference solution could not be checked: ${reference.error}`]
  if (!reference.tests.length) return ['the tests define no test function']
  const errors = reference.tests
    .filter((t) => !t.passed)
    .map((t) => `the reference solution fails ${t.name}`)
  const ran = new Set(reference.tests.map((t) => t.name))
  for (const name of problem.visible_tests) {
    if (!ran.has(name)) errors.push(`visible test ${name} did not run`)
  }
  if ([...ran].every((name) => problem.visible_tests.includes(name))) {
    errors.push('every test is visible; at least one must be hidden')
  }
  if (!starter.error && starter.tests.every((t) => t.passed)) {
    errors.push('the starter code passes every test')
  }
  return errors
}

export const BLANK_DRAFT = JSON.stringify(
  {
    concept: { name: '', group: '' },
    difficulty: 'Easy',
    language: 'python',
    wordings: [{ title: '', statement: '', examples: [], constraints: [] }],
    starter_code: '',
    reference_solution: '',
    tests: 'from solution import *\n\n\ndef test_example():\n    """"""\n    assert False\n',
    visible_tests: ['test_example'],
    hints: ['', '', ''],
    summary: '',
  },
  null,
  2,
)

export function draftTitle(draft: Draft): string {
  try {
    const title = (JSON.parse(draft.text) as { wordings?: { title?: unknown }[] }).wordings?.[0]
      ?.title
    if (typeof title === 'string' && title.trim()) return title
  } catch {
    // An unreadable draft is still listed, under a placeholder title.
  }
  return 'Untitled draft'
}
