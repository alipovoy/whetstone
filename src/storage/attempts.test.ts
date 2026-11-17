import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it, vi } from 'vitest'
import { builtInTopic } from '@/content'
import { startAttempt } from '@/core/attempt'
import { AttemptStore } from './attempts'

const problem = builtInTopic.problems[0]
const ID = '00000000-0000-4000-8000-000000000001'
let counter = 0
const freshName = () => `whetstone-test-${++counter}`

describe('AttemptStore', () => {
  it('keeps attempts across connections and overwrites by id', async () => {
    const name = freshName()
    const first = await AttemptStore.open(name)
    const attempt = startAttempt(ID, 't', problem, 'draft', 1)
    await Promise.all([
      first.put(attempt),
      first.put({ ...attempt, code: 'edited', updated_at: 2 }),
    ])

    const second = await AttemptStore.open(name)
    expect(await second.all()).toEqual({
      attempts: [{ ...attempt, code: 'edited', updated_at: 2 }],
      skipped: 0,
    })
  })

  it('skips records it cannot read instead of failing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const name = freshName()
    const store = await AttemptStore.open(name)
    await store.put(startAttempt(ID, 't', problem, '', 1))
    const db = await openDB(name, 1)
    await db.put('attempts', { id: 'old', version: 0 })
    db.close()

    const saved = await store.all()
    expect(saved.attempts.map((a) => a.id)).toEqual([ID])
    expect(saved.skipped).toBe(1)
  })

  it('refuses to overwrite work saved by another tab', async () => {
    const name = freshName()
    const attempt = startAttempt(ID, 't', problem, 'draft', 1)
    const tabA = await AttemptStore.open(name)
    await tabA.put(attempt)
    const tabB = await AttemptStore.open(name)
    await tabB.all()
    await tabB.put({ ...attempt, code: 'from B', updated_at: 2 })

    await expect(tabA.put({ ...attempt, code: 'stale A', updated_at: 3 })).rejects.toThrow(
      'changed in another tab',
    )
    expect((await tabB.all()).attempts[0].code).toBe('from B')
  })

  it('closes its connection when a newer version opens the database', async () => {
    const name = freshName()
    const store = await AttemptStore.open(name)
    const newer = await openDB(name, 2)
    newer.close()
    await expect(store.put(startAttempt(ID, 't', problem, '', 1))).rejects.toThrow(
      'updated in another tab',
    )
  })
})
