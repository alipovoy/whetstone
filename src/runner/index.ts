import { PyodideRunner, type WorkerLike } from './pyodide'
import harness from './python/harness.py?raw'

export function createPyodideRunner(): PyodideRunner {
  return new PyodideRunner({
    harness,
    createWorker: () =>
      new Worker(new URL('./pyodide.worker.ts', import.meta.url), {
        type: 'module',
      }) as unknown as WorkerLike,
  })
}
