import { z } from 'zod'
import {
  answerErrors,
  DraftProblemSchema,
  DraftQuestionSchema,
  ProblemSchema,
  QuestionSchema,
  testErrors,
  type Concept,
  type Problem,
  type Question,
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
  // Records stored before questions existed have none.
  questions: z.array(z.looseObject({ id: z.string() })).default([]),
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
    questions: [],
  }
}

export function topicFromFile({ topic, problems, questions }: TopicFile, now: number): TopicRecord {
  return { ...newTopic(topic.id, topic.name, now), concepts: topic.concepts, problems, questions }
}

export interface Served {
  file: TopicFile
  unreadable: { problems: number; questions: number }
}

const known = (item: { concepts: string[] }, concepts: Set<string>) =>
  item.concepts.every((c) => concepts.has(c))

export function served(record: TopicRecord): Served {
  const concepts = new Set(record.concepts.map((c) => c.id))
  const problems: Problem[] = []
  for (const raw of record.problems) {
    const parsed = ProblemSchema.safeParse(raw)
    if (parsed.success && known(parsed.data, concepts) && !testErrors(parsed.data).length) {
      problems.push(parsed.data)
    }
  }
  const questions: Question[] = []
  for (const raw of record.questions) {
    const parsed = QuestionSchema.safeParse(raw)
    if (parsed.success && known(parsed.data, concepts) && !answerErrors(parsed.data).length) {
      questions.push(parsed.data)
    }
  }
  return {
    file: {
      topic: { id: record.id, name: record.name, concepts: record.concepts },
      problems,
      questions,
    },
    unreadable: {
      problems: record.problems.length - problems.length,
      questions: record.questions.length - questions.length,
    },
  }
}

// The authoring shape: without the fields the app assigns, with the concepts named.
export function itemText(item: Problem | Question, concepts: Concept[]): string {
  const { id: _id, source: _source, concepts: ids, ...rest } = item
  const named = ids.map((id) => {
    const concept = concepts.find((c) => c.id === id)
    return { name: concept?.name ?? id, group: concept?.group ?? '' }
  })
  return JSON.stringify({ concepts: named, ...rest }, null, 2)
}

export type ItemList = 'problems' | 'questions'

export function deleteItem(record: TopicRecord, list: ItemList, id: string): TopicRecord {
  return { ...record, [list]: record[list].filter((item) => item.id !== id) }
}

export interface ItemErrors {
  item: number
  title?: string
  errors: string[]
}

export type Adding<T> =
  { ok: true; record: TopicRecord; added: T[] } | { ok: false; errors: ItemErrors[] }

// Reads problems written by a person or a chat into the topic. The app assigns ids and source; a
// concept is found by name or added to the topic. With `replaces`, the single item replaces that problem.
export function addProblems(
  record: TopicRecord,
  items: unknown[],
  newId: () => string,
  replaces?: string,
): Adding<Problem> {
  return addItems(record, 'problems', items, newId, replaces, (raw, concepts, id, source) => {
    const parsed = DraftProblemSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, errors: issues(parsed.error) }
    const errors = testErrors(parsed.data)
    if (errors.length) return { ok: false, errors }
    return finish(ProblemSchema, parsed.data, concepts, id, source)
  })
}

export function addQuestions(
  record: TopicRecord,
  items: unknown[],
  newId: () => string,
  replaces?: string,
): Adding<Question> {
  return addItems(record, 'questions', items, newId, replaces, (raw, concepts, id, source) => {
    const parsed = DraftQuestionSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, errors: issues(parsed.error) }
    const errors = answerErrors(parsed.data)
    if (errors.length) return { ok: false, errors }
    return finish(QuestionSchema, parsed.data, concepts, id, source)
  })
}

type Reading<T> = { ok: true; item: T } | { ok: false; errors: string[] }
type Reader<T> = (raw: unknown, concepts: Concept[], id: string, source: unknown) => Reading<T>

function addItems<T extends { id: string }>(
  record: TopicRecord,
  list: ItemList,
  items: unknown[],
  newId: () => string,
  replaces: string | undefined,
  read: Reader<T>,
): Adding<T> {
  const noun = list === 'problems' ? 'problem' : 'question'
  if (replaces && items.length !== 1) {
    return { ok: false, errors: [{ item: 1, errors: [`an edit holds exactly one ${noun}`] }] }
  }
  const current = record[list]
  const replaced = current.find((item) => item.id === replaces)
  const concepts = [...record.concepts]
  const added: T[] = []
  const errors: ItemErrors[] = []
  items.forEach((raw, i) => {
    const reading = read(raw, concepts, replaced?.id ?? newId(), replaced?.source)
    if (reading.ok) added.push(reading.item)
    else errors.push({ item: i + 1, title: titleOf(raw), errors: reading.errors })
  })
  if (errors.length) return { ok: false, errors }
  const kept: { id: string }[] = current.filter((item) => item.id !== replaced?.id)
  kept.splice(replaced ? current.indexOf(replaced) : kept.length, 0, ...added)
  return { ok: true, record: { ...record, concepts, [list]: kept }, added }
}

// Adds the item's new concepts to `concepts`, then checks the item as it is stored.
function finish<T>(
  schema: z.ZodType<T>,
  { concepts: named, ...rest }: { concepts: { name: string; group: string }[] },
  concepts: Concept[],
  id: string,
  source: unknown,
): Reading<T> {
  const ids = named.map((name) => {
    const key = name.name.trim().toLowerCase()
    let concept = concepts.find((c) => c.name.trim().toLowerCase() === key)
    if (!concept) {
      concept = { id: conceptId(name.name, concepts), ...name }
      concepts.push(concept)
    }
    return concept.id
  })
  const item = schema.safeParse({
    ...rest,
    id,
    concepts: ids,
    source: SourceSchema.safeParse(source).data ?? 'user',
  })
  return item.success ? { ok: true, item: item.data } : { ok: false, errors: issues(item.error) }
}

const SourceSchema = ProblemSchema.shape.source

// A problem's title, or a question's summary, to name it in errors.
function titleOf(raw: unknown): string | undefined {
  const item = raw as { wordings?: { title?: unknown }[]; summary?: unknown } | null
  const title = item?.wordings?.[0]?.title ?? item?.summary
  return typeof title === 'string' && title.trim() ? title : undefined
}

function issues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'item'}: ${issue.message}`)
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
