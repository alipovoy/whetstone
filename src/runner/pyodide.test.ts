import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, HarnessRun, HarnessTests, ToWorker } from './protocol'
import { PyodideRunner, type WorkerLike } from './pyodide'

class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: FromWorker }) => void) | null = null
  onerror: ((event: { message?: string }) => void) | null = null
  readonly received: ToWorker[] = []
  terminated = false

  postMessage(message: ToWorker): void {
    this.received.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  send(message: FromWorker): void {
    this.onmessage?.({ data: message })
  }

  get lastJob() {
    const job = this.received.at(-1)
    if (!job || job.type === 'init') throw new Error('no job was posted')
    return job
  }
}

function setup(options: { loadTimeoutMs?: number } = {}) {
  const workers: FakeWorker[] = []
  const runner = new PyodideRunner({
    harness: '# harness',
    createWorker: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
    ...options,
  })
  return { runner, workers, latest: () => workers.at(-1)! }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

const runJson = (r: Partial<HarnessRun>) => JSON.stringify({ stdout: '', error: null, ms: 1, ...r })

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('PyodideRunner', () => {
  it('does nothing until it is used', () => {
    const { runner, workers } = setup()
    expect(runner.status()).toEqual({ state: 'idle' })
    expect(workers).toHaveLength(0)
  })

  it('loads the runtime on warm-up and reports progress', () => {
    const { runner, latest } = setup()
    const states: string[] = []
    runner.subscribe(() => states.push(runner.status().detail ?? runner.status().state))

    runner.warmUp()
    expect(latest().received).toEqual([{ type: 'init', harness: '# harness' }])
    latest().send({ type: 'phase', text: 'starting the Python runtime' })
    latest().send({ type: 'ready' })

    expect(states).toEqual(['creating the worker', 'starting the Python runtime', 'ready'])
  })

  it('stops notifying after unsubscribing', () => {
    const { runner } = setup()
    const listener = vi.fn()
    runner.subscribe(listener)()
    runner.warmUp()
    expect(listener).not.toHaveBeenCalled()
  })

  it('runs code and returns the output', async () => {
    const { runner, latest } = setup()
    const result = runner.run('print(1)', 1000)
    latest().send({ type: 'ready' })
    await settle()
    expect(latest().lastJob).toMatchObject({ type: 'run', code: 'print(1)' })

    latest().send({ type: 'started', id: latest().lastJob.id })
    latest().send({
      type: 'result',
      id: latest().lastJob.id,
      json: runJson({ stdout: '1\n', ms: 3 }),
    })
    expect(await result).toEqual({ stdout: '1\n', error: undefined })
  })

  it('returns the user error from a run', async () => {
    const { runner, latest } = setup()
    const result = runner.run('1/0', 1000)
    latest().send({ type: 'ready' })
    await settle()
    latest().send({
      type: 'result',
      id: latest().lastJob.id,
      json: runJson({ error: 'ZeroDivisionError: division by zero' }),
    })
    expect((await result).error).toBe('ZeroDivisionError: division by zero')
  })

  it('runs tests and maps the results', async () => {
    const { runner, latest } = setup()
    const result = runner.test('code', 'tests', ['test_a'], 1000)
    latest().send({ type: 'ready' })
    await settle()
    expect(latest().lastJob).toMatchObject({
      type: 'test',
      code: 'code',
      tests: 'tests',
      only: ['test_a'],
    })

    const harness: HarnessTests = {
      load_error: null,
      tests_error: null,
      stdout: 'loaded\n',
      tests: [
        { name: 'test_a', doc: 'Scenario A', passed: true, error: null, stdout: '', ms: 0.5 },
        { name: 'test_b', doc: '', passed: false, error: 'AssertionError', stdout: 'x\n', ms: 2 },
      ],
    }
    latest().send({ type: 'result', id: latest().lastJob.id, json: JSON.stringify(harness) })

    expect(await result).toEqual({
      stdout: 'loaded\n',
      loadError: undefined,
      testsError: undefined,
      tests: [
        {
          name: 'test_a',
          doc: 'Scenario A',
          passed: true,
          message: undefined,
          stdout: '',
        },
        {
          name: 'test_b',
          doc: '',
          passed: false,
          message: 'AssertionError',
          stdout: 'x\n',
        },
      ],
    })
  })

  it('stops code that exceeds its limit, then works again with a fresh worker', async () => {
    const { runner, workers, latest } = setup()
    const first = runner.run('while True: pass', 12_000)
    workers[0].send({ type: 'ready' })
    await settle()
    workers[0].send({ type: 'started', id: workers[0].lastJob.id })

    await vi.advanceTimersByTimeAsync(11_999)
    expect(workers[0].terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(workers[0].terminated).toBe(true)
    expect(await first).toEqual({
      stdout: '',
      timedOut: true,
      error:
        'Time limit exceeded: stopped after 12 s. Check for an infinite loop or an inefficient algorithm.',
    })
    expect(workers).toHaveLength(2)
    expect(runner.status().state).toBe('loading')

    const second = runner.run('print(2)', 12_000)
    latest().send({ type: 'ready' })
    await settle()
    latest().send({ type: 'result', id: latest().lastJob.id, json: runJson({ stdout: '2\n' }) })
    expect((await second).stdout).toBe('2\n')
  })

  it('does not count time spent fetching packages against the run limit', async () => {
    const { runner, latest } = setup()
    const result = runner.run('import numpy', 1000)
    latest().send({ type: 'ready' })
    await settle()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(latest().terminated).toBe(false)
    latest().send({ type: 'started', id: latest().lastJob.id })
    latest().send({ type: 'result', id: latest().lastJob.id, json: runJson({}) })
    expect((await result).timedOut).toBeUndefined()
  })

  it('gives up when packages never finish loading', async () => {
    const { runner, latest } = setup()
    const result = runner.run('import numpy', 1000)
    latest().send({ type: 'ready' })
    await settle()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(await result).toMatchObject({
      timedOut: true,
      error: 'Timed out while loading Python packages.',
    })
  })

  it('runs one job at a time, in order', async () => {
    const { runner, latest } = setup()
    const first = runner.run('a', 1000)
    const second = runner.run('b', 1000)
    latest().send({ type: 'ready' })
    await settle()

    expect(latest().received.filter((m) => m.type !== 'init')).toHaveLength(1)
    latest().send({ type: 'result', id: latest().lastJob.id, json: runJson({ stdout: 'a' }) })
    await settle()
    expect(latest().lastJob).toMatchObject({ code: 'b' })
    latest().send({ type: 'result', id: latest().lastJob.id, json: runJson({ stdout: 'b' }) })

    expect([(await first).stdout, (await second).stdout]).toEqual(['a', 'b'])
  })

  it('ignores a result for a job that was already stopped', async () => {
    const { runner, workers } = setup()
    const first = runner.run('slow', 100)
    workers[0].send({ type: 'ready' })
    await settle()
    const staleId = workers[0].lastJob.id
    workers[0].send({ type: 'started', id: staleId })
    await vi.advanceTimersByTimeAsync(100)
    await first

    const second = runner.run('next', 100)
    workers[1].send({ type: 'ready' })
    await settle()
    workers[1].send({ type: 'result', id: staleId, json: runJson({ stdout: 'stale' }) })
    workers[1].send({
      type: 'result',
      id: workers[1].lastJob.id,
      json: runJson({ stdout: 'fresh' }),
    })
    expect((await second).stdout).toBe('fresh')
  })

  it('reports a failed load and tries again on the next run', async () => {
    const { runner, workers } = setup()
    const first = runner.run('print(1)', 1000)
    workers[0].send({ type: 'fatal', error: 'network error' })
    expect(await first).toEqual({
      stdout: '',
      error: 'Python failed to load: network error',
      timedOut: undefined,
    })
    expect(runner.status()).toEqual({ state: 'failed', detail: 'network error' })
    expect(workers[0].terminated).toBe(true)

    const second = runner.run('print(1)', 1000)
    await settle()
    expect(workers).toHaveLength(2)
    workers[1].send({ type: 'ready' })
    await settle()
    workers[1].send({ type: 'result', id: workers[1].lastJob.id, json: runJson({ stdout: '1\n' }) })
    expect((await second).stdout).toBe('1\n')
  })

  it('fails the load when it takes too long', async () => {
    const { runner } = setup({ loadTimeoutMs: 5000 })
    const result = runner.run('print(1)', 1000)
    await vi.advanceTimersByTimeAsync(5000)
    expect((await result).error).toBe('Python failed to load: loading took longer than 5 s')
  })

  it('recovers when the worker crashes during a run', async () => {
    const { runner, workers } = setup()
    const first = runner.run('crash', 1000)
    workers[0].send({ type: 'ready' })
    await settle()
    workers[0].onerror?.({ message: 'out of memory' })
    expect((await first).error).toBe('Python stopped working: out of memory')

    const second = runner.run('print(1)', 1000)
    await settle()
    expect(workers).toHaveLength(2)
    workers[1].send({ type: 'ready' })
    await settle()
    workers[1].send({ type: 'result', id: workers[1].lastJob.id, json: runJson({ stdout: 'ok' }) })
    expect((await second).stdout).toBe('ok')
  })
})
