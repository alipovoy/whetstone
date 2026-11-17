import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it, vi } from 'vitest'
import { builtInTopic } from '@/content'
import { startAttempt } from '@/core/attempt'
import { openDatabase } from './database'

const problem = builtInTopic.problems[0]
const ID = '00000000-0000-4000-8000-000000000001'
let counter = 0
const freshName = () => `whetstone-test-${++counter}`

describe('openDatabase', () => {
  it('keeps attempts across connections and overwrites by id', async () => {
    const name = freshName()
    const { attempts } = await openDatabase(name)
    const attempt = startAttempt(ID, 't', problem, 'draft', 1)
    await Promise.all([
      attempts.put(attempt),
      attempts.put({ ...attempt, code: 'edited', updated_at: 2 }),
    ])

    const second = await openDatabase(name)
    expect(await second.attempts.all()).toEqual({
      records: [{ ...attempt, code: 'edited', updated_at: 2 }],
      skipped: 0,
    })
  })

  it('skips records it cannot read instead of failing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const name = freshName()
    const { attempts } = await openDatabase(name)
    await attempts.put(startAttempt(ID, 't', problem, '', 1))
    const db = await openDB(name)
    await db.put('attempts', { id: 'old', version: 0 })
    db.close()

    const saved = await attempts.all()
    expect(saved.records.map((a) => a.id)).toEqual([ID])
    expect(saved.skipped).toBe(1)
  })

  it('refuses to overwrite or delete work saved by another tab', async () => {
    const name = freshName()
    const attempt = startAttempt(ID, 't', problem, 'draft', 1)
    const tabA = (await openDatabase(name)).attempts
    await tabA.put(attempt)
    const tabB = (await openDatabase(name)).attempts
    await tabB.all()
    await tabB.put({ ...attempt, code: 'from B', updated_at: 2 })

    await expect(tabA.delete(ID)).rejects.toThrow('changed in another tab')
    await expect(tabA.put({ ...attempt, code: 'stale A', updated_at: 3 })).rejects.toThrow(
      'changed in another tab',
    )
    expect((await tabB.all()).records[0].code).toBe('from B')
  })

  it('closes its connection when a newer version opens the database', async () => {
    const name = freshName()
    const { attempts } = await openDatabase(name)
    const newer = await openDB(name, 3)
    newer.close()
    await expect(attempts.put(startAttempt(ID, 't', problem, '', 1))).rejects.toThrow(
      'updated in another tab',
    )
  })

  it('starts with the built-in topic', async () => {
    const { records } = await (await openDatabase(freshName())).topics.all()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: builtInTopic.topic.id,
      name: builtInTopic.topic.name,
      enabled: true,
      problems: builtInTopic.problems,
    })
  })

  it('adds topics to a database of the previous version and keeps its attempts', async () => {
    const name = freshName()
    const old = await openDB(name, 1, {
      upgrade: (db) => void db.createObjectStore('attempts', { keyPath: 'id' }),
    })
    await old.put('attempts', startAttempt(ID, 't', problem, 'kept', 1))
    old.close()

    const db = await openDatabase(name)
    expect((await db.attempts.all()).records[0].code).toBe('kept')
    expect((await db.topics.all()).records.map((t) => t.id)).toEqual([builtInTopic.topic.id])
  })

  it('does not bring back a deleted built-in topic', async () => {
    const name = freshName()
    const { topics } = await openDatabase(name)
    await topics.all()
    await topics.delete(builtInTopic.topic.id)

    expect((await (await openDatabase(name)).topics.all()).records).toEqual([])
  })
})
