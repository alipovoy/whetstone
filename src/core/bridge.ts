import { MAX_CONCEPTS, type Difficulty } from '@/content/schema'
import type { ItemList } from './topics'

export const MAX_ITEMS = 10

export interface PromptRequest {
  topic: string
  concepts: { name: string; group: string }[]
  // Titles of the problems, or summaries of the questions, already in the topic.
  existing: string[]
}

export const STYLES = ['Interview', 'Classic'] as const
export type Style = (typeof STYLES)[number]

// What to add: concepts by name, none meaning any of the topic. `special` is added as written.
export interface ItemOrder {
  focus: string[]
  difficulty: Difficulty | 'Mixed'
  count: number
  style: Style
  special: string
}

const PROBLEM = {
  concepts: [{ name: 'Two pointers', group: 'Arrays and strings' }],
  difficulty: 'Easy',
  language: 'python',
  wordings: [
    {
      title: 'Pair with target sum',
      statement:
        'Given a sorted list `nums` and an integer `target`, return `True` if two different elements add up to `target`.',
      examples: [{ input: 'nums = [1, 3, 5], target = 8', output: 'True' }],
      constraints: ['0 <= len(nums) <= 10^5'],
    },
  ],
  starter_code: 'def has_pair(nums, target):\n    pass\n',
  reference_solution:
    'def has_pair(nums, target):\n    i, j = 0, len(nums) - 1\n    while i < j:\n        s = nums[i] + nums[j]\n        if s == target:\n            return True\n        if s < target:\n            i += 1\n        else:\n            j -= 1\n    return False\n',
  tests:
    'from solution import has_pair\n\ndef test_example():\n    """Example from the statement"""\n    assert has_pair([1, 3, 5], 8) is True\n\ndef test_empty():\n    """Empty list"""\n    assert has_pair([], 1) is False\n',
  visible_tests: ['test_example'],
  hints: [
    'A hint that points the way',
    'A hint that names the technique',
    'A hint close to the solution',
  ],
  summary: 'Two pointers moving inwards over a sorted list.',
}

const QUESTION = {
  concepts: [{ name: 'Two pointers', group: 'Arrays and strings' }],
  type: 'single',
  difficulty: 'Easy',
  wordings: [
    {
      text: 'Moving one index from each end of a list towards the middle finds a pair with a given sum. What must be true of the list?',
      options: ['It is sorted', 'It has no repeated values', 'It holds only positive numbers'],
    },
  ],
  answers: [0],
  explanation:
    'Each move relies on order: a sum that is too small needs a larger left value, one that is too large a smaller right value.',
  summary: 'Precondition of the inward two-pointer pair search',
}

export const PROBLEM_TEMPLATE = JSON.stringify(PROBLEM, null, 2)
export const QUESTION_TEMPLATE = JSON.stringify(QUESTION, null, 2)

export function problemRequest(
  { topic, concepts, existing }: PromptRequest,
  order: ItemOrder,
): string {
  return [
    ...ask(order, topic, 'Python coding interview problem', 'problem'),
    ...interview(order, [
      '- Set each problem in a realistic situation and never name the technique in its title or statement: recognising it is part of the task.',
      '- Practise the topic itself: a language topic gets tasks on its features and standard library, an algorithms topic gets algorithm tasks.',
      '- A statement may leave details to infer from its examples, as an interviewer would; the tests stay exact.',
      '- Avoid the best-known textbook problems, and give each problem its own setting and angle.',
    ]),
    ...specialRequest(order),
    ...shape('problems', PROBLEM),
    'Rules:',
    `- \`concepts\` lists the 1 to ${MAX_CONCEPTS} different ideas the problem practises. Reuse an existing concept when it fits; otherwise add a new one, with its area as \`group\`.`,
    '- `difficulty` is Easy, Medium or Hard. `statement` is Markdown.',
    '- `tests` is a Python module: it imports from `solution` and defines functions named `test_*`, each with a one-line docstring and plain `assert`s.',
    '- `visible_tests` names some of the tests; at least one test stays hidden.',
    '- The reference solution passes every test; the starter code fails at least one.',
    '- Exactly three hints, from a gentle nudge to nearly the answer.',
    '- Standard library only. Every test finishes in well under a second.',
    ...context('Problems', concepts, existing),
  ].join('\n')
}

export function questionRequest(
  { topic, concepts, existing }: PromptRequest,
  order: ItemOrder,
): string {
  return [
    ...ask(order, topic, 'interview quiz question', 'question'),
    ...(order.count > 1 ? ['Mix single and multiple choice.'] : []),
    ...interview(order, [
      '- Ask how things behave rather than what they are called: what a short snippet prints or returns, which edge case breaks it, which of two ways is right and why.',
      '- Practise the specifics of the topic, the details an interviewer probes.',
      '- Avoid the best-known trivia, and give each question its own angle.',
    ]),
    ...specialRequest(order),
    ...shape('questions', QUESTION),
    'Rules:',
    `- \`concepts\` lists the 1 to ${MAX_CONCEPTS} different ideas the question checks. Reuse an existing concept when it fits; otherwise add a new one, with its area as \`group\`.`,
    '- `type` is `single` (exactly one correct option) or `multiple` (one or more correct options).',
    '- `difficulty` is Easy, Medium or Hard: about 1, 2 or 3 minutes to answer.',
    '- `answers` lists the indexes of the correct options, counted from 0. At least one option is wrong.',
    '- Extra `wordings` may ask the same question in other words; they keep the same options in the same order.',
    '- `text`, `options` and `explanation` are Markdown. The explanation says why each answer is right or wrong.',
    '- `summary` is a short phrase naming what the question checks.',
    ...context('Questions', concepts, existing),
  ].join('\n')
}

// What to write: how many, of what difficulty, on which concepts. `kind` is the noun of `what`.
function ask(
  { focus, difficulty, count }: ItemOrder,
  topic: string,
  what: string,
  kind: string,
): string[] {
  const one = count === 1
  return [
    `Write ${one ? `one new ${what}` : `${count} new ${what}s`} for the topic "${topic}".`,
    ...(difficulty !== 'Mixed'
      ? [`${one ? `The ${kind} is` : `Every ${kind} is`} ${difficulty}.`]
      : one
        ? []
        : ['Mix the difficulties, from Easy to Hard.']),
    ...(focus.length
      ? [
          `Focus on ${focus.length === 1 ? 'this concept' : 'these concepts'}: ${focus.join('; ')}. Another concept may join, an existing one or a new one.`,
        ]
      : []),
  ]
}

function interview({ style }: ItemOrder, rules: string[]): string[] {
  return style === 'Interview' ? ['', 'Write in the style of current interviews:', ...rules] : []
}

function specialRequest({ special }: ItemOrder): string[] {
  const text = special.trim()
  return text ? ['', `Special request: ${text}`] : []
}

function shape(list: ItemList, example: object): string[] {
  return [
    '',
    'Answer with one JSON block and nothing else, shaped like this:',
    '```json',
    JSON.stringify({ [list]: [example] }, null, 2),
    '```',
    '',
  ]
}

function context(kind: string, concepts: PromptRequest['concepts'], existing: string[]): string[] {
  return [
    '',
    concepts.length
      ? `Existing concepts: ${concepts.map((c) => `${c.name} (${c.group})`).join('; ')}.`
      : 'The topic has no concepts yet.',
    ...(existing.length
      ? ['', `${kind} already in the topic; do not repeat them:`, ...existing.map((t) => `- ${t}`)]
      : [`The topic has no ${kind.toLowerCase()} yet.`]),
  ]
}

// Accepts one item, a list of them, or {"problems": [...]} / {"questions": [...]}, bare or in a
// fenced block.
export function readItems(text: string, list: ItemList): { items: unknown[] } | { error: string } {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text)
  let json: unknown
  try {
    json = JSON.parse(fenced ? fenced[1] : text)
  } catch (error) {
    return { error: `Not valid JSON: ${(error as Error).message}` }
  }
  const keyed = json as Record<string, unknown> | null
  const other = list === 'problems' ? 'questions' : 'problems'
  if (Array.isArray(keyed?.[other]) && !Array.isArray(keyed?.[list])) {
    return { error: `This holds ${other}, not ${list}.` }
  }
  const listed = keyed?.[list]
  const items = Array.isArray(json) ? json : Array.isArray(listed) ? listed : [json]
  if (items.length > MAX_ITEMS) return { error: `More than ${MAX_ITEMS} ${list} at once.` }
  return { items }
}
