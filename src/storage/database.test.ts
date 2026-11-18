import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it, vi } from 'vitest'
import { builtInTopic } from '@/content'
import { startAttempt } from '@/core/attempt'
import { startQuiz } from '@/core/quiz'
import { topicFromFile } from '@/core/topics'
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

  it('refuses to bring back a record another tab deleted', async () => {
    const name = freshName()
    const tabA = (await openDatabase(name)).topics
    const [topic] = (await tabA.all()).records
    const tabB = (await openDatabase(name)).topics
    await tabB.all()
    await tabB.delete(topic.id)

    await expect(tabA.put({ ...topic, name: 'stale', updated_at: 5 })).rejects.toThrow(
      'changed in another tab',
    )
    expect((await tabB.all()).records).toEqual([])
  })

  it('closes its connection when a newer version opens the database', async () => {
    const name = freshName()
    const { attempts } = await openDatabase(name)
    const newer = await openDB(name, 7)
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
      questions: builtInTopic.questions,
    })
  })

  it('adds the built-in questions once to a built-in topic stored without them', async () => {
    const name = freshName()
    const { questions: _, ...stored } = topicFromFile(builtInTopic, 1)
    const mine = { ...builtInTopic.problems[0], id: 'mine', source: 'user' }
    const old = await openDB(name, 2, {
      upgrade(db) {
        db.createObjectStore('attempts', { keyPath: 'id' })
        db.createObjectStore('topics', { keyPath: 'id' })
      },
    })
    await old.put('topics', { ...stored, problems: [...stored.problems, mine] })
    old.close()

    const [topic] = (await (await openDatabase(name)).topics.all()).records
    expect(topic.problems).toContainEqual(mine)
    expect(topic.questions).toEqual(builtInTopic.questions)
  })

  it('gives stored questions a difficulty: built-in ones theirs, others Easy', async () => {
    const name = freshName()
    const strip = (question: Record<string, unknown>) => {
      const { difficulty: _difficulty, ...rest } = question
      return rest
    }
    const builtIn = topicFromFile(builtInTopic, 1)
    const own = {
      ...topicFromFile({ ...builtInTopic, topic: { ...builtInTopic.topic, id: 'own' } }, 2),
      questions: builtInTopic.questions.slice(0, 2).map(strip),
    }
    const changed = builtInTopic.questions[3]
    const old = await openDB(name, 4, {
      upgrade(db) {
        for (const store of ['attempts', 'topics', 'quizzes'])
          db.createObjectStore(store, { keyPath: 'id' })
      },
    })
    await old.put('topics', {
      ...builtIn,
      questions: [...builtIn.questions.map(strip), { ...strip(changed), id: 'mine' }],
    })
    await old.put('topics', own)
    old.close()

    const topics = (await (await openDatabase(name)).topics.all()).records
    const byId = (id: string) => topics.find((t) => t.id === id)!.questions
    expect(byId(builtInTopic.topic.id)).toEqual([
      ...builtInTopic.questions,
      { ...changed, id: 'mine', difficulty: 'Easy' },
    ])
    expect(byId('own').map((q) => q.difficulty)).toEqual(['Easy', 'Easy'])
  })

  it('gives stored items a list of concepts and resets saved work, which copies one', async () => {
    const name = freshName()
    const single = <T extends { concepts: string[] }>({ concepts, ...rest }: T) => ({
      ...rest,
      concept: concepts[0],
    })
    const builtIn = topicFromFile(builtInTopic, 1)
    const [first, second] = builtInTopic.problems.filter((p) => p.concepts.length > 1)
    const edited = builtInTopic.questions.find((q) => q.concepts.length > 1)!
    const own = {
      ...topicFromFile({ ...builtInTopic, topic: { ...builtInTopic.topic, id: 'own' } }, 2),
    }
    const old = await openDB(name, 5, {
      upgrade(db) {
        for (const store of ['attempts', 'topics', 'quizzes'])
          db.createObjectStore(store, { keyPath: 'id' })
      },
    })
    await old.put('topics', {
      ...builtIn,
      // The second concept of `second` was deleted from the topic.
      concepts: builtIn.concepts.filter((c) => c.id !== second.concepts[1]),
      problems: [first, second].map(single),
      // `edited` had its concept changed to its second built-in one.
      questions: [
        ...builtInTopic.questions.slice(0, 2).map(single),
        { ...single(edited), concept: edited.concepts[1] },
      ],
    })
    await old.put('topics', { ...own, problems: [first].map(single), questions: [] })
    await old.put('attempts', { id: 'a' })
    await old.put('quizzes', { id: 'q' })
    old.close()

    const db = await openDatabase(name)
    const topics = (await db.topics.all()).records
    const byId = (id: string) => topics.find((t) => t.id === id)!
    expect(byId(builtInTopic.topic.id).problems).toEqual([
      first,
      { ...second, concepts: [second.concepts[0]] },
    ])
    expect(byId(builtInTopic.topic.id).questions).toEqual([
      ...builtInTopic.questions.slice(0, 2),
      { ...edited, concepts: [edited.concepts[1]] },
    ])
    expect(byId('own').problems).toEqual([{ ...first, concepts: [first.concepts[0]] }])
    expect(await db.attempts.all()).toEqual({ records: [], skipped: 0 })
    expect(await db.quizzes.all()).toEqual({ records: [], skipped: 0 })
  })

  it('opens past a stored topic of another shape, leaving it for the schema to skip', async () => {
    const name = freshName()
    const old = await openDB(name, 4, {
      upgrade(db) {
        for (const store of ['attempts', 'topics', 'quizzes'])
          db.createObjectStore(store, { keyPath: 'id' })
      },
    })
    await old.put('topics', { id: 'odd', questions: 'none' })
    await old.put('topics', { id: 'odder', questions: [null, { id: 'q' }] })
    old.close()

    const db = await openDatabase(name)
    const raw = await openDB(name)
    expect(await raw.get('topics', 'odder')).toMatchObject({
      questions: [null, { id: 'q', difficulty: 'Easy' }],
    })
    raw.close()
    expect((await db.topics.all()).skipped).toBe(2)
  })

  it('adds topics to a database of version 1 and resets its attempts', async () => {
    const name = freshName()
    const old = await openDB(name, 1, {
      upgrade: (db) => void db.createObjectStore('attempts', { keyPath: 'id' }),
    })
    await old.put('attempts', startAttempt(ID, 't', problem, 'kept', 1))
    old.close()

    const db = await openDatabase(name)
    expect((await db.attempts.all()).records).toEqual([])
    expect((await db.topics.all()).records.map((t) => t.id)).toEqual([builtInTopic.topic.id])
  })

  it('keeps quizzes, added to a database of the previous version', async () => {
    const name = freshName()
    const old = await openDB(name, 3, {
      upgrade(db) {
        db.createObjectStore('attempts', { keyPath: 'id' })
        db.createObjectStore('topics', { keyPath: 'id' })
      },
    })
    old.close()
    const questions = builtInTopic.questions.slice(0, 5).map((question) => ({
      topic: builtInTopic.topic,
      question,
      areas: [],
    }))
    const quiz = startQuiz(ID, { questions, timed: false }, 1)
    await (await openDatabase(name)).quizzes.put(quiz)

    expect((await (await openDatabase(name)).quizzes.all()).records).toEqual([quiz])
  })

  it('does not bring back a deleted built-in topic', async () => {
    const name = freshName()
    const { topics } = await openDatabase(name)
    await topics.all()
    await topics.delete(builtInTopic.topic.id)

    expect((await (await openDatabase(name)).topics.all()).records).toEqual([])
  })
})
