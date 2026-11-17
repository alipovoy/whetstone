import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView } from 'codemirror'
import { describe, expect, it, vi } from 'vitest'
import type { TopicFile } from '@/content/schema'
import type { RunnerStatus, TestResult } from '@/runner/types'
import { AttemptSchema, gradeAttempt, startAttempt, type Attempt } from '@/core/attempt'
import { PROBLEM_TEMPLATE } from '@/core/bridge'
import { itemText, topicFromFile, type TopicRecord } from '@/core/topics'
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
  questions: [],
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
  const put = vi.fn<(attempt: Attempt) => Promise<void>>(async () => undefined)
  const topics = {
    put: vi.fn<(topic: TopicRecord) => Promise<void>>(async () => undefined),
    delete: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  }
  render(
    <App
      runner={runner}
      storage={{
        store: { attempts: { put }, topics },
        attempts: [],
        topics: [topicFromFile(topic, 0)],
        skipped: 0,
        ...storage,
      }}
    />,
  )
  return Object.assign(put, { topics })
}

async function startFirst(runner: AppRunner = fakeRunner()) {
  const put = renderApp(runner)
  await userEvent.click(screen.getByRole('button', { name: 'Start First problem' }))
  return put
}

const problemRow = (title: string) =>
  within(screen.getByRole('region', { name: 'Problems' })).getByRole('listitem', { name: title })

describe('App', () => {
  it('lists the problems, opens one on Start with its statement sanitised, and warms up Python', async () => {
    const runner = fakeRunner()
    renderApp(runner)
    expect(runner.warmUp).toHaveBeenCalled()
    expect(problemRow('First problem')).toHaveTextContent('Easy')
    expect(screen.queryByRole('button', { name: /Resume/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Start First problem' }))
    expect(screen.getByRole('heading', { name: /First problem/ })).toBeInTheDocument()
    expect(screen.getByText('x').tagName).toBe('STRONG')
    expect(document.querySelector('[onerror]')).toBeNull()
  })

  it('runs only the visible tests', async () => {
    const runner = fakeRunner()
    await startFirst(runner)
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
    await startFirst(runner)
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
    await startFirst(runner)
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
    await startFirst(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(grade).toHaveTextContent("ImportError: cannot import name 'f'")
    expect(grade).not.toHaveTextContent('hidden_tests.py')
  })

  it('shows the output of a run', async () => {
    await startFirst()
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByRole('region', { name: 'Output' })).toHaveTextContent('hello')
  })

  it('returns to the problem list from the header', async () => {
    await startFirst()
    await userEvent.click(screen.getByRole('link', { name: 'Whetstone' }))
    expect(problemRow('Second problem')).toBeInTheDocument()
  })

  it('lowers the maximum score with each hint and caps the grade', async () => {
    const runner = fakeRunner()
    runner.test.mockResolvedValueOnce({
      ...graded,
      tests: graded.tests.map((t) => ({ ...t, passed: true })),
    })
    await startFirst(runner)
    await userEvent.click(screen.getByRole('button', { name: 'Show hint 1 (max score 90)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show hint 2 (max score 75)' }))
    expect(screen.getByRole('region', { name: 'Hints' })).toHaveTextContent('Hint 2. 2')
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(grade).toHaveTextContent('Score: 75 / 100')
    expect(grade).toHaveTextContent('hints capped the score at 75')
  })

  it('saves the attempt, then shows the reference solution and the last score after a grade', async () => {
    const put = await startFirst()
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ problem: 'one', hints_used: 0 }))
    expect(screen.queryByText('Reference solution')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    await screen.findByRole('region', { name: 'Grade' })
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ problem: 'one', grade: expect.objectContaining({ score: 50 }) }),
    )
    expect(screen.getByText('Reference solution')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Whetstone' }))
    expect(problemRow('First problem')).toHaveTextContent('Last score 50')
  })

  it('saves a grade that reads back, even when the clock moves during grading', async () => {
    let clock = 1_000
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 7))
    const put = await startFirst()
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    await screen.findByRole('region', { name: 'Grade' })
    now.mockRestore()
    expect(AttemptSchema.safeParse(put.mock.lastCall![0]).success).toBe(true)
  })

  it('resumes an unfinished attempt with its code and hints, or starts afresh', async () => {
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
    expect(problemRow('First problem')).toHaveTextContent('Last score 50')
    expect(screen.queryByRole('button', { name: 'Resume First problem' })).toBeNull()
    expect(problemRow('Second problem')).toHaveTextContent('In progress')

    await userEvent.click(screen.getByRole('button', { name: 'Resume Second problem' }))
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toHaveTextContent('return 2')
    expect(screen.getByRole('region', { name: 'Hints' })).toHaveTextContent('Hint 1.')

    await userEvent.click(screen.getByRole('link', { name: 'Whetstone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start over Second problem' }))
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toHaveTextContent('pass')
    expect(screen.getByRole('region', { name: 'Hints' })).not.toHaveTextContent('Hint 1.')
  })

  it('warns when work cannot be saved', () => {
    renderApp(fakeRunner(), { store: null, error: 'IndexedDB is unavailable', skipped: 2 })
    expect(
      screen.getByText(/Your work is not being saved: IndexedDB is unavailable/),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 saved records could not be read/)).toBeInTheDocument()
  })
})

describe('Topics', () => {
  const allPass: TestResult = {
    ...graded,
    tests: graded.tests.map((t) => ({ ...t, passed: true })),
  }
  const written = (title: string) => ({
    ...JSON.parse(itemText(topic.problems[0], topic.topic.concepts)),
    concept: { name: 'Strings', group: 'Basics' },
    wordings: [{ ...topic.problems[0].wordings[0], title }],
  })

  async function openTopic(name: string) {
    await userEvent.click(screen.getByRole('link', { name: 'Topics' }))
    await userEvent.click(screen.getByRole('button', { name: `Open ${name}` }))
  }

  // jsdom cannot type into CodeMirror, so the text goes in through the editor itself.
  const problemEditor = () =>
    EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Problem JSON' }))!

  async function submit(text: string, button = 'Add') {
    const view = problemEditor()
    act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }))
    await userEvent.click(screen.getByRole('button', { name: button }))
  }

  it('creates a topic, adds checked problems from a chat answer and serves them', async () => {
    const runner = fakeRunner()
    runner.test
      .mockResolvedValueOnce(allPass)
      .mockResolvedValueOnce(graded)
      .mockResolvedValueOnce(allPass)
      .mockResolvedValueOnce(graded)
    const put = renderApp(runner)
    await userEvent.click(screen.getByRole('link', { name: 'Topics' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New topic name' }), 'Strings')
    await userEvent.click(screen.getByRole('button', { name: 'Create topic' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Strings')

    await userEvent.click(screen.getByRole('button', { name: 'New problem' }))
    const answer = JSON.stringify({ problems: [written('Reverse words'), written('Count vowels')] })
    await submit(`Sure:\n\`\`\`json\n${answer}\n\`\`\``)

    const problems = await screen.findByRole('region', { name: 'Topic problems' })
    await within(problems).findByRole('listitem', { name: 'Reverse words' })
    expect(within(problems).getByRole('listitem', { name: 'Count vowels' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Problem JSON' })).toBeNull()
    expect(runner.test).toHaveBeenNthCalledWith(
      1,
      topic.problems[0].reference_solution,
      topic.problems[0].tests,
      [],
      12_000,
    )
    expect(runner.test).toHaveBeenNthCalledWith(
      2,
      topic.problems[0].starter_code,
      topic.problems[0].tests,
      [],
      12_000,
    )
    expect(screen.getByRole('region', { name: 'Concepts' })).toHaveTextContent('Strings (Basics)')
    expect(put.topics.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'Strings',
        problems: [
          expect.objectContaining({ concept: 'strings', source: 'user' }),
          expect.objectContaining({ concept: 'strings', source: 'user' }),
        ],
      }),
    )
    const copy = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: copy },
      configurable: true,
    })
    await userEvent.click(screen.getByText('Chat bot request for problems'))
    await userEvent.click(screen.getByText('Problem template'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Copy Chat bot request for problems' }),
    )
    expect(copy).toHaveBeenLastCalledWith(
      expect.stringContaining('do not repeat them:\n- Reverse words\n- Count vowels'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Copy Problem template' }))
    expect(copy).toHaveBeenLastCalledWith(PROBLEM_TEMPLATE)
    expect(screen.getByRole('button', { name: 'Copy Problem template' })).toHaveTextContent(
      'Copied',
    )

    await userEvent.click(screen.getByRole('link', { name: 'Whetstone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start Reverse words' }))
    expect(screen.getByRole('heading', { name: /Reverse words/ })).toBeInTheDocument()
  })

  it('adds nothing when one problem fails its check, and says which and why', async () => {
    const runner = fakeRunner()
    runner.test
      .mockResolvedValueOnce(allPass)
      .mockResolvedValueOnce(graded)
      .mockResolvedValueOnce(graded)
      .mockResolvedValueOnce(graded)
    renderApp(runner)
    await openTopic('Topic')
    await userEvent.click(screen.getByRole('button', { name: 'New problem' }))
    await submit(JSON.stringify([written('Good'), written('Broken')]))

    const editor = screen.getByRole('region', { name: 'New problem' })
    expect(await within(editor).findByText(/Nothing was added/)).toBeInTheDocument()
    expect(editor).toHaveTextContent('Problem 2 “Broken”:the reference solution fails test_b')
    expect(editor).not.toHaveTextContent('Problem 1')
    const problems = screen.getByRole('region', { name: 'Topic problems' })
    expect(within(problems).queryByRole('listitem', { name: 'Good' })).toBeNull()
  })

  it('reports text that is not JSON, and Cancel closes the editor', async () => {
    renderApp(fakeRunner())
    await openTopic('Topic')
    await userEvent.click(screen.getByRole('button', { name: 'New problem' }))
    await submit('I cannot help with that.')
    expect(screen.getByText(/Not valid JSON/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox', { name: 'Problem JSON' })).toBeNull()
  })

  it('edits a served problem in place after the check', async () => {
    const runner = fakeRunner()
    runner.test.mockResolvedValueOnce(allPass).mockResolvedValueOnce(graded)
    renderApp(runner)
    await openTopic('Topic')
    await userEvent.click(screen.getByRole('button', { name: 'Edit First problem' }))
    const text = problemEditor().state.doc.toString()
    await submit(text.replace('"First problem"', '"Renamed problem"'), 'Save')

    const problems = screen.getByRole('region', { name: 'Topic problems' })
    await within(problems).findByRole('listitem', { name: 'Renamed problem' })
    expect(
      within(problems)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Renamed problem', 'Second problem'])
  })

  it('adds, edits and deletes choice questions without running Python', async () => {
    const runner = fakeRunner()
    renderApp(runner)
    await openTopic('Topic')
    const question = (summary: string) => ({
      concept: { name: 'C', group: 'G' },
      type: 'multiple',
      wordings: [{ text: 'Pick', options: ['a', 'b', 'c'] }],
      answers: [0, 2],
      explanation: 'Because',
      summary,
    })
    expect(screen.queryByRole('button', { name: 'New question' })).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Questions' }))
    await userEvent.click(screen.getByRole('button', { name: 'New question' }))
    const editor = () =>
      EditorView.findFromDOM(screen.getByRole('textbox', { name: 'Question JSON' }))!
    const write = (text: string) => {
      const view = editor()
      act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }))
    }
    write(
      JSON.stringify({ questions: [question('Good'), { ...question('Bad'), answers: [0, 1, 2] }] }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('region', { name: 'New question' })).toHaveTextContent(
      'Question 2 “Bad”:at least one option must be wrong',
    )

    write(JSON.stringify({ questions: [question('Good')] }))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    const questions = screen.getByRole('region', { name: 'Topic questions' })
    expect(within(questions).getByRole('listitem', { name: 'Good' })).toHaveTextContent(
      'Multiple choice',
    )
    expect(runner.test).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Good' }))
    write(editor().state.doc.toString().replace('"Good"', '"Better"'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(within(questions).getByRole('listitem', { name: 'Better' })).toBeInTheDocument()

    const copy = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: copy },
      configurable: true,
    })
    await userEvent.click(screen.getByText('Chat bot request for questions'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Copy Chat bot request for questions' }),
    )
    expect(copy).toHaveBeenLastCalledWith(expect.stringContaining('do not repeat them:\n- Better'))

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Better' }))
    expect(within(questions).queryByRole('listitem')).toBeNull()
  })

  it('renames, disables and deletes a topic', async () => {
    const put = renderApp(fakeRunner())
    await openTopic('Topic')
    const name = screen.getByRole('textbox', { name: 'Topic name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Renamed')

    await userEvent.click(screen.getByRole('switch', { name: 'Enabled' }))
    await userEvent.click(screen.getByRole('link', { name: 'Whetstone' }))
    expect(screen.queryByRole('listitem', { name: 'First problem' })).toBeNull()
    expect(screen.getByText(/No problems to practise/)).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openTopic('Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Delete topic' }))
    expect(put.topics.delete).toHaveBeenCalledWith('t')
    expect(screen.getByText('No topics yet.')).toBeInTheDocument()
  })
})
