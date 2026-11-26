import { expect, test, type Page } from '@playwright/test'
import { builtInTopics } from './content.ts'

function savedAnswers(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('whetstone')
        open.onsuccess = () => {
          const all = open.result.transaction('quizzes').objectStore('quizzes').getAll()
          all.onsuccess = () =>
            resolve(all.result[0].picks.filter((p: number[]) => p.length).length)
          all.onerror = () => reject(all.error)
        }
        open.onerror = () => reject(open.error)
      }),
  )
}

// Five single-choice questions: the first option is the right one.
const questions = (topic: string) =>
  JSON.stringify(
    [1, 2, 3, 4, 5].map((n) => ({
      concepts: [{ name: `${topic} basics`, group: topic }],
      type: 'single',
      difficulty: 'Medium',
      wordings: [{ text: `${topic} question ${n}?`, options: ['Right', 'Wrong'] }],
      answers: [0],
      explanation: `Because of ${topic} rule ${n}.`,
      summary: `${topic} ${n}`,
    })),
  )

async function addTopic(page: Page, name: string) {
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Topics' }).click()
  await page.getByRole('textbox', { name: 'New topic name' }).fill(name)
  await page.getByRole('button', { name: 'Create topic' }).click()
  await page.getByRole('link', { name: 'Quiz questions' }).click()
  await page.getByRole('link', { name: 'Add questions' }).click()
  await page.getByLabel('Topic').selectOption({ label: name })
  await page.getByRole('tab', { name: 'Write JSON' }).click()
  await page.getByRole('textbox', { name: 'Questions JSON' }).fill(questions(name))
  await page.getByRole('button', { name: 'Check' }).click()
  await page.getByRole('button', { name: 'Add 5 questions' }).click()
  await expect(page.getByText(`Added 5 questions to ${name}.`)).toBeVisible()
}

async function answerCurrent(page: Page) {
  await page.locator('input[name^="question-"]').first().check()
}

test('take a ten-question quiz on two topics, reload and resume it, read the results', async ({
  page,
}) => {
  await page.goto('./')
  await addTopic(page, 'Strings')
  await addTopic(page, 'Graphs')
  await page.getByRole('link', { name: 'Quizzes' }).click()
  // Only the two new topics: they hold exactly ten questions, so both are in the quiz.
  const topics = page.getByRole('group', { name: 'Topics' })
  for (const { topic } of builtInTopics) {
    await topics.getByRole('button', { name: topic.name }).click()
  }
  await expect(topics.getByRole('button', { name: /Strings/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(topics.getByRole('button', { name: /Graphs/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('10 questions match')).toBeVisible()
  await expect(page.getByLabel('Time limit breakdown')).toHaveText('20 min: 10 medium × 2 min')
  await page.getByRole('button', { name: 'Start quiz' }).click()
  await expect(page.getByText('Question 1 of 10')).toBeVisible()
  await expect(page.getByTitle('Time left')).toHaveText(/^(20:00|19:\d\d)$/)

  await answerCurrent(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await answerCurrent(page)
  await page.getByRole('button', { name: 'Flag for review' }).click()
  await expect.poll(() => savedAnswers(page)).toBe(2)

  await page.reload()
  await page.getByRole('link', { name: 'Quizzes' }).click()
  await expect(page.getByText('Quiz in progress: 2 of 10 answered.')).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByText('Question 3 of 10')).toBeVisible()

  const status = page.getByRole('complementary', { name: 'Quiz status' })
  await expect(status.getByRole('button', { name: /not answered/ })).toHaveCount(8)
  await expect(status.getByRole('button', { name: /flagged/ })).toHaveText(['2'])
  await status.getByRole('button', { name: 'Question 2, answered, flagged' }).click()
  await expect(page.getByText('Question 2 of 10')).toBeVisible()
  await status.getByRole('button', { name: 'Submit quiz' }).click()
  const dialog = page.getByRole('dialog', { name: 'Submit the quiz?' })
  await expect(dialog).toContainText('8 questions not answered, 1 question flagged for review.')
  await dialog.getByRole('button', { name: 'Submit quiz' }).click()

  const result = page.getByRole('region', { name: 'Quiz result' })
  await expect(result).toContainText(/Score \d+/)
  await expect(result.getByText('Not answered.')).toHaveCount(8)
  const concepts = result.getByRole('list', { name: 'Concepts' })
  await expect(concepts.getByText('Strings basics').first()).toBeVisible()
  await expect(concepts.getByText('Graphs basics').first()).toBeVisible()
  await expect(result).toContainText('wrong or not answered')
  await expect(
    page.getByRole('region', { name: 'Score by concept' }).getByRole('listitem'),
  ).toHaveCount(2)
  await page.getByRole('switch', { name: 'Not fully correct only' }).check()
  await expect(result.getByText('Not answered.')).toHaveCount(8)
  await page.getByRole('link', { name: 'Build another quiz' }).click()
  await expect(page.getByRole('form', { name: 'New quiz' })).toBeVisible()
  await page.getByRole('link', { name: 'Reports, Quizzes' }).click()
  await expect(
    page.getByRole('region', { name: 'Past quizzes' }).getByRole('listitem'),
  ).toHaveCount(1)
})

test('show the quiz status below the question on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('./#/quizzes')
  await page.getByRole('button', { name: 'Start quiz' }).click()
  const question = (await page.getByRole('region', { name: /^Question 1 of/ }).boundingBox())!
  const status = (await page.getByRole('complementary', { name: 'Quiz status' }).boundingBox())!
  expect(status.y).toBeGreaterThan(question.y + question.height - 1)
  await expect(page.locator('.ws-question-clock')).toBeVisible()

  const panel = page.getByRole('complementary', { name: 'Quiz status' })
  await panel.getByRole('button', { name: /^Question 3,/ }).click()
  await expect(page.getByRole('heading', { name: 'Question 3 of 10' })).toBeInViewport()
  // The jump scrolls smoothly, so the heading settles below the top bar after a moment.
  const bar = (await page.getByRole('banner').boundingBox())!
  const heading = page.getByRole('heading', { name: 'Question 3 of 10' })
  await expect
    .poll(async () => (await heading.boundingBox())!.y)
    .toBeGreaterThanOrEqual(bar.y + bar.height)
})
