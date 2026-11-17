import { describe, expect, it } from 'vitest'
import {
  MAX_ITEMS,
  PROBLEM_TEMPLATE,
  problemRequest,
  QUESTION_TEMPLATE,
  questionRequest,
  readItems,
} from './bridge'
import { addProblems, addQuestions, newTopic } from './topics'

const request = { topic: 'Strings', concepts: [{ name: 'Hashing', group: 'Maps' }] }

describe('problemRequest', () => {
  it('asks for three problems on the topic and lists the existing ones to skip', () => {
    const text = problemRequest({ ...request, existing: ['Anagrams', 'Palindrome'] })
    expect(text).toContain('Write 3 new Python coding interview problems for the topic "Strings"')
    expect(text).toContain('Existing concepts: Hashing (Maps).')
    expect(text).toContain(
      'Problems already in the topic; do not repeat them:\n- Anagrams\n- Palindrome',
    )
  })

  it('shows an example answer that is valid, as is the template', () => {
    const text = problemRequest({ topic: 'T', concepts: [], existing: [] })
    expect(text).toContain('The topic has no problems yet.')
    for (const example of [text, PROBLEM_TEMPLATE]) {
      const read = readItems(example, 'problems')
      expect('items' in read && addProblems(newTopic('t', 'T', 0), read.items, () => 'x').ok).toBe(
        true,
      )
    }
  })
})

describe('questionRequest', () => {
  it('asks for five choice questions on the topic and lists the existing ones to skip', () => {
    const text = questionRequest({ ...request, existing: ['Big-O of a loop'] })
    expect(text).toContain('Write 5 new interview quiz questions for the topic "Strings"')
    expect(text).toContain('Questions already in the topic; do not repeat them:\n- Big-O of a loop')
  })

  it('shows an example answer that is valid, as is the template', () => {
    const text = questionRequest({ topic: 'T', concepts: [], existing: [] })
    for (const example of [text, QUESTION_TEMPLATE]) {
      const read = readItems(example, 'questions')
      expect('items' in read && addQuestions(newTopic('t', 'T', 0), read.items, () => 'x').ok).toBe(
        true,
      )
    }
  })
})

describe('readItems', () => {
  const item = { title: 'x' }

  it.each([
    ['one item', JSON.stringify(item)],
    ['a list', JSON.stringify([item])],
    [
      'a chat answer around a fenced block',
      `Here:\n\`\`\`json\n${JSON.stringify({ questions: [item] })}\n\`\`\`\nDone`,
    ],
  ])('reads %s', (_, text) => {
    expect(readItems(text, 'questions')).toEqual({ items: [item] })
  })

  it.each([
    ['no JSON', 'Sorry, I cannot.', 'Not valid JSON'],
    ['too many items', JSON.stringify(Array(MAX_ITEMS + 1).fill(item)), 'More than 10 problems'],
  ])('refuses %s', (_, text, error) => {
    expect(readItems(text, 'problems')).toEqual({ error: expect.stringContaining(error) })
  })
})
