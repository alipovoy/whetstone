import type { FromWorker, HarnessRun, HarnessTests, ToWorker } from './protocol'
import type { RunnerStatus, RunResult, TestResult } from './types'

export interface WorkerLike {
  postMessage(message: ToWorker): void
  terminate(): void
  onmessage: ((event: { data: FromWorker }) => void) | null
  onerror: ((event: { message?: string }) => void) | null
}

export interface PyodideRunnerOptions {
  createWorker: () => WorkerLike
  harness: string
  loadTimeoutMs?: number
  packageTimeoutMs?: number
}

type JobMessage =
  { type: 'run'; code: string } | { type: 'test'; code: string; tests: string; only: string[] }

type JobOutcome = { json: string } | { error: string; timedOut?: boolean }

interface Pending {
  id: number
  limitMs: number
  resolve(outcome: JobOutcome): void
  timer?: ReturnType<typeof setTimeout>
}

// Running Python cannot be interrupted from outside, so a job over its limit terminates the
// worker and a fresh one is started.
export class PyodideRunner {
  private worker: WorkerLike | null = null
  private ready: Promise<void> | null = null
  private settleReady: { resolve(): void; reject(error: Error): void } | null = null
  private loadTimer: ReturnType<typeof setTimeout> | undefined
  private pending: Pending | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private nextId = 1
  private current: RunnerStatus = { state: 'idle' }
  private readonly listeners = new Set<() => void>()
  private readonly options: Required<PyodideRunnerOptions>

  constructor(options: PyodideRunnerOptions) {
    this.options = { loadTimeoutMs: 60_000, packageTimeoutMs: 90_000, ...options }
  }

  status = (): RunnerStatus => this.current

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  warmUp(): void {
    this.start().catch(() => undefined)
  }

  async run(code: string, limitMs: number): Promise<RunResult> {
    const outcome = await this.enqueue({ type: 'run', code }, limitMs)
    if ('error' in outcome) return { stdout: '', error: outcome.error, timedOut: outcome.timedOut }
    const result = JSON.parse(outcome.json) as HarnessRun
    return { stdout: result.stdout, error: result.error ?? undefined }
  }

  async test(code: string, tests: string, only: string[], limitMs: number): Promise<TestResult> {
    const outcome = await this.enqueue({ type: 'test', code, tests, only }, limitMs)
    if ('error' in outcome) {
      return { tests: [], stdout: '', error: outcome.error, timedOut: outcome.timedOut }
    }
    const result = JSON.parse(outcome.json) as HarnessTests
    return {
      stdout: result.stdout,
      loadError: result.load_error ?? undefined,
      testsError: result.tests_error ?? undefined,
      tests: result.tests.map((t) => ({
        name: t.name,
        doc: t.doc,
        passed: t.passed,
        message: t.error ?? undefined,
        stdout: t.stdout,
      })),
    }
  }

  private enqueue(message: JobMessage, limitMs: number): Promise<JobOutcome> {
    this.warmUp()
    const job = this.queue.then(() => this.execute(message, limitMs))
    this.queue = job.catch(() => undefined)
    return job
  }

  private async execute(message: JobMessage, limitMs: number): Promise<JobOutcome> {
    try {
      await this.start()
    } catch (error) {
      return { error: `Python failed to load: ${(error as Error).message}` }
    }
    const worker = this.worker
    if (!worker) return { error: 'Interrupted' }
    return new Promise<JobOutcome>((resolve) => {
      const id = this.nextId++
      const pending: Pending = {
        id,
        limitMs,
        resolve: (outcome) => {
          clearTimeout(pending.timer)
          if (this.pending === pending) this.pending = null
          resolve(outcome)
        },
      }
      // Until the worker reports 'started' it is fetching packages, which does not count
      // against the run's time limit.
      pending.timer = setTimeout(
        () => this.stopJob(pending, 'Timed out while loading Python packages.'),
        this.options.packageTimeoutMs,
      )
      this.pending = pending
      worker.postMessage({ ...message, id })
    })
  }

  private stopJob(pending: Pending, reason: string): void {
    if (this.pending !== pending) return
    this.stopWorker()
    this.ready = null
    pending.resolve({ error: reason, timedOut: true })
    this.warmUp()
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready
    const ready = new Promise<void>((resolve, reject) => {
      this.settleReady = { resolve, reject }
    })
    this.ready = ready
    ready.catch(() => {
      if (this.ready === ready) this.ready = null
    })
    this.setStatus({ state: 'loading', detail: 'creating the worker' })
    try {
      const worker = this.options.createWorker()
      this.worker = worker
      worker.onmessage = (event) => this.onMessage(event.data)
      worker.onerror = (event) =>
        this.fail(event.message || 'the browser stopped the Python worker')
      this.loadTimer = setTimeout(
        () => this.fail(`loading took longer than ${this.options.loadTimeoutMs / 1000} s`),
        this.options.loadTimeoutMs,
      )
      worker.postMessage({ type: 'init', harness: this.options.harness })
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
    }
    return ready
  }

  private onMessage(message: FromWorker): void {
    switch (message.type) {
      case 'phase':
        this.setStatus({ state: 'loading', detail: message.text })
        return
      case 'ready':
        clearTimeout(this.loadTimer)
        this.setStatus({ state: 'ready' })
        this.settleReady?.resolve()
        this.settleReady = null
        return
      case 'fatal':
        this.fail(message.error)
        return
      case 'started': {
        const pending = this.pending
        if (pending?.id !== message.id) return
        clearTimeout(pending.timer)
        pending.timer = setTimeout(
          () =>
            this.stopJob(
              pending,
              `Time limit exceeded: stopped after ${pending.limitMs / 1000} s. ` +
                'Check for an infinite loop or an inefficient algorithm.',
            ),
          pending.limitMs,
        )
        return
      }
      case 'result':
        if (this.pending?.id !== message.id) return
        this.pending.resolve(
          message.json !== undefined
            ? { json: message.json }
            : { error: message.error ?? 'The run failed without a message.' },
        )
    }
  }

  private fail(reason: string): void {
    this.stopWorker()
    this.setStatus({ state: 'failed', detail: reason })
    if (this.settleReady) this.settleReady.reject(new Error(reason))
    else this.ready = null
    this.settleReady = null
    this.pending?.resolve({ error: `Python stopped working: ${reason}` })
  }

  private stopWorker(): void {
    clearTimeout(this.loadTimer)
    if (!this.worker) return
    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
    this.worker = null
  }

  private setStatus(status: RunnerStatus): void {
    this.current = status
    for (const listener of this.listeners) listener()
  }
}
