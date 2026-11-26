import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { describe, expect, it, vi } from 'vitest'
import { builtInTopics } from '@/content'
import { startAttempt } from '@/core/attempt'
import { startQuiz } from '@/core/quiz'
import { topicFromFile } from '@/core/topics'
import { openDatabase } from './database'

const [builtIn] = builtInTopics
const problem = builtIn.problems[0]
const builtInIds = builtInTopics.map((file) => file.topic.id)
// A topic of the user's, filled with copies of built-in items.
const own = topicFromFile({ ...builtIn, topic: { ...builtIn.topic, id: 'own' } }, 2)
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
    expect((await tabB.all()).records.map((t) => t.id)).not.toContain(topic.id)
  })

  it('closes its connection when a newer version opens the database', async () => {
    const name = freshName()
    const { attempts } = await openDatabase(name)
    const newer = await openDB(name, 8)
    newer.close()
    await expect(attempts.put(startAttempt(ID, 't', problem, '', 1))).rejects.toThrow(
      'updated in another tab',
    )
  })

  it('starts with the built-in topics', async () => {
    const { records } = await (await openDatabase(freshName())).topics.all()
    expect(records.map((t) => t.id)).toEqual(builtInIds.toSorted())
    for (const file of builtInTopics) {
      expect(records.find((t) => t.id === file.topic.id)).toMatchObject({
        name: file.topic.name,
        enabled: true,
        concepts: file.topic.concepts,
        problems: file.problems,
        questions: file.questions,
      })
    }
  })

  it("replaces the placeholder topic once, keeping the user's topics and saved work", async () => {
    const name = freshName()
    const old = await openDB(name, 6, {
      upgrade(db) {
        for (const store of ['attempts', 'topics', 'quizzes'])
          db.createObjectStore(store, { keyPath: 'id' })
      },
    })
    await old.put('topics', { ...own, id: 'algorithms', name: 'Placeholder' })
    await old.put('topics', own)
    await old.put('attempts', startAttempt(ID, 't', problem, 'kept', 1))
    old.close()

    const db = await openDatabase(name)
    const { records } = await db.topics.all()
    expect(records.map((t) => t.id)).toEqual([...builtInIds, 'own'].toSorted())
    const algorithms = builtInTopics.find((file) => file.topic.id === 'algorithms')!
    expect(records.find((t) => t.id === 'algorithms')).toMatchObject({
      name: algorithms.topic.name,
      problems: algorithms.problems,
      questions: algorithms.questions,
    })
    expect(records.find((t) => t.id === 'own')).toEqual(own)
    expect((await db.attempts.all()).records.map((a) => a.code)).toEqual(['kept'])
  })

  it('gives stored questions a difficulty of Easy', async () => {
    const name = freshName()
    const strip = (question: Record<string, unknown>) => {
      const { difficulty: _difficulty, ...rest } = question
      return rest
    }
    const old = await openDB(name, 4, {
      upgrade(db) {
        for (const store of ['attempts', 'topics', 'quizzes'])
          db.createObjectStore(store, { keyPath: 'id' })
      },
    })
    const [first, second] = builtIn.questions.filter((q) => q.difficulty !== 'Easy')
    await old.put('topics', { ...own, questions: [strip(first), second] })
    old.close()

    const topics = (await (await openDatabase(name)).topics.all()).records
    expect(topics.find((t) => t.id === 'own')!.questions).toEqual([
      { ...first, difficulty: 'Easy' },
      second,
    ])
  })

  it('gives stored items a list of concepts and resets saved work, which copies one', async () => {
    const name = freshName()
    const single = <T extends { concepts: string[] }>({ concepts, ...rest }: T) => ({
      ...rest,
      concept: concepts[0],
    })
    const [first] = builtIn.problems
    const [question] = builtIn.questions
    const old = await openDB(name, 5, {
      upgrade(db) {
        for (const store of ['attempts', 'topics', 'quizzes'])
          db.createObjectStore(store, { keyPath: 'id' })
      },
    })
    await old.put('topics', {
      ...own,
      problems: [single({ ...first, concepts: ['strings', 'arrays'] })],
      questions: [single(question)],
    })
    await old.put('attempts', { id: 'a' })
    await old.put('quizzes', { id: 'q' })
    old.close()

    const db = await openDatabase(name)
    const stored = (await db.topics.all()).records.find((t) => t.id === 'own')!
    expect(stored.problems).toEqual([{ ...first, concepts: ['strings'] }])
    expect(stored.questions).toEqual([{ ...question, concepts: [question.concepts[0]] }])
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
    expect((await db.topics.all()).records.map((t) => t.id)).toEqual(builtInIds.toSorted())
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
    const questions = builtIn.questions.slice(0, 5).map((question) => ({
      topic: builtIn.topic,
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
    await topics.delete(builtIn.topic.id)

    const { records } = await (await openDatabase(name)).topics.all()
    expect(records.map((t) => t.id)).toEqual(
      builtInIds.filter((id) => id !== builtIn.topic.id).toSorted(),
    )
  })
})
