import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from 'idb'
import type { z } from 'zod'
import { builtInTopic } from '@/content'
import { AttemptSchema, type Attempt } from '@/core/attempt'
import { topicFromFile, TopicRecordSchema, type TopicRecord } from '@/core/topics'

export const DATABASE_NAME = 'whetstone'
const DATABASE_VERSION = 3

interface Schema extends DBSchema {
  attempts: { key: string; value: unknown }
  topics: { key: string; value: unknown }
}

type StoreName = 'attempts' | 'topics'

interface Connection {
  db: IDBPDatabase<Schema>
  stopped: string | null
}

export interface Database {
  attempts: Records<Attempt>
  topics: Records<TopicRecord>
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
      if (oldVersion < 3) {
        // A failed merge aborts the upgrade, so it runs again on the next open.
        addBuiltInQuestions(transaction.objectStore('topics')).catch(() => transaction.abort())
      }
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
