import { describe, expect, it } from 'vitest'
import { builtInTopic } from '@/content'
import { bridgePrompt, MAX_ITEMS, readAnswer } from './bridge'
import { draftText } from './topics'

const item = JSON.parse(draftText(builtInTopic.problems[0], builtInTopic.topic.concepts))

describe('bridgePrompt', () => {
  it('asks for the topic, quantity and difficulty, and lists what exists', () => {
    const prompt = bridgePrompt({
      topic: 'Strings',
      concepts: [{ name: 'Hashing', group: 'Maps' }],
      titles: ['Anagrams'],
      count: 3,
      difficulty: 'Hard',
    })
    expect(prompt).toContain(
      'Write 3 new Python coding interview problems for the topic "Strings", difficulty Hard.',
    )
    expect(prompt).toContain('Existing concepts: Hashing (Maps).')
    expect(prompt).toContain('do not repeat them: Anagrams.')
  })

  it('carries an example that is itself a valid answer', () => {
    const prompt = bridgePrompt({
      topic: 'T',
      concepts: [],
      titles: [],
      count: 1,
      difficulty: 'mixed',
    })
    expect(readAnswer(prompt)).toMatchObject({ rejected: [], drafts: [expect.any(String)] })
  })
})

describe('readAnswer', () => {
  it('reads a fenced block among other text and keeps valid items as drafts', () => {
    const text = `Here you go:\n\`\`\`json\n${JSON.stringify({ problems: [item, { ...item, hints: [] }] })}\n\`\`\`\nEnjoy`
    const answer = readAnswer(text)
    expect(answer.drafts.map((d) => JSON.parse(d))).toEqual([item])
    expect(answer.rejected).toEqual([{ item: 2, errors: ['hints: needs exactly three hints'] }])
  })

  it('reads a bare list and drops what the app assigns itself', () => {
    const [draft] = readAnswer(JSON.stringify([{ ...item, id: 'x', source: 'built-in' }])).drafts
    expect(JSON.parse(draft)).toEqual(item)
  })

  it.each([
    ['no JSON', 'Sorry, I cannot.', 'no readable JSON'],
    ['no list', '{"items": []}', 'no "problems" list'],
    ['too many items', JSON.stringify(Array(MAX_ITEMS + 1).fill(item)), 'more than'],
  ])('refuses %s', (_, text, error) => {
    expect(readAnswer(text).error).toContain(error)
  })
})
