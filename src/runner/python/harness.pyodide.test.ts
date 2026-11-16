// @vitest-environment node
import { loadPyodide, type PyodideInterface } from 'pyodide'
import { beforeAll, describe, expect, it } from 'vitest'
import { builtInTopic } from '@/content'
import type { HarnessRun, HarnessTests } from '../protocol'
import { RUN_LIMIT_MS } from '../types'
import harness from './harness.py?raw'

let py: PyodideInterface

beforeAll(async () => {
  py = await loadPyodide()
  py.runPython(harness)
}, 60_000)

const runTests = (code: string, tests: string, only: string[] = []) =>
  JSON.parse(py.globals.get('run_tests')(code, tests, JSON.stringify(only))) as HarnessTests

describe('harness inside Pyodide', () => {
  it('runs code and captures output and errors', () => {
    const result = JSON.parse(
      py.globals.get('run_code')('print("hi")\nraise ValueError("boom")'),
    ) as HarnessRun
    expect(result.stdout).toBe('hi\n')
    expect(result.error).toContain('solution.py, line 2')
    expect(result.error).toMatch(/ValueError: boom$/)
  })

  it('runs tests against a solution', () => {
    const code = 'def add(a, b):\n    return a + b\n'
    const tests = [
      'from solution import *',
      'def test_ok():',
      '    """Adds."""',
      '    assert add(1, 2) == 3',
      'def test_bad():',
      '    assert add(1, 2) == 4, "expected 4"',
    ].join('\n')
    const result = runTests(code, tests)
    expect(result.tests.map((t) => [t.name, t.passed, t.doc])).toEqual([
      ['test_ok', true, 'Adds.'],
      ['test_bad', false, ''],
    ])
    expect(result.tests[1].error).toMatch(/^AssertionError: expected 4\n/)
  })

  it('runs only the named tests', () => {
    const tests = 'def test_a():\n    pass\ndef test_b():\n    pass\n'
    expect(runTests('', tests, ['test_b']).tests.map((t) => t.name)).toEqual(['test_b'])
  })
})

// Python in the browser is slower than CPython in CI: reference solutions must stay well inside
// the time the app allows.
describe.each(builtInTopic.problems.map((p) => [p.id, p] as const))(
  'built-in problem %s inside Pyodide',
  (_, problem) => {
    it('passes every test with the reference solution, in good time', () => {
      const result = runTests(problem.reference_solution, problem.tests)
      expect(result.load_error).toBeNull()
      expect(result.tests_error).toBeNull()
      expect(result.tests.filter((t) => !t.passed).map((t) => `${t.name}: ${t.error}`)).toEqual([])
      expect(result.tests.reduce((sum, t) => sum + t.ms, 0)).toBeLessThan(RUN_LIMIT_MS / 4)
    })

    it('fails at least one test with the starter code', () => {
      const result = runTests(problem.starter_code, problem.tests)
      expect(result.tests.every((t) => t.passed) && !result.load_error).toBe(false)
    })
  },
)
