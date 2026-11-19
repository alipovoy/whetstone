import { describe, expect, it } from 'vitest'
import {
  MAX_ITEMS,
  PROBLEM_TEMPLATE,
  problemRequest,
  QUESTION_TEMPLATE,
  questionRequest,
  readItems,
  type ItemOrder,
} from './bridge'
import { addProblems, addQuestions, newTopic } from './topics'

const request = { topic: 'Strings', concepts: [{ name: 'Hashing', group: 'Maps' }] }

describe('problemRequest', () => {
  const mixed: ItemOrder = { focus: [], difficulty: 'Mixed', count: 3 }

  it('asks for problems on the topic and lists the existing ones to skip', () => {
    const text = problemRequest({ ...request, existing: ['Anagrams', 'Palindrome'] }, mixed)
    expect(text).toContain(
      'Write 3 new Python coding interview problems for the topic "Strings".\nMix the difficulties, from Easy to Hard.',
    )
    expect(text).toContain('Existing concepts: Hashing (Maps).')
    expect(text).toContain(
      'Problems already in the topic; do not repeat them:\n- Anagrams\n- Palindrome',
    )
  })

  it('asks for the difficulty and the concepts chosen', () => {
    const one = problemRequest(
      { ...request, existing: [] },
      { focus: ['Hashing'], difficulty: 'Hard', count: 1 },
    )
    expect(one).toContain(
      'Write one new Python coding interview problem for the topic "Strings".\nThe problem is Hard.\nFocus on this concept: Hashing. Another concept may join, an existing one or a new one.',
    )
    const two = problemRequest(
      { ...request, existing: [] },
      { focus: ['Hashing', 'Sets'], difficulty: 'Easy', count: 2 },
    )
    expect(two).toContain('Every problem is Easy.\nFocus on these concepts: Hashing; Sets.')
  })

  it('shows an example answer that is valid, as is the template', () => {
    const text = problemRequest({ topic: 'T', concepts: [], existing: [] }, mixed)
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
  it('asks for questions as ordered, and lists the existing ones to skip', () => {
    const text = questionRequest(
      { ...request, existing: ['Big-O of a loop'] },
      { focus: [], difficulty: 'Mixed', count: 5 },
    )
    expect(text).toContain(
      'Write 5 new interview quiz questions for the topic "Strings".\nMix the difficulties, from Easy to Hard.\nMix single and multiple choice.',
    )
    expect(text).toContain('Questions already in the topic; do not repeat them:\n- Big-O of a loop')
    const one = questionRequest(
      { ...request, existing: [] },
      { focus: ['Hashing'], difficulty: 'Medium', count: 1 },
    )
    expect(one).toContain(
      'Write one new interview quiz question for the topic "Strings".\nThe question is Medium.\nFocus on this concept: Hashing.',
    )
    expect(one).not.toContain('Mix single')
  })

  it('shows an example answer that is valid, as is the template', () => {
    const text = questionRequest(
      { topic: 'T', concepts: [], existing: [] },
      { focus: [], difficulty: 'Mixed', count: 3 },
    )
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
    [
      'questions in the problem field',
      JSON.stringify({ questions: [item] }),
      'This holds questions, not problems.',
    ],
    ['too many items', JSON.stringify(Array(MAX_ITEMS + 1).fill(item)), 'More than 10 problems'],
  ])('refuses %s', (_, text, error) => {
    expect(readItems(text, 'problems')).toEqual({ error: expect.stringContaining(error) })
  })
})
