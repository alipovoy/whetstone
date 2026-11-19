import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorView } from 'codemirror'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TopicFile } from '@/content/schema'
import type { RunnerStatus, RunResult, TestResult } from '@/runner/types'
import { AttemptSchema, gradeAttempt, startAttempt, type Attempt } from '@/core/attempt'
import { PROBLEM_TEMPLATE } from '@/core/bridge'
import { candidates, startQuiz, submitQuiz, type Quiz } from '@/core/quiz'
import { itemText, topicFromFile, type TopicRecord } from '@/core/topics'
import { App, type AppRunner, type AppStorage } from './App'
import { href, type Route } from './route'
import { applyTheme, setScheme, setThemeChoice } from './theme'

// Settings has a Coding problems entry too.
const mainLink = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name })

const problem = (id: string, title: string): TopicFile['problems'][number] => ({
  id,
  concepts: ['c'],
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

const conceptsToggle = () => screen.getByRole('button', { name: /^Concepts / })

const topic: TopicFile = {
  topic: { id: 't', name: 'Topic', concepts: [{ id: 'c', name: 'C', group: 'G' }] },
  problems: [problem('one', 'First problem'), problem('two', 'Second problem')],
  questions: [],
}

const choiceQuestion = (
  id: string,
  type: 'single' | 'multiple',
  options: string[],
  answers: number[],
  difficulty: 'Easy' | 'Medium' | 'Hard' = 'Easy',
): TopicFile['questions'][number] => ({
  id,
  type,
  difficulty,
  concepts: ['c'],
  wordings: [{ text: `Text of ${id}`, options }],
  answers,
  explanation: `Why ${id}`,
  summary: id,
  source: 'user',
})
const quizTopic: TopicFile = {
  ...topic,
  questions: [
    choiceQuestion('pick-one', 'single', ['wrong', 'right'], [1]),
    choiceQuestion('pick-all', 'multiple', ['a', 'b', 'c', 'd'], [0, 2], 'Hard'),
  ],
}
const quizOf = (types: ('single' | 'multiple')[], timed = false) => ({
  questions: candidates([quizTopic], {
    topics: ['t'],
    offAreas: [],
    types,
    difficulties: ['Easy', 'Medium', 'Hard'],
  }),
  timed,
})

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

function renderApp(
  runner: AppRunner,
  storage: Partial<AppStorage> = {},
  at: Route = { page: 'problems' },
) {
  window.history.replaceState(null, '', href(at))
  const put = vi.fn<(attempt: Attempt) => Promise<void>>(async () => undefined)
  const deleteAttempt = vi.fn<(id: string) => Promise<void>>(async () => undefined)
  const topics = {
    put: vi.fn<(topic: TopicRecord) => Promise<void>>(async () => undefined),
    delete: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  }
  const quizzes = {
    put: vi.fn<(quiz: Quiz) => Promise<void>>(async () => undefined),
    delete: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  }
  render(
    <App
      runner={runner}
      storage={{
        store: { attempts: { put, delete: deleteAttempt }, topics, quizzes },
        attempts: [],
        topics: [topicFromFile(topic, 0)],
        quizzes: [],
        skipped: 0,
        ...storage,
      }}
    />,
  )
  return Object.assign(put, { topics, quizzes, deleteAttempt })
}

async function startFirst(runner: AppRunner = fakeRunner()) {
  const put = renderApp(runner)
  await userEvent.click(screen.getByRole('button', { name: 'Start First problem' }))
  return put
}

const problemRow = (title: string) =>
  within(screen.getByRole('region', { name: 'Problems' })).getByRole('listitem', { name: title })

describe('App', () => {
  afterEach(() => {
    localStorage.removeItem('whetstone.panes')
    localStorage.removeItem('whetstone.results')
  })

  it('lists the problems, opens one on Start with its statement sanitised, and warms up Python', async () => {
    const runner = fakeRunner()
    renderApp(runner)
    expect(runner.warmUp).toHaveBeenCalled()
    expect(screen.queryByText('Python is ready')).toBeNull()
    expect(problemRow('First problem')).toHaveTextContent('Easy')
    expect(screen.queryByRole('button', { name: /Resume/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Start First problem' }))
    expect(screen.getByRole('heading', { name: /First problem/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Python is ready')
    expect(screen.getByText('x').tagName).toBe('STRONG')
    expect(document.querySelector('[onerror]')).toBeNull()
  })

  it('shows the topic of a problem and each of its concepts', () => {
    const concepts = [...topic.topic.concepts, { id: 'd', name: 'D', group: 'H' }]
    const both = { ...problem('both', 'Both concepts'), concepts: ['c', 'd'] }
    renderApp(fakeRunner(), {
      topics: [
        topicFromFile({ ...topic, topic: { ...topic.topic, concepts }, problems: [both] }, 0),
      ],
    })
    const row = problemRow('Both concepts')
    expect(row).toHaveTextContent('Topic')
    expect(
      within(within(row).getByRole('list', { name: 'Concepts' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['C', 'D'])
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

  it('collapses the results, remembers it, and opens them for the next result', async () => {
    await startFirst()
    await userEvent.click(screen.getByRole('button', { name: 'Run tests' }))
    const toggle = await screen.findByRole('button', { name: /^Results/ })
    expect(toggle).toHaveTextContent('Tests 1 of 2 passed')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Test results' })).toBeNull()
    expect(localStorage.getItem('whetstone.results')).toBe('collapsed')

    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    await screen.findByRole('region', { name: 'Grade' })
    expect(screen.getByRole('button', { name: /^Results/ })).toHaveTextContent('Score 50')
    expect(localStorage.getItem('whetstone.results')).toBe('collapsed')
  })

  it('opens a problem with the results collapsed when last left so', () => {
    localStorage.setItem('whetstone.results', 'collapsed')
    const done = gradeAttempt(
      startAttempt(crypto.randomUUID(), 't', topic.problems[0], '', 1),
      topic.topic,
      topic.problems[0],
      { tests: graded.tests, loaded: true },
      2,
    )
    renderApp(fakeRunner(), { attempts: [done] }, { page: 'solve', topic: 't', problem: 'one' })
    const toggle = screen.getByRole('button', { name: /^Results/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('Score 50')
    expect(screen.queryByRole('region', { name: 'Grade' })).toBeNull()
  })

  it('returns to the problem list from the menu, and Home from the logo', async () => {
    await startFirst()
    await userEvent.click(mainLink('Coding problems'))
    expect(problemRow('Second problem')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Whetstone' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Practise')
    expect(window.location.hash).toBe('#/')
  })

  it('marks the menu item of the current page', async () => {
    renderApp(fakeRunner())
    const menu = () => within(screen.getByRole('navigation', { name: 'Main' }))
    const current = () => menu().getByRole('link', { current: 'page' })
    expect(current()).toHaveTextContent('Coding problems')
    await userEvent.click(menu().getByRole('link', { name: 'Settings' }))
    expect(current()).toHaveTextContent('Settings')
    await userEvent.click(menu().getByRole('link', { name: 'Reports' }))
    expect(current()).toHaveTextContent('Reports')
    await userEvent.click(menu().getByRole('link', { name: 'Quizzes' }))
    expect(current()).toHaveTextContent('Quizzes')
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
    await userEvent.click(mainLink('Coding problems'))
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

  it('resumes an unfinished attempt with its code and hints', async () => {
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
  })

  it('discards every open attempt after a confirm, back to the status of the last grade', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const at = (index: number, time: number) =>
      startAttempt(crypto.randomUUID(), 't', topic.problems[index], '', time)
    const done = gradeAttempt(
      at(1, 1),
      topic.topic,
      topic.problems[1],
      { tests: graded.tests, loaded: true },
      2,
    )
    const left = [at(0, 3), at(1, 3), at(1, 4)]
    const store = renderApp(fakeRunner(), { attempts: [done, ...left] })
    expect(screen.queryByRole('button', { name: 'Start First problem' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Discard Second problem' }))
    expect(confirm).toHaveBeenCalledWith('Discard your work on "Second problem"?')
    expect(problemRow('Second problem')).toHaveTextContent('In progress')
    expect(store.deleteAttempt).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Discard Second problem' }))
    expect(problemRow('Second problem')).toHaveTextContent('Needs work')
    expect(problemRow('Second problem')).toHaveTextContent('Last score 50')
    expect(screen.queryByRole('button', { name: 'Discard Second problem' })).toBeNull()
    expect(store.deleteAttempt.mock.calls.map(([id]) => id).toSorted()).toEqual(
      [left[1].id, left[2].id].toSorted(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Discard First problem' }))
    expect(problemRow('First problem')).toHaveTextContent('New')
    await userEvent.click(screen.getByRole('button', { name: 'Start First problem' }))
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toHaveTextContent('pass')
  })

  it('filters the problems, keeps the filter in the address and starts a random match', async () => {
    const done = gradeAttempt(
      startAttempt(crypto.randomUUID(), 't', topic.problems[0], '', 1),
      topic.topic,
      topic.problems[0],
      { tests: graded.tests, loaded: true },
      2,
    )
    renderApp(fakeRunner(), { attempts: [done] })
    const filters = screen.getByRole('region', { name: 'Filters' })
    expect(filters).toHaveTextContent('2 problems')
    expect(within(problemRow('First problem')).getByRole('img')).toHaveAccessibleName(
      '1 of 2 tests passed',
    )
    expect(problemRow('First problem')).toHaveTextContent('Needs work')
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'New')
    expect(window.location.hash).toBe('#/coding?status=new')
    expect(filters).toHaveTextContent('1 of 2 problems')
    expect(screen.queryByRole('listitem', { name: 'First problem' })).toBeNull()

    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    await userEvent.click(screen.getByRole('button', { name: 'Start a random one' }))
    random.mockRestore()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Second problem')

    window.history.back()
    await screen.findByRole('region', { name: 'Filters' })
    expect(window.location.hash).toBe('#/coding?status=new')
    await userEvent.type(screen.getByLabelText('Search'), 'nothing')
    await waitFor(() => expect(window.location.hash).toBe('#/coding?search=nothing&status=new'))
    expect(screen.getByText('No problems match these filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start a random one' })).toBeDisabled()
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Problems' })).getByRole('button', {
        name: 'Clear filters',
      }),
    )
    expect(window.location.hash).toBe('#/coding')
    expect(screen.getByLabelText('Search')).toHaveValue('')
    expect(problemRow('First problem')).toBeInTheDocument()
  })

  it('ignores a topic or concept in the address that no longer applies', async () => {
    const questionsOnly: TopicFile = {
      ...quizTopic,
      topic: { ...quizTopic.topic, id: 'q', name: 'Questions' },
      problems: [],
    }
    renderApp(
      fakeRunner(),
      { topics: [topicFromFile(topic, 0), topicFromFile(questionsOnly, 1)] },
      {
        page: 'problems',
        filter: { topic: 'gone', offConcepts: ['Gone'], difficulty: 'Easy' },
      },
    )
    expect(screen.getByRole('region', { name: 'Filters' })).toHaveTextContent('2 of 2 problems')
    expect(conceptsToggle()).toHaveTextContent('All concepts')
    expect(
      within(screen.getByLabelText('Topic'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All topics', 'Topic'])
    await userEvent.click(screen.getByRole('button', { name: 'Medium' }))
    expect(window.location.hash).toBe('#/coding?difficulty=Medium')
  })

  it('checks concepts under their areas, all or none, for the chosen topic', async () => {
    const other: TopicFile = {
      topic: { id: 'u', name: 'Other', concepts: [{ id: 'd', name: 'D', group: 'H' }] },
      problems: [{ ...problem('three', 'Third problem'), concepts: ['d'] }],
      questions: [],
    }
    renderApp(
      fakeRunner(),
      { topics: [topicFromFile(topic, 0), topicFromFile(other, 1)] },
      {
        page: 'problems',
      },
    )
    await userEvent.click(conceptsToggle())
    const menu = screen.getByRole('group', { name: 'G' }).parentElement!
    expect(
      within(menu)
        .getAllByRole('group')
        .map((g) => g.textContent),
    ).toEqual(['GC', 'HD'])
    expect(within(menu).getByRole('button', { name: 'All' })).toBeDisabled()

    await userEvent.click(within(menu).getByRole('checkbox', { name: 'C' }))
    expect(window.location.hash).toBe('#/coding?without=C')
    expect(conceptsToggle()).toHaveTextContent('D')
    expect(screen.queryByRole('listitem', { name: 'First problem' })).toBeNull()
    expect(problemRow('Third problem')).toBeInTheDocument()

    await userEvent.click(within(menu).getByRole('button', { name: 'Clear' }))
    expect(window.location.hash).toBe('#/coding?without=C&without=D')
    expect(conceptsToggle()).toHaveTextContent('No concepts')
    expect(screen.getByText('No problems match these filters')).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('button', { name: 'All' }))
    expect(window.location.hash).toBe('#/coding')

    await userEvent.click(within(menu).getByRole('checkbox', { name: 'C' }))
    await userEvent.selectOptions(screen.getByLabelText('Topic'), 'Other')
    expect(window.location.hash).toBe('#/coding?topic=u')
    expect(conceptsToggle()).toHaveTextContent('All concepts')

    await userEvent.click(within(menu).getByRole('checkbox', { name: 'H' }))
    expect(window.location.hash).toBe('#/coding?topic=u&without=D')
    expect(within(menu).getByRole('checkbox', { name: 'D' })).not.toBeChecked()
    await userEvent.click(within(menu).getByRole('checkbox', { name: 'H' }))
    expect(window.location.hash).toBe('#/coding?topic=u')
  })

  it('collapses either pane but not both, resizes them, and keeps the layout', async () => {
    await startFirst()
    const separator = screen.getByRole('separator', { name: 'Resize panes' })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
    separator.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '60')
    await userEvent.keyboard('{End}{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '75')

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Problem' }))
    expect(screen.queryByRole('region', { name: 'Problem' })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse Code' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand Problem' })).toHaveFocus()
    expect(JSON.parse(localStorage.getItem('whetstone.panes')!)).toEqual({
      leftPercent: 75,
      collapsed: 'left',
    })

    await userEvent.click(mainLink('Coding problems'))
    await userEvent.click(screen.getByRole('button', { name: 'Resume First problem' }))
    expect(screen.queryByRole('region', { name: 'Problem' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Expand Problem' }))
    expect(screen.getByRole('region', { name: 'Problem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Problem' })).toHaveFocus()
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '75')
  })

  it('keeps the editor while its pane is collapsed', async () => {
    await startFirst()
    const editor = screen.getByRole('textbox', { name: 'Solution code' })
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Code' }))
    expect(screen.queryByRole('textbox', { name: 'Solution code' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Expand Code' }))
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toBe(editor)
  })

  it('ignores a damaged pane layout', () => {
    localStorage.setItem('whetstone.panes', '{"leftPercent": "wide", "collapsed": "both"}')
    renderApp(fakeRunner(), {}, { page: 'solve', topic: 't', problem: 'one' })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('region', { name: 'Problem' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Code' })).toBeInTheDocument()
  })

  it('returns to the list as it was filtered once graded', async () => {
    renderApp(fakeRunner(), {}, { page: 'problems', filter: { status: 'new' } })
    await userEvent.click(screen.getByRole('button', { name: 'Start First problem' }))
    expect(screen.queryByRole('link', { name: 'Back to problems' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Grade' }))
    const grade = await screen.findByRole('region', { name: 'Grade' })
    expect(within(grade).getByRole('img')).toHaveAccessibleName('1 of 2 tests passed')
    expect(screen.getByRole('region', { name: 'Code' })).toHaveTextContent('Needs work')
    await userEvent.click(screen.getByRole('link', { name: 'Back to problems' }))
    expect(window.location.hash).toBe('#/coding?status=new')
    expect(screen.queryByRole('listitem', { name: 'First problem' })).toBeNull()
  })

  it('warns when work cannot be saved', () => {
    renderApp(fakeRunner(), { store: null, error: 'IndexedDB is unavailable', skipped: 2 })
    expect(
      screen.getByText(/Your work is not being saved: IndexedDB is unavailable/),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 saved records could not be read/)).toBeInTheDocument()
  })
})

describe('Layout', () => {
  afterEach(() => {
    setThemeChoice('system')
    setScheme('slate')
  })

  it('continues the latest unfinished problem from Home, and lists recent results', async () => {
    const open = startAttempt(
      crypto.randomUUID(),
      't',
      topic.problems[1],
      'def f(x):\n    return 2',
      5,
    )
    const done = gradeAttempt(
      startAttempt(crypto.randomUUID(), 't', topic.problems[0], '', 1),
      topic.topic,
      topic.problems[0],
      { tests: graded.tests, loaded: true },
      2,
    )
    const quiz = submitQuiz(startQuiz(crypto.randomUUID(), quizOf(['single']), 3), 4)
    renderApp(fakeRunner(), { attempts: [done, open], quizzes: [quiz] }, { page: 'home' })
    const recent = screen.getByRole('region', { name: 'Recent' })
    expect(
      within(recent)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringMatching(/^Quiz: Topic.*1 questions.*0$/),
      expect.stringMatching(/^First problem.*Coding problem.*50$/),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(window.location.hash).toBe('#/coding/t/two')
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toHaveTextContent('return 2')
  })

  it('starts a random problem from Home', async () => {
    const put = renderApp(fakeRunner(), {}, { page: 'home' })
    expect(within(screen.getByRole('region', { name: 'Recent' })).getByText(/Nothing yet/))
    await userEvent.click(screen.getByRole('button', { name: 'Random problem' }))
    expect(put).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Grade' })).toBeInTheDocument()
  })

  it('opens the latest attempt at the address of a problem, as after a reload', () => {
    const open = startAttempt(
      crypto.randomUUID(),
      't',
      topic.problems[0],
      'def f(x):\n    return 7',
      5,
    )
    renderApp(fakeRunner(), { attempts: [open] }, { page: 'solve', topic: 't', problem: 'one' })
    expect(screen.getByRole('textbox', { name: 'Solution code' })).toHaveTextContent('return 7')
  })

  it('says when the problem or quiz of an address is gone', () => {
    renderApp(fakeRunner(), {}, { page: 'solve', topic: 't', problem: 'gone' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'This problem is not available',
    )
  })

  it('switches the theme from the top bar and keeps the choice', async () => {
    renderApp(fakeRunner(), {}, { page: 'appearance' })
    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(document.documentElement).toHaveAttribute('data-bs-theme', 'dark')
    expect(localStorage.getItem('whetstone.theme')).toBe('dark')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: /System/ }))
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches the colour scheme in Appearance and restores it on load', async () => {
    renderApp(fakeRunner(), {}, { page: 'appearance' })
    await userEvent.click(screen.getByRole('radio', { name: /Rainbow/ }))
    expect(document.documentElement).toHaveAttribute('data-ws-scheme', 'rainbow')
    expect(localStorage.getItem('whetstone.scheme')).toBe('rainbow')
    expect(document.querySelector('.ws-app')).toHaveAttribute('data-ws-section', 'settings')

    localStorage.setItem('whetstone.scheme', 'mint')
    act(() => applyTheme())
    expect(screen.getByRole('radio', { name: /Mint/ })).toBeChecked()
    localStorage.setItem('whetstone.scheme', 'unknown')
    act(() => applyTheme())
    expect(screen.getByRole('radio', { name: /Slate/ })).toBeChecked()
  })

  it('shows Reports with a menu of its reports', async () => {
    renderApp(fakeRunner(), {}, { page: 'reports', section: 'coding' })
    const side = within(screen.getByRole('navigation', { name: 'Reports' }))
    await userEvent.click(side.getByRole('link', { name: 'Quizzes' }))
    expect(side.getByRole('link', { current: 'page' })).toHaveTextContent('Quizzes')
    expect(screen.getByRole('link', { name: 'Build a quiz' })).toBeInTheDocument()
  })

  it('reports graded attempts, filtered in the address, and opens one read-only', async () => {
    const grade = (index: number, code: string, at: number) =>
      gradeAttempt(
        {
          ...startAttempt(crypto.randomUUID(), 't', topic.problems[index], code, at),
          hints_used: 1,
        },
        topic.topic,
        topic.problems[index],
        { tests: graded.tests, loaded: true },
        at,
      )
    const first = grade(0, 'return 1', 1)
    const second = grade(1, 'return 2', 2)
    const open = startAttempt(crypto.randomUUID(), 't', topic.problems[0], '', 3)
    renderApp(
      fakeRunner(),
      { attempts: [first, open, second] },
      {
        page: 'reports',
        section: 'coding',
      },
    )
    const list = screen.getByRole('region', { name: 'Graded attempts' })
    expect(
      within(list)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Second problem', 'First problem'])
    expect(screen.getByRole('region', { name: 'Filters' })).toHaveTextContent('2 graded attempts')

    await userEvent.type(screen.getByLabelText('Search'), 'first')
    await waitFor(() => expect(window.location.hash).toBe('#/reports/coding?search=first'))
    expect(
      within(list)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['First problem'])

    await userEvent.click(within(list).getByRole('link', { name: 'First problem' }))
    expect(window.location.hash).toBe(`#/reports/coding/${first.id}`)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('First problem')
    expect(screen.getByRole('region', { name: 'Code' })).toHaveTextContent('return 1')
    expect(screen.getByRole('region', { name: 'Test results' })).toHaveTextContent(
      '1 of 2 tests passed',
    )
    expect(screen.getByRole('link', { name: 'Open the problem' })).toHaveAttribute(
      'href',
      '#/coding/t/one',
    )
    await userEvent.click(screen.getByRole('link', { name: 'Back to graded attempts' }))
    expect(window.location.hash).toBe('#/reports/coding?search=first')
  })

  it('says an attempt that is not graded is not in the report', () => {
    const open = startAttempt(crypto.randomUUID(), 't', topic.problems[0], '', 3)
    renderApp(fakeRunner(), { attempts: [open] }, { page: 'attempt', id: open.id })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'This attempt is not available',
    )
  })

  it('stays on the page while Python runs, from the menu and from Back', async () => {
    const runner = fakeRunner()
    let finish = () => {}
    runner.run = vi.fn(
      () => new Promise<RunResult>((resolve) => (finish = () => resolve({ stdout: '' }))),
    )
    await startFirst(runner)
    const at = window.location.hash
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    await userEvent.click(mainLink('Coding problems'))
    act(() => {
      window.history.replaceState(null, '', '#/quizzes')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(window.location.hash).toBe(at)
    expect(screen.getByRole('button', { name: 'Grade' })).toBeInTheDocument()
    await act(async () => finish())
    await userEvent.click(mainLink('Coding problems'))
    expect(problemRow('First problem')).toBeInTheDocument()
  })
})

describe('Topics', () => {
  const allPass: TestResult = {
    ...graded,
    tests: graded.tests.map((t) => ({ ...t, passed: true })),
  }
  const written = (title: string) => ({
    ...JSON.parse(itemText(topic.problems[0], topic.topic.concepts)),
    concepts: [{ name: 'Strings', group: 'Basics' }],
    wordings: [{ ...topic.problems[0].wordings[0], title }],
  })

  async function openTopic(name: string) {
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }))
    await userEvent.click(screen.getByRole('link', { name: 'Topics' }))
    await userEvent.click(screen.getByRole('link', { name }))
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
    const put = renderApp(runner, {}, { page: 'topics' })
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
    const basics = within(screen.getByRole('region', { name: 'Concepts' })).getByRole('region', {
      name: 'Basics',
    })
    expect(within(basics).getByRole('listitem', { name: 'Strings' })).toHaveTextContent(
      'Strings2 problems, 0 questions',
    )
    expect(put.topics.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'Strings',
        problems: [
          expect.objectContaining({ concepts: ['strings'], source: 'user' }),
          expect.objectContaining({ concepts: ['strings'], source: 'user' }),
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

    await userEvent.click(mainLink('Coding problems'))
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
        .flatMap((li) => li.getAttribute('aria-label') ?? []),
    ).toEqual(['Renamed problem', 'Second problem'])
  })

  it('adds, edits and deletes choice questions without running Python', async () => {
    const runner = fakeRunner()
    renderApp(runner)
    await openTopic('Topic')
    const question = (summary: string) => ({
      concepts: [{ name: 'C', group: 'G' }],
      type: 'multiple',
      difficulty: 'Medium',
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
      'Medium, multiple choice',
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

  it('lists topics with their counts and enables one in place', async () => {
    const broken = { ...topic.problems[0], id: 'broken', hints: [] }
    const stored = topicFromFile({ ...topic, problems: [...topic.problems, broken] }, 0)
    const put = renderApp(fakeRunner(), { topics: [stored] }, { page: 'topics' })
    const row = screen.getByRole('listitem', { name: 'Topic' })
    expect(row).toHaveTextContent('1 concept, 2 problems, 0 questions')
    await userEvent.click(screen.getByRole('switch', { name: 'Enabled Topic' }))
    expect(put.topics.put).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
    expect(screen.getByRole('switch', { name: 'Enabled Topic' })).not.toBeChecked()
    await userEvent.click(within(row).getByRole('link', { name: 'Topic' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Topic')
  })

  it('adds, edits and deletes the concepts of a topic', async () => {
    const shared = { ...problem('two', 'Second problem'), concepts: ['c', 'd'] }
    const stored = topicFromFile(
      {
        ...topic,
        topic: {
          ...topic.topic,
          concepts: [...topic.topic.concepts, { id: 'd', name: 'D', group: 'G' }],
        },
        problems: [topic.problems[0], shared],
      },
      0,
    )
    const put = renderApp(fakeRunner(), { topics: [stored] })
    await openTopic('Topic')
    const concepts = screen.getByRole('region', { name: 'Concepts' })
    const adding = within(concepts).getByRole('form', { name: 'New concept' })
    await userEvent.type(within(adding).getByRole('textbox', { name: 'Concept name' }), ' c ')
    await userEvent.type(within(adding).getByRole('combobox', { name: 'Area' }), 'H')
    await userEvent.click(within(adding).getByRole('button', { name: 'New concept' }))
    expect(within(adding).getByRole('alert')).toHaveTextContent('already has a concept named “c”')

    await userEvent.clear(within(adding).getByRole('textbox', { name: 'Concept name' }))
    await userEvent.type(within(adding).getByRole('textbox', { name: 'Concept name' }), 'E')
    await userEvent.click(within(adding).getByRole('button', { name: 'New concept' }))
    const h = within(concepts).getByRole('region', { name: 'H' })
    expect(within(h).getByRole('listitem', { name: 'E' })).toHaveTextContent('E0 problems')
    expect(within(adding).getByRole('textbox', { name: 'Concept name' })).toHaveValue('')

    await userEvent.click(within(concepts).getByRole('button', { name: 'Edit D' }))
    const editing = within(concepts).getByRole('form', { name: 'Edit D' })
    await userEvent.clear(within(editing).getByRole('textbox', { name: 'Concept name' }))
    await userEvent.type(within(editing).getByRole('textbox', { name: 'Concept name' }), 'Dee')
    await userEvent.clear(within(editing).getByRole('combobox', { name: 'Area' }))
    await userEvent.type(within(editing).getByRole('combobox', { name: 'Area' }), 'H')
    await userEvent.click(within(editing).getByRole('button', { name: 'Save' }))
    expect(
      within(h)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Dee', 'E'])
    expect(put.topics.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        concepts: [
          { id: 'c', name: 'C', group: 'G' },
          { id: 'd', name: 'Dee', group: 'H' },
          { id: 'e', name: 'E', group: 'H' },
        ],
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Edit Second problem' }))
    expect(within(concepts).getByRole('button', { name: 'Delete C' })).toBeDisabled()
    expect(within(adding).getByRole('textbox', { name: 'Concept name' })).toBeEnabled()
    expect(concepts).toHaveTextContent('Save or cancel the open problem or question first')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(concepts).getByRole('button', { name: 'Delete C' })).toBeEnabled()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(within(concepts).getByRole('button', { name: 'Delete E' }))
    expect(confirm).toHaveBeenLastCalledWith('Delete the concept “E”?')
    await userEvent.click(within(concepts).getByRole('button', { name: 'Delete C' }))
    expect(confirm).toHaveBeenLastCalledWith(
      'Delete the concept “C”? It will be removed from 2 problems. 1 problem has no other concept and will be deleted too. Past attempts at the deleted problem will be kept.',
    )
    expect(within(concepts).getByRole('listitem', { name: 'C' })).toBeInTheDocument()

    confirm.mockReturnValue(true)
    await userEvent.click(within(concepts).getByRole('button', { name: 'Delete C' }))
    expect(within(concepts).queryByRole('listitem', { name: 'C' })).toBeNull()
    const problems = screen.getByRole('region', { name: 'Topic problems' })
    expect(within(problems).queryByRole('listitem', { name: 'First problem' })).toBeNull()
    expect(within(problems).getByRole('listitem', { name: 'Second problem' })).toBeInTheDocument()
    expect(put.topics.put).toHaveBeenLastCalledWith(
      expect.objectContaining({ problems: [{ ...shared, concepts: ['d'] }] }),
    )

    await userEvent.click(mainLink('Coding problems'))
    await userEvent.click(conceptsToggle())
    expect(screen.getByRole('group', { name: 'H' })).toHaveTextContent('Dee')
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
    await userEvent.click(mainLink('Coding problems'))
    expect(screen.queryByRole('listitem', { name: 'First problem' })).toBeNull()
    expect(screen.getByText(/No problems to practise/)).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await openTopic('Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Delete topic' }))
    expect(put.topics.delete).toHaveBeenCalledWith('t')
    expect(screen.getByText('No topics yet.')).toBeInTheDocument()
  })

  describe('library', () => {
    const settingsLink = (name: string) =>
      within(screen.getByRole('navigation', { name: 'Settings' })).getByRole('link', { name })
    const off: TopicFile = {
      topic: { id: 'u', name: 'Off', concepts: [{ id: 'd', name: 'D', group: 'H' }] },
      problems: [{ ...problem('three', 'Third problem'), concepts: ['d'], source: 'user' }],
      questions: [],
    }
    const stored = (): TopicRecord[] => [
      {
        ...topicFromFile(topic, 0),
        problems: [
          ...topic.problems,
          { ...problem('broken', 'Broken problem'), hints: [] },
          {
            ...problem('twice', 'Twice worded'),
            wordings: [
              problem('x', 'Twice worded').wordings[0],
              { ...problem('x', 'Said again').wordings[0], statement: 'Second wording' },
            ],
          },
        ],
      },
      { ...topicFromFile(off, 1), enabled: false },
    ]

    it('lists every stored problem, disabled topics on request, filtered in the address', async () => {
      renderApp(fakeRunner(), { topics: stored() })
      await userEvent.click(screen.getByRole('link', { name: 'Settings' }))
      await userEvent.click(settingsLink('Coding problems'))
      expect(window.location.hash).toBe('#/settings/problems')
      const rows = () =>
        within(screen.getByRole('region', { name: 'Problems' }))
          .getAllByRole('listitem')
          .filter((li) => li.classList.contains('ws-problem'))
          .map((li) => li.getAttribute('aria-label'))
      expect(rows()).toEqual(['First problem', 'Second problem', 'Broken problem', 'Twice worded'])
      expect(screen.getByRole('listitem', { name: 'Broken problem' })).toHaveTextContent(
        'Not served: hints: needs exactly three hints',
      )
      expect(screen.getByRole('listitem', { name: 'First problem' })).toHaveTextContent('Built-in')

      await userEvent.click(screen.getByRole('switch', { name: 'Show disabled topics' }))
      expect(window.location.hash).toBe('#/settings/problems?disabled=shown')
      expect(screen.getByRole('listitem', { name: 'Third problem' })).toHaveTextContent(
        'Off (disabled)',
      )
      await userEvent.selectOptions(screen.getByLabelText('Source'), 'Added by you')
      expect(window.location.hash).toBe('#/settings/problems?source=user&disabled=shown')
      expect(rows()).toEqual(['Third problem'])

      // The source no problem of an enabled topic has is dropped with them.
      await userEvent.click(screen.getByRole('switch', { name: 'Show disabled topics' }))
      expect(window.location.hash).toBe('#/settings/problems')
      expect(rows()).toHaveLength(4)
    })

    it('opens a problem as the solver sees it, with its hints, reference and tests, to try it', async () => {
      renderApp(fakeRunner(), { topics: stored() }, { page: 'library' })
      await userEvent.click(screen.getByRole('link', { name: 'Twice worded' }))
      expect(window.location.hash).toBe('#/settings/problems/t/twice')
      expect(screen.getByRole('heading', { level: 1, name: 'Twice worded' })).toBeVisible()
      await userEvent.click(screen.getByRole('tab', { name: 'Wording 2' }))
      expect(screen.getByRole('heading', { level: 1, name: 'Said again' })).toBeVisible()
      expect(screen.getByText('Second wording')).toBeVisible()
      expect(screen.getByRole('region', { name: 'Hints' })).toHaveTextContent('123')
      expect(screen.getByRole('textbox', { name: 'Reference solution' })).toHaveTextContent(
        'return x',
      )
      expect(screen.getByRole('region', { name: 'Tests' })).toHaveTextContent(
        'The solver sees only test_a; the rest are hidden.',
      )

      await userEvent.click(screen.getByRole('button', { name: 'Try it' }))
      expect(window.location.hash).toBe('#/coding/t/twice')
      expect(screen.getByRole('textbox', { name: 'Solution code' })).toBeInTheDocument()
    })

    it('shows why a problem is not served, and deletes it', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const put = renderApp(fakeRunner(), { topics: stored() }, { page: 'library' })
      await userEvent.click(screen.getByRole('link', { name: 'Broken problem' }))
      expect(screen.getByRole('alert')).toHaveTextContent('hints: needs exactly three hints')
      expect(screen.getByRole('textbox', { name: 'Stored problem' })).toHaveTextContent(
        '"id": "broken"',
      )
      expect(screen.queryByRole('button', { name: 'Try it' })).toBeNull()

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(window.confirm).toHaveBeenCalledWith(
        'Delete "Broken problem"? Its past attempts will be kept.',
      )
      expect(put.topics.put.mock.lastCall![0].problems.map((p) => p.id)).toEqual([
        'one',
        'two',
        'twice',
      ])
      expect(window.location.hash).toBe('#/settings/problems')
      expect(screen.queryByRole('link', { name: 'Broken problem' })).toBeNull()
    })

    it('offers no Try it for a disabled topic, and says when a problem is gone', async () => {
      renderApp(
        fakeRunner(),
        { topics: stored() },
        {
          page: 'library-problem',
          topic: 'u',
          problem: 'three',
        },
      )
      expect(screen.getByRole('heading', { level: 1, name: 'Third problem' })).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Try it' })).toBeNull()
      act(() => {
        window.location.hash = href({ page: 'library-problem', topic: 'u', problem: 'gone' })
      })
      expect(await screen.findByText('This problem is not available')).toBeInTheDocument()
    })

    it('opens from the problem count of a concept on the topic page', async () => {
      const two: TopicFile = {
        ...topic,
        topic: {
          ...topic.topic,
          concepts: [...topic.topic.concepts, { id: 'e', name: 'E', group: 'G' }],
        },
        problems: [
          ...topic.problems,
          { ...problem('three', 'Third problem'), concepts: ['e'] },
          { ...problem('broken', 'Broken problem'), hints: [] },
          { ...problem('lost', 'Lost problem'), concepts: ['gone'] },
        ],
      }
      renderApp(fakeRunner(), { topics: [topicFromFile(two, 0)] })
      await openTopic('Topic')
      // Broken problems count too, as the library lists them; one of no known concept is in no link.
      await userEvent.click(screen.getByRole('link', { name: '3 problems of C' }))
      expect(window.location.hash).toBe('#/settings/problems?topic=t&without=E&without=gone')
      expect(screen.getByText('3 of 5 problems')).toBeInTheDocument()
      await userEvent.click(conceptsToggle())
      const area = screen.getByRole('checkbox', { name: 'G' })
      expect(area).not.toBeChecked()
      expect(area).toHaveProperty('indeterminate', true)
      await userEvent.click(area)
      expect(window.location.hash).toBe('#/settings/problems?topic=t&without=gone')
      expect(area).toHaveProperty('indeterminate', false)
    })
  })

  describe('quizzes', () => {
    const withQuestions = (quizzes: Quiz[] = []) =>
      renderApp(fakeRunner(), { topics: [topicFromFile(quizTopic, 0)], quizzes })
    const lastSaved = (put: ReturnType<typeof renderApp>) => put.quizzes.put.mock.lastCall![0]

    it('takes a quiz: answer, flag, review, submit, read the results', async () => {
      // Keeps the order of questions and options.
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      const put = withQuestions()
      await userEvent.click(screen.getByRole('link', { name: 'Quizzes' }))
      expect(screen.getByLabelText('Number of questions')).toHaveValue(2)
      expect(screen.getByLabelText('Time limit breakdown')).toHaveTextContent(
        '4 min: 1 easy × 1 min + 1 hard × 3 min',
      )
      const before = Date.now()
      await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }))
      expect(lastSaved(put).deadline).toBeGreaterThanOrEqual(before + 4 * 60_000)

      expect(screen.getByText('Text of pick-one')).toBeInTheDocument()
      const status = within(screen.getByRole('complementary', { name: 'Quiz status' }))
      expect(status.getByText('Time left')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('radio', { name: 'right' }))
      const flag = screen.getByRole('button', { name: 'Flag for review' })
      await userEvent.click(flag)
      expect(flag).toHaveAttribute('aria-pressed', 'true')
      expect(lastSaved(put)).toMatchObject({ picks: [[1], []], flagged: [true, false] })
      expect(status.getByRole('button', { name: 'Question 1, answered, flagged' })).toHaveAttribute(
        'aria-current',
        'step',
      )
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
      await userEvent.click(screen.getByRole('checkbox', { name: 'a' }))
      const panel = screen.getByRole('complementary', { name: 'Quiz status' })
      expect(panel).toHaveTextContent('Answered 2')
      expect(panel).toHaveTextContent('Not answered 0')
      expect(panel).toHaveTextContent('Flagged 1')

      await userEvent.click(status.getByRole('button', { name: 'Submit quiz' }))
      const dialog = within(screen.getByRole('dialog', { name: 'Submit the quiz?' }))
      expect(dialog.getByText('1 question flagged for review.')).toBeInTheDocument()
      await userEvent.click(dialog.getByRole('button', { name: 'Keep working' }))
      await userEvent.click(status.getByRole('button', { name: 'Question 1, answered, flagged' }))
      expect(screen.getByText('Text of pick-one')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Flag for review' }))
      await userEvent.click(status.getByRole('button', { name: 'Submit quiz' }))
      expect(
        screen.getByText('Every question is answered and none is flagged.'),
      ).toBeInTheDocument()
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit quiz' }),
      )

      // A single choice weighs 1, a multiple choice 2: (100 + 2 × 50) / 3.
      expect(screen.getByRole('region', { name: 'Quiz result' })).toHaveTextContent('Score 67')
      const second = screen.getByRole('region', { name: 'Question 2' })
      expect(second).toHaveTextContent('Score 50')
      expect(second).toHaveTextContent('Why pick-all')
      expect(lastSaved(put).result).toMatchObject({ scores: [100, 50], score: 67 })
      const report = screen.getByRole('region', { name: 'Quiz result' })
      expect(report).toHaveTextContent('1 correct, 1 partly correct, 0 wrong or not answered')
      expect(screen.getByRole('heading', { name: 'Quiz result' })).toHaveFocus()
      expect(report).toHaveTextContent(/Time used\s*\d+:\d\d of 4:00/)
      expect(report).toHaveTextContent('Topic, 2 questions,')
      expect(screen.getByRole('region', { name: 'Score by concept' })).toHaveTextContent(
        'CTopic, 2 questions67',
      )
      await userEvent.click(screen.getByRole('switch', { name: 'Not fully correct only' }))
      expect(screen.queryByRole('region', { name: 'Question 1' })).toBeNull()
      expect(screen.getByRole('region', { name: 'Question 2' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('link', { name: 'Build another quiz' }))
      expect(screen.getByRole('form', { name: 'New quiz' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('link', { name: 'Reports, Quizzes' }))
      expect(screen.getByRole('region', { name: 'Past quizzes' })).toHaveTextContent(
        'Topic, 2 questions',
      )
    })

    it('builds a quiz from topics, areas, types, difficulty and a count, timed or not', async () => {
      const other: TopicFile = {
        topic: { id: 'u', name: 'Other', concepts: [{ id: 'c', name: 'C', group: 'H' }] },
        problems: [],
        questions: [
          choiceQuestion('u1', 'single', ['x', 'y'], [0], 'Medium'),
          choiceQuestion('u2', 'single', ['x', 'y'], [1], 'Medium'),
          choiceQuestion('u3', 'multiple', ['x', 'y', 'z'], [0, 1], 'Easy'),
        ],
      }
      const put = renderApp(fakeRunner(), {
        topics: [topicFromFile(quizTopic, 0), topicFromFile(other, 1)],
      })
      await userEvent.click(screen.getByRole('link', { name: 'Quizzes' }))
      const form = within(screen.getByRole('form', { name: 'New quiz' }))
      const count = form.getByLabelText('Number of questions')
      const breakdown = () => form.getByLabelText('Time limit breakdown')
      expect(form.getByText('5 questions match')).toBeInTheDocument()
      expect(count).toHaveValue(5)
      expect(breakdown()).toHaveTextContent(
        '9 min: 2 easy × 1 min + 2 medium × 2 min + 1 hard × 3 min',
      )

      const chip = (group: string, name: string | RegExp) =>
        within(form.getByRole('group', { name: group })).getByRole('button', { name })
      await userEvent.click(chip('Areas', 'G'))
      expect(form.getByText('3 questions match')).toBeInTheDocument()
      await userEvent.click(chip('Difficulty', 'Medium'))
      expect(form.getByText('1 question match')).toBeInTheDocument()
      await userEvent.click(chip('Topics', /Other/))
      expect(form.getByText(/No questions match/)).toBeInTheDocument()
      expect(form.getByRole('button', { name: 'Start quiz' })).toBeDisabled()
      await userEvent.click(chip('Topics', /Other/))
      await userEvent.click(chip('Difficulty', 'Medium'))
      await userEvent.click(chip('Question types', 'Multiple choice'))
      expect(form.getByText('2 questions match')).toBeInTheDocument()

      await userEvent.clear(count)
      await userEvent.type(count, '99')
      expect(form.getByRole('button', { name: 'More questions' })).toBeDisabled()
      await userEvent.tab()
      expect(count).toHaveValue(2)
      await userEvent.click(form.getByRole('button', { name: 'Fewer questions' }))
      expect(count).toHaveValue(1)
      expect(form.getByRole('button', { name: 'Fewer questions' })).toBeDisabled()
      expect(breakdown()).toHaveTextContent('2 min: 1 medium × 2 min')
      await userEvent.click(form.getByRole('switch', { name: 'Time limit' }))
      expect(breakdown()).toHaveTextContent('No time limit')
      await userEvent.click(form.getByRole('button', { name: 'Start quiz' }))
      expect(lastSaved(put).questions).toHaveLength(1)
      expect(lastSaved(put).deadline).toBeUndefined()
    })

    it('gives a timed quiz of some of the matching questions the limit it showed', async () => {
      const put = withQuestions()
      await userEvent.click(screen.getByRole('link', { name: 'Quizzes' }))
      const form = within(screen.getByRole('form', { name: 'New quiz' }))
      await userEvent.click(form.getByRole('button', { name: 'Fewer questions' }))
      const minutes = Number(
        /^(\d+) min/.exec(form.getByLabelText('Time limit breakdown').textContent!)![1],
      )
      await userEvent.click(form.getByRole('button', { name: 'Start quiz' }))
      const quiz = lastSaved(put)
      expect(quiz.questions).toHaveLength(1)
      expect(minutes).toBe(quiz.questions[0].difficulty === 'Hard' ? 3 : 1)
      expect(quiz.deadline! - quiz.started_at).toBe(minutes * 60_000)
    })

    it('resumes a quiz in progress, or discards it to start another', async () => {
      const running = startQuiz(crypto.randomUUID(), quizOf(['single']), 0)
      const put = withQuestions([running])
      await userEvent.click(screen.getByRole('link', { name: 'Quizzes' }))
      expect(screen.getByText(/Quiz in progress: 0 of 1 answered/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
      expect(screen.getByText('Question 1 of 1')).toBeInTheDocument()
      const status = screen.getByRole('complementary', { name: 'Quiz status' })
      expect(status).toHaveTextContent('No time limit')
      await userEvent.click(within(status).getByRole('button', { name: 'Submit quiz' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('1 question not answered.')
      await userEvent.click(screen.getByRole('button', { name: 'Keep working' }))

      vi.spyOn(window, 'confirm').mockReturnValue(true)
      await userEvent.click(screen.getByRole('link', { name: 'Quizzes' }))
      await userEvent.click(screen.getByRole('button', { name: 'Start quiz' }))
      expect(put.quizzes.delete).toHaveBeenCalledWith(running.id)
      expect(lastSaved(put).questions).toHaveLength(2)
    })

    it('reports a quiz stored before questions had a difficulty, untimed', async () => {
      const quiz = startQuiz(crypto.randomUUID(), quizOf(['single']), 0)
      const old = submitQuiz(
        { ...quiz, questions: quiz.questions.map(({ difficulty: _difficulty, ...q }) => q) },
        60_000,
      )
      withQuestions([old])
      await userEvent.click(screen.getByRole('link', { name: 'Reports' }))
      const menu = screen.getByRole('navigation', { name: 'Reports' })
      await userEvent.click(within(menu).getByRole('link', { name: 'Quizzes' }))
      await userEvent.click(screen.getByRole('link', { name: /^Open quiz/ }))
      const report = screen.getByRole('region', { name: 'Quiz result' })
      expect(report).toHaveTextContent('Time usedNo time limit')
      expect(report).toHaveTextContent('0 correct, 0 partly correct, 1 wrong or not answered')
      await userEvent.click(screen.getByRole('switch', { name: 'Not fully correct only' }))
      expect(screen.getByRole('region', { name: 'Question 1' })).toBeInTheDocument()
    })

    it('closes the submit dialog when time runs out and shows the result', async () => {
      const quiz = startQuiz(crypto.randomUUID(), quizOf(['single'], true), Date.now())
      const soon = { ...quiz, deadline: Date.now() + 300 }
      withQuestions([soon])
      await userEvent.click(screen.getByRole('link', { name: 'Quizzes' }))
      await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
      await userEvent.click(screen.getByRole('button', { name: 'Submit quiz' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(await screen.findByRole('region', { name: 'Quiz result' })).toBeInTheDocument()
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(document.body).not.toHaveClass('modal-open')
    })

    it('submits a quiz whose deadline has passed', async () => {
      const expired = startQuiz(
        crypto.randomUUID(),
        quizOf(['single'], true),
        Date.now() - 2 * 60_000,
      )
      const put = withQuestions([expired])
      await vi.waitFor(() => expect(lastSaved(put).result).toMatchObject({ score: 0 }))
    })

    it('submits a timed quiz while another, untimed, runs too (started in another tab)', async () => {
      const untimed = startQuiz(crypto.randomUUID(), quizOf(['single']), Date.now())
      const expired = startQuiz(
        crypto.randomUUID(),
        quizOf(['single'], true),
        Date.now() - 2 * 60_000,
      )
      const put = withQuestions([untimed, expired])
      await vi.waitFor(() =>
        expect(lastSaved(put)).toMatchObject({ id: expired.id, result: { score: 0 } }),
      )
    })
  })
})
