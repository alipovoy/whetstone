import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from 'idb'
import type { z } from 'zod'
import { builtInTopic } from '@/content'
import { AttemptSchema, type Attempt } from '@/core/attempt'
import { QuizSchema, type Quiz } from '@/core/quiz'
import { topicFromFile, TopicRecordSchema, type TopicRecord } from '@/core/topics'

export const DATABASE_NAME = 'whetstone'
const DATABASE_VERSION = 6

interface Schema extends DBSchema {
  attempts: { key: string; value: unknown }
  topics: { key: string; value: unknown }
  quizzes: { key: string; value: unknown }
}

type StoreName = 'attempts' | 'topics' | 'quizzes'

interface Connection {
  db: IDBPDatabase<Schema>
  stopped: string | null
}

export interface Database {
  attempts: Records<Attempt>
  topics: Records<TopicRecord>
  quizzes: Records<Quiz>
}

export async function openDatabase(name = DATABASE_NAME): Promise<Database> {
  let connection: Connection | undefined
  const db = await openDB<Schema>(name, DATABASE_VERSION, {
    // Each database version adds its stores; later steps append a branch, never edit one.
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) database.createObjectStore('attempts', { keyPath: 'id' })
      if (oldVersion < 2) {
        // Seeded once, with the database: a built-in topic the user deleted stays deleted.
        const topics = database.createObjectStore('topics', { keyPath: 'id' })
        void topics.put(topicFromFile(builtInTopic, Date.now()))
      }
      // Changes to stored records run one after another, each reading what the last one wrote.
      // A failed change aborts the upgrade, so it runs again on the next open.
      let changes = Promise.resolve()
      const topics = () => transaction.objectStore('topics')
      if (oldVersion < 3) changes = changes.then(() => addBuiltInQuestions(topics()))
      if (oldVersion < 4) database.createObjectStore('quizzes', { keyPath: 'id' })
      if (oldVersion < 5) changes = changes.then(() => addQuestionDifficulty(topics()))
      if (oldVersion < 6) {
        changes = changes.then(() => listConcepts(topics()))
        // Saved work copies one concept per item; resetting it is allowed while the format settles.
        if (oldVersion >= 1) void transaction.objectStore('attempts').clear()
        if (oldVersion >= 4) void transaction.objectStore('quizzes').clear()
      }
      changes.catch(() => transaction.abort())
    },
    // A newer version of the app opened in another tab: let its upgrade through.
    blocking() {
      db.close()
      if (connection) connection.stopped = 'Whetstone was updated in another tab. Reload this page.'
    },
  })
  connection = { db, stopped: null }
  return {
    attempts: new Records(connection, 'attempts', AttemptSchema),
    topics: new Records(connection, 'topics', TopicRecordSchema),
    quizzes: new Records(connection, 'quizzes', QuizSchema),
  }
}

// The built-in topic stored before questions existed gets them once; a deleted one stays deleted.
async function addBuiltInQuestions(
  topics: IDBPObjectStore<Schema, StoreName[], 'topics', 'versionchange'>,
) {
  const stored = (await topics.get(builtInTopic.topic.id)) as
    { questions?: { id: string }[] } | undefined
  if (!stored) return
  const questions = stored.questions ?? []
  const have = new Set(questions.map((q) => q.id))
  const missing = builtInTopic.questions.filter((q) => !have.has(q.id))
  if (missing.length) await topics.put({ ...stored, questions: [...questions, ...missing] })
}

// Questions became graded by difficulty: built-in ones take theirs, all others start as Easy.
async function addQuestionDifficulty(
  topics: IDBPObjectStore<Schema, StoreName[], 'topics', 'versionchange'>,
) {
  const builtIn = new Map(builtInTopic.questions.map((q) => [q.id, q.difficulty]))
  for (const stored of (await topics.getAll()) as StoredTopic[]) {
    // A record of another shape is left for the schema to skip, not allowed to fail the upgrade.
    if (!Array.isArray(stored?.questions)) continue
    const missing = (q: unknown): q is Record<string, unknown> =>
      typeof q === 'object' && q !== null && !('difficulty' in q)
    if (!stored.questions.some(missing)) continue
    const own = stored.id === builtInTopic.topic.id ? builtIn : new Map<unknown, string>()
    const questions = stored.questions.map((q) =>
      missing(q) ? { ...q, difficulty: own.get(q.id) ?? 'Easy' } : q,
    )
    await topics.put({ ...stored, questions })
  }
}

// Items got a list of concepts: built-in ones take the built-in list, all others a list of one.
async function listConcepts(
  topics: IDBPObjectStore<Schema, StoreName[], 'topics', 'versionchange'>,
) {
  const builtIn = new Map(
    [...builtInTopic.problems, ...builtInTopic.questions].map((item) => [item.id, item.concepts]),
  )
  const single = (item: unknown): item is { id?: unknown; concept: unknown } =>
    typeof item === 'object' && item !== null && 'concept' in item
  for (const stored of (await topics.getAll()) as StoredTopic[]) {
    // A record of another shape is left for the schema to skip, not allowed to fail the upgrade.
    if (typeof stored !== 'object' || stored === null) continue
    const own = stored.id === builtInTopic.topic.id ? builtIn : new Map<unknown, string[]>()
    const known = new Set(Array.isArray(stored.concepts) ? stored.concepts.map((c) => c?.id) : [])
    // An unedited built-in item, whose concept is still the first of the built-in list, takes
    // that list as far as the topic still has those concepts.
    const listed = (items: unknown) =>
      Array.isArray(items)
        ? items.map((item: unknown) => {
            if (!single(item)) return item
            const { concept, ...rest } = item
            const builtInList = own.get(rest.id) ?? []
            const unedited = builtInList.length > 0 && builtInList[0] === concept
            const concepts = unedited ? builtInList.filter((c) => known.has(c)) : [concept]
            return { ...rest, concepts }
          })
        : items
    const lists = [stored.problems, stored.questions]
    if (!lists.some((items) => Array.isArray(items) && items.some(single))) continue
    await topics.put({
      ...stored,
      problems: listed(stored.problems),
      questions: listed(stored.questions),
    })
  }
}

interface StoredTopic {
  id: string
  concepts?: { id?: unknown }[]
  problems?: unknown
  questions?: unknown
}

export interface Saved<T> {
  records: T[]
  skipped: number
}

interface Stored {
  id: string
  updated_at: number
}

export class Records<T extends Stored> {
  private readonly connection: Connection
  private readonly store: StoreName
  private readonly schema: z.ZodType<T>
  // updated_at of each record as this tab last read or wrote it, to detect writes from other tabs.
  private readonly known = new Map<string, number>()
  private writes: Promise<unknown> = Promise.resolve()

  constructor(connection: Connection, store: StoreName, schema: z.ZodType<T>) {
    this.connection = connection
    this.store = store
    this.schema = schema
  }

  async all(): Promise<Saved<T>> {
    const raw = await this.connection.db.getAll(this.store)
    const records: T[] = []
    for (const record of raw) {
      const parsed = this.schema.safeParse(record)
      if (parsed.success) {
        records.push(parsed.data)
        this.known.set(parsed.data.id, parsed.data.updated_at)
      } else {
        console.warn(`Skipped a saved ${this.store} record of another version`, parsed.error)
      }
    }
    return { records, skipped: raw.length - records.length }
  }

  put(record: T): Promise<void> {
    return this.queue({ id: record.id, record })
  }

  delete(id: string): Promise<void> {
    return this.queue({ id })
  }

  // Writes run one at a time, so each checks against what this tab wrote before it.
  private queue(change: Change<T>): Promise<void> {
    const write = this.writes.then(() => this.write(change))
    this.writes = write.catch(() => undefined)
    return write
  }

  private async write({ id, record }: Change<T>): Promise<void> {
    if (this.connection.stopped) throw new Error(this.connection.stopped)
    const tx = this.connection.db.transaction(this.store, 'readwrite')
    const raw = await tx.store.get(id)
    const stored = this.schema.safeParse(raw)
    // A record this tab has read but that is gone was deleted by another tab.
    const deleted = raw === undefined && this.known.has(id)
    if (deleted || (stored.success && stored.data.updated_at !== this.known.get(id))) {
      this.connection.stopped =
        'This work was changed in another tab. Reload this page to continue from there.'
      throw new Error(this.connection.stopped)
    }
    await Promise.all([record ? tx.store.put(record) : tx.store.delete(id), tx.done])
    if (record) this.known.set(id, record.updated_at)
    else this.known.delete(id)
  }
}

// A change without a record deletes.
interface Change<T> {
  id: string
  record?: T
}
