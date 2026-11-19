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

type Read<T> = { ok: true; item: T } | { ok: false; errors: string[] }
export type ItemReader<T> = (raw: unknown, concepts: Set<string>) => Read<T>

// A stored item is served only while it follows the current rules.
function reader<T extends { concepts: string[] }>(
  schema: z.ZodType<T>,
  checks: (item: T) => string[],
): ItemReader<T> {
  return (raw, concepts) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { ok: false, errors: issues(parsed.error) }
    const errors = [
      ...parsed.data.concepts
        .filter((c) => !concepts.has(c))
        .map((c) => `concepts: “${c}” is not a concept of the topic`),
      ...checks(parsed.data),
    ]
    return errors.length ? { ok: false, errors } : { ok: true, item: parsed.data }
  }
}

export const readProblem = reader(ProblemSchema, testErrors)
export const readQuestion = reader(QuestionSchema, answerErrors)

function servedItems<T>(items: unknown[], read: ItemReader<T>, concepts: Set<string>): T[] {
  return items.flatMap((raw) => {
    const reading = read(raw, concepts)
    return reading.ok ? [reading.item] : []
  })
}

// The topic as practised: only the items that follow the current rules.
export function served(record: TopicRecord): TopicFile {
  const concepts = new Set(record.concepts.map((c) => c.id))
  return {
    topic: { id: record.id, name: record.name, concepts: record.concepts },
    problems: servedItems(record.problems, readProblem, concepts),
    questions: servedItems(record.questions, readQuestion, concepts),
  }
}

// The authoring shape: without the fields the app assigns, with the concepts named. A stored item
// that breaks the rules keeps what it has, a concept the topic lacks named by its id.
export function itemText(item: Record<string, unknown>, concepts: Concept[]): string {
  const { id: _id, source: _source, concepts: ids, ...rest } = item
  const named = Array.isArray(ids)
    ? ids.map((id) => {
        const concept = concepts.find((c) => c.id === id)
        return { name: concept?.name ?? id, group: concept?.group ?? '' }
      })
    : ids
  return JSON.stringify({ concepts: named, ...rest }, null, 2)
}

export type ItemList = 'problems' | 'questions'

export function deleteItem(record: TopicRecord, list: ItemList, id: string): TopicRecord {
  return withoutUnused({ ...record, [list]: record[list].filter((item) => item.id !== id) })
}

export type Adding<T> =
  { ok: true; record: TopicRecord; added: T[] } | { ok: false; errors: string[] }

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

// Each item read on its own, for a list that adds the ones that pass. An item read comes with
// the topic's concepts as they would be after adding it.
export type Draft<T> = { raw: unknown; title?: string } & (
  { ok: true; item: T; concepts: Concept[] } | { ok: false; errors: string[] }
)

export type Adder<T> = (
  record: TopicRecord,
  items: unknown[],
  newId: () => string,
  replaces?: string,
) => Adding<T>

export function readDrafts<T>(
  record: TopicRecord,
  items: unknown[],
  newId: () => string,
  add: Adder<T>,
): Draft<T>[] {
  return items.map((raw) => {
    const title = titleOf(raw)
    const added = add(record, [raw], newId)
    return added.ok
      ? { raw, title, ok: true, item: added.added[0], concepts: added.record.concepts }
      : { raw, title, ok: false, errors: added.errors }
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

type Reader<T> = (raw: unknown, concepts: Concept[], id: string, source: unknown) => Read<T>

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
    return { ok: false, errors: [`an edit holds exactly one ${noun}`] }
  }
  const current = record[list]
  const replaced = current.find((item) => item.id === replaces)
  const concepts = [...record.concepts]
  const added: T[] = []
  const errors: string[] = []
  for (const raw of items) {
    const reading = read(raw, concepts, replaced?.id ?? newId(), replaced?.source)
    if (reading.ok) added.push(reading.item)
    else errors.push(...reading.errors)
  }
  if (errors.length) return { ok: false, errors }
  const kept: { id: string }[] = current.filter((item) => item.id !== replaced?.id)
  kept.splice(replaced ? current.indexOf(replaced) : kept.length, 0, ...added)
  return { ok: true, record: withoutUnused({ ...record, concepts, [list]: kept }), added }
}

const conceptKey = (name: string) => name.trim().toLowerCase()

// Adds the item's new concepts to `concepts`, then checks the item as it is stored.
function finish<T>(
  schema: z.ZodType<T>,
  { concepts: named, ...rest }: { concepts: { name: string; group: string }[] },
  concepts: Concept[],
  id: string,
  source: unknown,
): Read<T> {
  const ids = named.map((name) => {
    let concept = concepts.find((c) => conceptKey(c.name) === conceptKey(name.name))
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

// A problem's title, or a question's summary, to name it.
export function titleOf(raw: unknown): string | undefined {
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

// Areas keep the topic's order; the concepts of an area go A–Z.
export function conceptMap(concepts: Concept[]): { area: string; concepts: Concept[] }[] {
  const areas = new Map<string, Concept[]>()
  for (const concept of concepts)
    areas.set(concept.group, [...(areas.get(concept.group) ?? []), concept])
  return [...areas].map(([area, inArea]) => ({
    area,
    concepts: inArea.toSorted((a, b) => a.name.localeCompare(b.name)),
  }))
}

type Stored = TopicRecord['problems'][number]
const storedConcepts = (item: Stored): unknown[] =>
  Array.isArray(item.concepts) ? item.concepts : []

// Items, served or not, that use the concept.
export function conceptUsage(record: TopicRecord, id: string): Record<ItemList, number> {
  const count = (items: Stored[]) =>
    items.filter((item) => storedConcepts(item).includes(id)).length
  return { problems: count(record.problems), questions: count(record.questions) }
}

// A concept stays while an item, served or not, uses it.
function withoutUnused(record: TopicRecord): TopicRecord {
  const used = new Set([...record.problems, ...record.questions].flatMap(storedConcepts))
  return { ...record, concepts: record.concepts.filter((c) => used.has(c.id)) }
}
