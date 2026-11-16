import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TopicFile } from '@/content/schema'
import type { RunnerStatus, TestResult } from '@/runner/types'
import { App, type AppRunner } from './App'

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

describe('App', () => {
  it('shows the first problem with its statement sanitised, and warms up Python', () => {
    const runner = fakeRunner()
    render(<App topic={topic} runner={runner} />)
    expect(screen.getByRole('heading', { name: /First problem/ })).toBeInTheDocument()
    expect(screen.getByText('x').tagName).toBe('STRONG')
    expect(document.querySelector('[onerror]')).toBeNull()
    expect(runner.warmUp).toHaveBeenCalled()
  })

  it('runs only the visible tests', async () => {
    const runner = fakeRunner()
    render(<App topic={topic} runner={runner} />)
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
    render(<App topic={topic} runner={runner} />)
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
    render(<App topic={topic} runner={runner} />)
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
    render(<App topic={topic} runner={runner} />)
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(grade).toHaveTextContent("ImportError: cannot import name 'f'")
    expect(grade).not.toHaveTextContent('hidden_tests.py')
  })

  it('shows the output of a run', async () => {
    render(<App topic={topic} runner={fakeRunner()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('region', { name: 'Output' })).toHaveTextContent('hello')
  })

  it('moves to the next problem and back to the first after the last', async () => {
    render(<App topic={topic} runner={fakeRunner()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Next problem' }))
    expect(screen.getByRole('heading', { name: /Second problem/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next problem' }))
    expect(screen.getByRole('heading', { name: /First problem/ })).toBeInTheDocument()
  })
})
