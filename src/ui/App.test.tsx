import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TopicFile } from '@/content/schema'
import type { RunnerStatus, TestResult } from '@/runner/types'
import { gradeAttempt, startAttempt } from '@/core/attempt'
import { App, type AppRunner, type AppStorage } from './App'

const problem = (id: string, title: string): TopicFile['problems'][number] => ({
  id,
  concept: 'c',
  difficulty: 'Easy',
  language: 'python',
  wordings: [
    {
      title,
      statement: 'Return **x**.<img src=x onerror="alert(1)">',
      examples: [{ input: 'x = 1', output: '1' }],
      constraints: [],
    },
  ],
  starter_code: 'def f(x):\n    pass',
  reference_solution: 'def f(x):\n    return x',
  tests: 'def test_a():\n    pass\ndef test_b():\n    pass\n',
  visible_tests: ['test_a'],
  hints: ['1', '2', '3'],
  summary: 's',
  source: 'built-in',
})

const topic: TopicFile = {
  topic: { id: 't', name: 'Topic', concepts: [{ id: 'c', name: 'C', group: 'G' }] },
  problems: [problem('one', 'First problem'), problem('two', 'Second problem')],
}

const graded: TestResult = {
  stdout: '',
  tests: [
    { name: 'test_a', doc: 'Visible case', passed: true, stdout: '' },
    {
      name: 'test_b',
      doc: 'Secret case',
      passed: false,
      message: 'AssertionError: wrong\n  hidden_tests.py, line 4, in test_b\n    assert f(2) == 2',
      stdout: '',
    },
  ],
}

const ready: RunnerStatus = { state: 'ready' }

function fakeRunner(): AppRunner & { test: ReturnType<typeof vi.fn> } {
  return {
    warmUp: vi.fn(),
    status: () => ready,
    subscribe: () => () => undefined,
    run: vi.fn(async () => ({ stdout: 'hello\n' })),
    test: vi.fn(async () => graded),
  }
}

function renderApp(runner: AppRunner, storage: Partial<AppStorage> = {}) {
  const put = vi.fn(async () => undefined)
  render(
    <App
      topic={topic}
      runner={runner}
      storage={{ store: { put }, attempts: [], skipped: 0, ...storage }}
    />,
  )
  return put
}

describe('App', () => {
  it('shows the first problem with its statement sanitised, and warms up Python', () => {
    const runner = fakeRunner()
    renderApp(runner)
    expect(screen.getByRole('heading', { name: /First problem/ })).toBeInTheDocument()
    expect(screen.getByText('x').tagName).toBe('STRONG')
    expect(document.querySelector('[onerror]')).toBeNull()
    expect(runner.warmUp).toHaveBeenCalled()
  })

  it('runs only the visible tests', async () => {
    const runner = fakeRunner()
    renderApp(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    expect(runner.test).toHaveBeenCalledWith(
      'def f(x):\n    pass',
      topic.problems[0].tests,
      ['test_a'],
      12_000,
    )
  })

  it('grades all tests, shows the score and only the first line of a hidden failure', async () => {
    const runner = fakeRunner()
    renderApp(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(runner.test).toHaveBeenCalledWith(expect.any(String), expect.any(String), [], 12_000)
    expect(within(grade).getByRole('heading')).toHaveTextContent('Score: 50 / 100')
    expect(grade).toHaveTextContent('1 of 2 tests passed')
    expect(grade).toHaveTextContent('test_a — Visible case')
    expect(grade).toHaveTextContent('Hidden test')
    expect(grade).toHaveTextContent('AssertionError: wrong')
    expect(grade).not.toHaveTextContent('hidden_tests.py')
    expect(grade).not.toHaveTextContent('Secret case')
  })

  it('scores a grade that runs out of time as 0', async () => {
    const runner = fakeRunner()
    runner.test.mockResolvedValueOnce({
      tests: [],
      stdout: '',
      error: 'Time limit exceeded',
      timedOut: true,
    })
    renderApp(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(grade).toHaveTextContent('Score: 0 / 100')
    expect(grade).toHaveTextContent('Time limit exceeded')
  })

  it('shows only the first line of an error in the tests module', async () => {
    const runner = fakeRunner()
    runner.test.mockResolvedValueOnce({
      tests: [],
      stdout: '',
      testsError: "ImportError: cannot import name 'f'\n  hidden_tests.py, line 1, in <module>",
    })
    renderApp(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(grade).toHaveTextContent("ImportError: cannot import name 'f'")
    expect(grade).not.toHaveTextContent('hidden_tests.py')
  })

  it('shows the output of a run', async () => {
    renderApp(fakeRunner())
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('region', { name: 'Output' })).toHaveTextContent('hello')
  })

  it('moves to the next problem and back to the first after the last', async () => {
    renderApp(fakeRunner())
    await userEvent.click(screen.getByRole('button', { name: 'Next problem' }))
    expect(screen.getByRole('heading', { name: /Second problem/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next problem' }))
    expect(screen.getByRole('heading', { name: /First problem/ })).toBeInTheDocument()
  })

  it('lowers the maximum score with each hint and caps the grade', async () => {
    const runner = fakeRunner()
    runner.test.mockResolvedValueOnce({
      ...graded,
      tests: graded.tests.map((t) => ({ ...t, passed: true })),
    })
    renderApp(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Show hint 1 (max score 90)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show hint 2 (max score 75)' }))
    expect(screen.getByRole('region', { name: 'Hints' })).toHaveTextContent('Hint 2. 2')
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(grade).toHaveTextContent('Score: 75 / 100')
    expect(grade).toHaveTextContent('hints capped the score at 75')
  })

  it('saves the attempt, then shows the reference solution and the last score after a grade', async () => {
    const put = renderApp(fakeRunner())
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ problem: 'one', hints_used: 0 }))
    expect(screen.queryByText('Reference solution')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    await screen.findByRole('region', { name: 'Grade' })
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ problem: 'one', grade: expect.objectContaining({ score: 50 }) }),
    )
    expect(screen.getByText('Reference solution')).toBeInTheDocument()
    const list = screen.getByRole('navigation', { name: 'Problems' })
    expect(within(list).getByRole('button', { name: /First problem/ })).toHaveTextContent(
      'Last score 50',
    )
  })

  it('resumes the problem worked on last, with its code and hints', () => {
    const open = {
      ...startAttempt(crypto.randomUUID(), 't', topic.problems[1], 'def f(x):\n    return 2', 5),
      hints_used: 1,
    }
    const done = gradeAttempt(
      startAttempt(crypto.randomUUID(), 't', topic.problems[0], '', 1),
      topic.topic,
      topic.problems[0],
      { tests: graded.tests, loaded: true },
      2,
    )
    renderApp(fakeRunner(), { attempts: [done, open] })
    expect(screen.getByRole('heading', { name: /Second problem/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toHaveTextContent('return 2')
    expect(screen.getByRole('region', { name: 'Hints' })).toHaveTextContent('Hint 1.')
    const list = screen.getByRole('navigation', { name: 'Problems' })
    expect(within(list).getByRole('button', { name: /First problem/ })).toHaveTextContent(
      'Last score 50',
    )
    expect(within(list).getByRole('button', { name: /Second problem/ })).toHaveTextContent(
      'In progress',
    )
  })

  it('warns when work cannot be saved', () => {
    renderApp(fakeRunner(), { store: null, error: 'IndexedDB is unavailable', skipped: 2 })
    expect(
      screen.getByText(/Your work is not being saved: IndexedDB is unavailable/),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 saved attempts could not be read/)).toBeInTheDocument()
  })
})
