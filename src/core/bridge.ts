import { DraftProblemSchema, testErrors, type Difficulty } from '@/content/schema'

export const MAX_ITEMS = 10

export interface PromptRequest {
  topic: string
  concepts: { name: string; group: string }[]
  titles: string[]
  count: number
  difficulty: Difficulty | 'mixed'
}

const EXAMPLE = {
  concept: { name: 'Two pointers', group: 'Arrays and strings' },
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

export function bridgePrompt({
  topic,
  concepts,
  titles,
  count,
  difficulty,
}: PromptRequest): string {
  const level = difficulty === 'mixed' ? 'a mix of Easy, Medium and Hard' : difficulty
  return [
    `Write ${count} new Python coding interview ${count === 1 ? 'problem' : 'problems'} for the topic "${topic}", difficulty ${level}.`,
    '',
    'Answer with one JSON block and nothing else, shaped like this:',
    '```json',
    JSON.stringify({ problems: [EXAMPLE] }, null, 2),
    '```',
    '',
    'Rules:',
    '- `concept` names the idea the problem practises; reuse an existing concept when one fits.',
    '- `difficulty` is Easy, Medium or Hard. `statement` is Markdown.',
    '- `tests` is a Python module: it imports from `solution` and defines functions named `test_*`, each with a one-line docstring and plain `assert`s.',
    '- `visible_tests` names some of the tests; at least one test stays hidden.',
    '- The reference solution passes every test; the starter code fails at least one.',
    '- Exactly three hints, from a gentle nudge to nearly the answer.',
    '- Standard library only. Every test finishes in well under a second.',
    '',
    concepts.length
      ? `Existing concepts: ${concepts.map((c) => `${c.name} (${c.group})`).join('; ')}.`
      : 'The topic has no concepts yet.',
    titles.length
      ? `Problems already in the topic, do not repeat them: ${titles.join('; ')}.`
      : 'The topic has no problems yet.',
  ].join('\n')
}

export interface Answer {
  // Each valid item, formatted as the text of a draft.
  drafts: string[]
  rejected: { item: number; errors: string[] }[]
  error?: string
}

export function readAnswer(text: string): Answer {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text)
  let json: unknown
  try {
    json = JSON.parse(fenced ? fenced[1] : text)
  } catch {
    return { drafts: [], rejected: [], error: 'The answer holds no readable JSON.' }
  }
  const items = Array.isArray(json) ? json : (json as { problems?: unknown } | null)?.problems
  if (!Array.isArray(items)) {
    return { drafts: [], rejected: [], error: 'The answer has no "problems" list.' }
  }
  if (items.length > MAX_ITEMS) {
    return { drafts: [], rejected: [], error: `The answer has more than ${MAX_ITEMS} problems.` }
  }
  const answer: Answer = { drafts: [], rejected: [] }
  items.forEach((raw, i) => {
    const parsed = DraftProblemSchema.safeParse(raw)
    const errors = parsed.success
      ? testErrors(parsed.data)
      : parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    if (errors.length || !parsed.success) answer.rejected.push({ item: i + 1, errors })
    else answer.drafts.push(JSON.stringify(parsed.data, null, 2))
  })
  return answer
}
