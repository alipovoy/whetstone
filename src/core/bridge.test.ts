import { describe, expect, it } from 'vitest'
import { chatRequest, MAX_ITEMS, PROBLEM_TEMPLATE, readItems } from './bridge'
import { addProblems, newTopic } from './topics'

describe('chatRequest', () => {
  it('asks for three problems on the topic and lists the existing ones to skip', () => {
    const request = chatRequest({
      topic: 'Strings',
      concepts: [{ name: 'Hashing', group: 'Maps' }],
      titles: ['Anagrams', 'Palindrome'],
    })
    expect(request).toContain(
      'Write 3 new Python coding interview problems for the topic "Strings"',
    )
    expect(request).toContain('Existing concepts: Hashing (Maps).')
    expect(request).toContain('do not repeat them:\n- Anagrams\n- Palindrome')
  })

  it('shows an example answer that is valid, as is the template', () => {
    const request = chatRequest({ topic: 'T', concepts: [], titles: [] })
    for (const text of [request, PROBLEM_TEMPLATE]) {
      const read = readItems(text)
      expect('items' in read && addProblems(newTopic('t', 'T', 0), read.items, () => 'x').ok).toBe(
        true,
      )
    }
  })
})

describe('readItems', () => {
  const item = { title: 'x' }

  it.each([
    ['one problem', JSON.stringify(item)],
    ['a list', JSON.stringify([item])],
    [
      'a chat answer around a fenced block',
      `Here:\n\`\`\`json\n${JSON.stringify({ problems: [item] })}\n\`\`\`\nDone`,
    ],
  ])('reads %s', (_, text) => {
    expect(readItems(text)).toEqual({ items: [item] })
  })

  it.each([
    ['no JSON', 'Sorry, I cannot.', 'Not valid JSON'],
    ['too many problems', JSON.stringify(Array(MAX_ITEMS + 1).fill(item)), 'More than'],
  ])('refuses %s', (_, text, error) => {
    expect(readItems(text)).toEqual({ error: expect.stringContaining(error) })
  })
})
