export type ToWorker =
  | { type: 'init'; harness: string }
  | { type: 'run'; id: number; code: string }
  | { type: 'test'; id: number; code: string; tests: string; only: string[] }

export type FromWorker =
  | { type: 'phase'; text: string }
  | { type: 'ready' }
  | { type: 'fatal'; error: string }
  | { type: 'started'; id: number }
  | { type: 'result'; id: number; json?: string; error?: string }

export interface HarnessRun {
  stdout: string
  error: string | null
  ms: number
}

export interface HarnessTests {
  load_error: string | null
  tests_error: string | null
  stdout: string
  tests: {
    name: string
    doc: string
    passed: boolean
    error: string | null
    stdout: string
    ms: number
  }[]
}
