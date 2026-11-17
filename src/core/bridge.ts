export const MAX_ITEMS = 10
const REQUESTED = 3

export interface PromptRequest {
  topic: string
  concepts: { name: string; group: string }[]
  titles: string[]
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

export const PROBLEM_TEMPLATE = JSON.stringify(EXAMPLE, null, 2)

export function chatRequest({ topic, concepts, titles }: PromptRequest): string {
  return [
    `Write ${REQUESTED} new Python coding interview problems for the topic "${topic}", from Easy to Hard.`,
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
    ...(titles.length
      ? ['', 'Problems already in the topic; do not repeat them:', ...titles.map((t) => `- ${t}`)]
      : ['The topic has no problems yet.']),
  ].join('\n')
}

// Accepts one problem, a list of them, or {"problems": [...]}, bare or in a fenced block.
export function readItems(text: string): { items: unknown[] } | { error: string } {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text)
  let json: unknown
  try {
    json = JSON.parse(fenced ? fenced[1] : text)
  } catch (error) {
    return { error: `Not valid JSON: ${(error as Error).message}` }
  }
  const listed = (json as { problems?: unknown } | null)?.problems
  const items = Array.isArray(json) ? json : Array.isArray(listed) ? listed : [json]
  if (items.length > MAX_ITEMS) return { error: `More than ${MAX_ITEMS} problems at once.` }
  return { items }
}
