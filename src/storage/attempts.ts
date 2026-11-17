import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { AttemptSchema, type Attempt } from '@/core/attempt'

export const DATABASE_NAME = 'whetstone'

interface Schema extends DBSchema {
  attempts: { key: string; value: unknown }
}

export interface Saved {
  attempts: Attempt[]
  skipped: number
}

export class AttemptStore {
  private readonly db: IDBPDatabase<Schema>
  private stopped: string | null = null
  // updated_at of each record as this tab last read or wrote it, to detect writes from other tabs.
  private readonly known = new Map<string, number>()
  private writes: Promise<unknown> = Promise.resolve()

  private constructor(db: IDBPDatabase<Schema>) {
    this.db = db
  }

  static async open(name = DATABASE_NAME): Promise<AttemptStore> {
    let store: AttemptStore | undefined
    const db = await openDB<Schema>(name, 1, {
      // Each database version adds its stores; later steps append a branch, never edit one.
      upgrade(database, oldVersion) {
        if (oldVersion < 1) database.createObjectStore('attempts', { keyPath: 'id' })
      },
      // A newer version of the app opened in another tab: let its upgrade through.
      blocking() {
        db.close()
        if (store) store.stopped = 'Whetstone was updated in another tab. Reload this page.'
      },
    })
    store = new AttemptStore(db)
    return store
  }

  async all(): Promise<Saved> {
    const records = await this.db.getAll('attempts')
    const attempts: Attempt[] = []
    for (const record of records) {
      const parsed = AttemptSchema.safeParse(record)
      if (parsed.success) {
        attempts.push(parsed.data)
        this.known.set(parsed.data.id, parsed.data.updated_at)
      } else {
        console.warn('Skipped a saved attempt that does not match this version', parsed.error)
      }
    }
    return { attempts, skipped: records.length - attempts.length }
  }

  // Writes run one at a time, so each checks against what this tab wrote before it.
  put(attempt: Attempt): Promise<void> {
    const write = this.writes.then(() => this.write(attempt))
    this.writes = write.catch(() => undefined)
    return write
  }

  private async write(attempt: Attempt): Promise<void> {
    if (this.stopped) throw new Error(this.stopped)
    const tx = this.db.transaction('attempts', 'readwrite')
    const stored = AttemptSchema.safeParse(await tx.store.get(attempt.id))
    if (stored.success && stored.data.updated_at !== this.known.get(attempt.id)) {
      this.stopped =
        'This work was changed in another tab. Reload this page to continue from there.'
      throw new Error(this.stopped)
    }
    await Promise.all([tx.store.put(attempt), tx.done])
    this.known.set(attempt.id, attempt.updated_at)
  }
}
