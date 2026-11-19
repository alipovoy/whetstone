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

export function served(record: TopicRecord): Served {
  const concepts = new Set(record.concepts.map((c) => c.id))
  const problems = servedItems(record.problems, readProblem, concepts)
  const questions = servedItems(record.questions, readQuestion, concepts)
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
      : { raw, title, ok: false, errors: added.errors[0].errors }
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

// A problem's title, or a question's summary, to name it in errors.
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

export type ConceptChange = { ok: true; record: TopicRecord } | { ok: false; error: string }

// Concepts are found by name when items are added, so two of the same name cannot be told apart.
function conceptChange(
  record: TopicRecord,
  name: string,
  area: string,
  change: (concept: { name: string; group: string }) => TopicRecord['concepts'],
  id?: string,
): ConceptChange {
  const concept = { name: name.trim(), group: area.trim() }
  if (!concept.name) return { ok: false, error: 'A concept needs a name.' }
  if (!concept.group) return { ok: false, error: 'A concept needs an area.' }
  if (record.concepts.some((c) => c.id !== id && conceptKey(c.name) === conceptKey(name)))
    return { ok: false, error: `The topic already has a concept named “${concept.name}”.` }
  return { ok: true, record: { ...record, concepts: change(concept) } }
}

export function addConcept(record: TopicRecord, name: string, area: string): ConceptChange {
  return conceptChange(record, name, area, (concept) => [
    ...record.concepts,
    { id: conceptId(concept.name, record.concepts), ...concept },
  ])
}

export function editConcept(
  record: TopicRecord,
  id: string,
  name: string,
  area: string,
): ConceptChange {
  const change = (concept: { name: string; group: string }) =>
    record.concepts.map((c) => (c.id === id ? { id, ...concept } : c))
  return conceptChange(record, name, area, change, id)
}

type Stored = TopicRecord['problems'][number]
const storedConcepts = (item: Stored): unknown[] =>
  Array.isArray(item.concepts) ? item.concepts : []

export interface ConceptUsage {
  // Items, served or not, that use the concept.
  problems: number
  questions: number
  // Of those, the items that have no other concept.
  only: { problems: number; questions: number }
}

export function conceptUsage(record: TopicRecord, id: string): ConceptUsage {
  const count = (items: Stored[], only: boolean) =>
    items.filter((item) => {
      const concepts = storedConcepts(item)
      return concepts.includes(id) && (!only || concepts.every((c) => c === id))
    }).length
  return {
    problems: count(record.problems, false),
    questions: count(record.questions, false),
    only: { problems: count(record.problems, true), questions: count(record.questions, true) },
  }
}

// Removes the concept from every item; an item left without concepts is deleted with it.
export function deleteConcept(record: TopicRecord, id: string): TopicRecord {
  const without = (items: Stored[]) =>
    items.flatMap((item) => {
      if (!storedConcepts(item).includes(id)) return [item]
      const concepts = storedConcepts(item).filter((c) => c !== id)
      return concepts.length ? [{ ...item, concepts }] : []
    })
  return {
    ...record,
    concepts: record.concepts.filter((c) => c.id !== id),
    problems: without(record.problems),
    questions: without(record.questions),
  }
}
