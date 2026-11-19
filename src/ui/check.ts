import { checkErrors, type CheckRun } from '@/core/topics'
import type { Problem } from '@/content/schema'
import { RUN_LIMIT_MS, type TestResult } from '@/runner/types'
import type { Runner } from './ProblemPage'

// Runs the reference and the starter against the tests; the errors say why it is not served.
export async function checkProblem(
  runner: Pick<Runner, 'test'>,
  problem: Problem,
): Promise<string[]> {
  const reference = await runner.test(problem.reference_solution, problem.tests, [], RUN_LIMIT_MS)
  // Python failing to start says nothing about the problem.
  if (reference.error && !reference.timedOut)
    throw new Error(`Python could not run: ${reference.error}`)
  const starter = await runner.test(problem.starter_code, problem.tests, [], RUN_LIMIT_MS)
  return checkErrors(problem, checkRun(reference), checkRun(starter))
}

function checkRun(result: TestResult): CheckRun {
  return { tests: result.tests, error: result.error ?? result.loadError ?? result.testsError }
}
