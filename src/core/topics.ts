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
})

export type TopicRecord = z.infer<typeof TopicRecordSchema>

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

export function problemText(problem: Problem, concepts: Concept[]): string {
  const { id: _id, source: _source, concept, ...rest } = problem
  const named = concepts.find((c) => c.id === concept)
  return JSON.stringify(
    { concept: { name: named?.name ?? concept, group: named?.group ?? '' }, ...rest },
    null,
    2,
  )
}

export function deleteProblem(record: TopicRecord, id: string): TopicRecord {
  return { ...record, problems: record.problems.filter((p) => p.id !== id) }
}

export interface ItemErrors {
  item: number
  title?: string
  errors: string[]
}

export type Adding =
  { ok: true; record: TopicRecord; problems: Problem[] } | { ok: false; errors: ItemErrors[] }

// Reads problems written by a person or a chat into the topic. The app assigns ids and source; a
// concept is found by name or added. With `replaces`, the single item replaces that problem.
export function addProblems(
  record: TopicRecord,
  items: unknown[],
  newId: () => string,
  replaces?: string,
): Adding {
  if (replaces && items.length !== 1) {
    return { ok: false, errors: [{ item: 1, errors: ['an edit holds exactly one problem'] }] }
  }
  const replaced = record.problems.find((p) => p.id === replaces)
  const concepts = [...record.concepts]
  const problems: Problem[] = []
  const errors: ItemErrors[] = []
  items.forEach((raw, i) => {
    const title = titleOf(raw)
    const read = readProblem(raw, concepts, replaced?.id ?? newId(), replaced?.source)
    if (read.ok) problems.push(read.problem)
    else errors.push({ item: i + 1, title, errors: read.errors })
  })
  if (errors.length) return { ok: false, errors }
  const kept = record.problems.filter((p) => p.id !== replaced?.id)
  const at = replaced ? record.problems.indexOf(replaced) : kept.length
  kept.splice(at, 0, ...problems)
  return { ok: true, record: { ...record, concepts, problems: kept }, problems }
}

type Reading = { ok: true; problem: Problem } | { ok: false; errors: string[] }

// Adds the problem's concept to `concepts` when it is new.
function readProblem(raw: unknown, concepts: Concept[], id: string, source: unknown): Reading {
  const parsed = DraftProblemSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, errors: issues(parsed.error) }
  const errors = testErrors(parsed.data)
  if (errors.length) return { ok: false, errors }

  const { concept: named, ...rest } = parsed.data
  const key = named.name.trim().toLowerCase()
  let concept = concepts.find((c) => c.name.trim().toLowerCase() === key)
  if (!concept) {
    concept = { id: conceptId(named.name, concepts), ...named }
    concepts.push(concept)
  }
  const problem = ProblemSchema.safeParse({
    ...rest,
    id,
    concept: concept.id,
    source: ProblemSchema.shape.source.safeParse(source).data ?? 'user',
  })
  return problem.success
    ? { ok: true, problem: problem.data }
    : { ok: false, errors: issues(problem.error) }
}

function titleOf(raw: unknown): string | undefined {
  const title = (raw as { wordings?: { title?: unknown }[] } | null)?.wordings?.[0]?.title
  return typeof title === 'string' && title.trim() ? title : undefined
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
