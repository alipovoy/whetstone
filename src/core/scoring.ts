const CAP_SOME_TESTS_FAIL = 75
const CAP_MOST_TESTS_FAIL = 40

export interface TestOutcome {
  passed: number
  total: number
  loaded: boolean
}

export function codingScore({ passed, total, loaded }: TestOutcome): number {
  if (!loaded || total === 0) return 0
  const share = (passed / total) * 100
  if (passed === total) return 100
  const cap = passed * 2 < total ? CAP_MOST_TESTS_FAIL : CAP_SOME_TESTS_FAIL
  return Math.round(Math.min(share, cap))
}

export function failureText(message: string, hidden: boolean): string {
  return hidden ? message.split('\n', 1)[0] : message
}

const HINT_CAPS = [100, 90, 75, 55]

export const MAX_HINTS = HINT_CAPS.length - 1

export function hintCap(hintsUsed: number): number {
  return HINT_CAPS[Math.min(hintsUsed, MAX_HINTS)]
}

export const QUIZ_WEIGHTS = { single: 1, multiple: 2 } as const

export function choiceScore(picks: number[], answers: number[], options: number): number {
  const right = picks.filter((p) => answers.includes(p)).length
  const wrongOptions = options - answers.length
  const wrong = wrongOptions > 0 ? (picks.length - right) / wrongOptions : 0
  return Math.round(Math.max(0, right / answers.length - wrong) * 100)
}

export function quizScore(items: { type: keyof typeof QUIZ_WEIGHTS; score: number }[]): number {
  const weight = items.reduce((sum, i) => sum + QUIZ_WEIGHTS[i.type], 0)
  const total = items.reduce((sum, i) => sum + QUIZ_WEIGHTS[i.type] * i.score, 0)
  return weight ? Math.round(total / weight) : 0
}
