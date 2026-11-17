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
