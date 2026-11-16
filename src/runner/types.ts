export interface RunResult {
  stdout: string
  error?: string
  timedOut?: boolean
}

export interface TestCaseResult {
  name: string
  doc: string
  passed: boolean
  message?: string
  stdout: string
}

export interface TestResult {
  tests: TestCaseResult[]
  stdout: string
  loadError?: string
  testsError?: string
  error?: string
  timedOut?: boolean
}

export interface RunnerStatus {
  state: 'idle' | 'loading' | 'ready' | 'failed'
  detail?: string
}

export const RUN_LIMIT_MS = 12_000
