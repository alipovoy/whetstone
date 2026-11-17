import { loadPyodide, version, type PyodideInterface } from 'pyodide'
import type { FromWorker, ToWorker } from './protocol'

const scope = self as unknown as {
  postMessage(message: FromWorker): void
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null
}

const indexURL = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`

interface Harness {
  runCode(code: string): string
  runTests(code: string, tests: string, only: string): string
  py: PyodideInterface
}

let ready: Promise<Harness> | null = null

async function init(harness: string): Promise<Harness> {
  scope.postMessage({ type: 'phase', text: 'starting the Python runtime' })
  const py = await loadPyodide({ indexURL })
  lockDown()
  scope.postMessage({ type: 'phase', text: 'loading the test runner' })
  py.runPython(harness)
  return { py, runCode: py.globals.get('run_code'), runTests: py.globals.get('run_tests') }
}

scope.onmessage = async (event) => {
  const message = event.data
  if (message.type === 'init') {
    ready = init(message.harness)
    try {
      await ready
      scope.postMessage({ type: 'ready' })
    } catch (error) {
      scope.postMessage({ type: 'fatal', error: describe(error) })
    }
    return
  }
  try {
    if (!ready) throw new Error('The Python worker was not initialised')
    const { py, runCode, runTests } = await ready
    const tests = message.type === 'test' ? message.tests : ''
    // A package that fails to load surfaces later as an ordinary ImportError in the user's code.
    await py.loadPackagesFromImports(`${message.code}\n${tests}`).catch(() => undefined)
    scope.postMessage({ type: 'started', id: message.id })
    const json: string =
      message.type === 'run'
        ? runCode(message.code)
        : runTests(message.code, message.tests, JSON.stringify(message.only))
    scope.postMessage({ type: 'result', id: message.id, json })
  } catch (error) {
    scope.postMessage({ type: 'result', id: message.id, error: describe(error) })
  }
}

// Code pasted from a chat runs here, and Python reaches the worker's globals through `import js`.
// So once Pyodide is loaded the worker drops the site's storage and every way out except fetching
// packages from the pinned CDN. Removed from the prototypes too, where the originals live.
const REMOVED = [
  'indexedDB',
  'caches',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'importScripts',
  'fetch',
]

function lockDown() {
  const fetchPackage = fetch.bind(self)
  for (const name of REMOVED) remove(self, name)
  remove(StorageManager.prototype, 'getDirectory')
  Object.defineProperty(self, 'fetch', {
    value: (input: RequestInfo | URL, options?: RequestInit) => {
      const request = new Request(input, options)
      return request.url.startsWith(indexURL)
        ? fetchPackage(request)
        : Promise.reject(new TypeError(`Network access is blocked: ${request.url}`))
    },
  })
}

function remove(target: object, name: string) {
  for (let o: object | null = target; o; o = Object.getPrototypeOf(o)) {
    if (Object.hasOwn(o, name)) delete (o as Record<string, unknown>)[name]
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
