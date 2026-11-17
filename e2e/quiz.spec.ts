import { expect, test, type Page } from '@playwright/test'

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
      concept: { name: `${topic} basics`, group: topic },
      type: 'single',
      wordings: [{ text: `${topic} question ${n}?`, options: ['Right', 'Wrong'] }],
      answers: [0],
      explanation: `Because of ${topic} rule ${n}.`,
      summary: `${topic} ${n}`,
    })),
  )

async function addTopic(page: Page, name: string) {
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'New topic name' }).fill(name)
  await page.getByRole('button', { name: 'Create topic' }).click()
  await page.getByRole('tab', { name: 'Questions' }).click()
  await page.getByRole('button', { name: 'New question' }).click()
  await page.getByRole('textbox', { name: 'Question JSON' }).fill(questions(name))
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(
    page.getByRole('region', { name: 'Topic questions' }).getByRole('listitem'),
  ).toHaveCount(5)
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
  await page.getByRole('link', { name: 'Quiz' }).click()
  // Only the two new topics: they hold exactly ten questions, so both are in the quiz.
  await page.getByLabel('Algorithms & data structures (35)').uncheck()
  await expect(page.getByLabel('Strings (5)')).toBeChecked()
  await expect(page.getByLabel('Graphs (5)')).toBeChecked()
  await page.getByLabel('Timer').selectOption('10 minutes')
  await page.getByRole('button', { name: 'Start quiz' }).click()
  await expect(page.getByText('Question 1 of 10')).toBeVisible()
  await expect(page.getByTitle('Time left')).toHaveText(/^(10:00|9:\d\d)$/)

  await answerCurrent(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await answerCurrent(page)
  await page.getByRole('button', { name: 'Flag' }).click()
  await expect.poll(() => savedAnswers(page)).toBe(2)

  await page.reload()
  await page.getByRole('link', { name: 'Quiz' }).click()
  await expect(page.getByText('Quiz in progress: 2 of 10 answered.')).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByText('Question 3 of 10')).toBeVisible()

  await page.getByRole('button', { name: 'Review and submit' }).click()
  await expect(page.getByRole('region', { name: 'Unanswered' }).getByRole('button')).toHaveCount(8)
  await expect(page.getByRole('region', { name: 'Flagged' }).getByRole('button')).toHaveText([
    'Question 2',
  ])
  await page.getByRole('button', { name: 'Submit' }).click()

  const result = page.getByRole('region', { name: 'Quiz result' })
  await expect(result).toContainText(/Score \d+/)
  await expect(result.getByText('Not answered.')).toHaveCount(8)
  await expect(result).toContainText('Strings, Strings basics')
  await expect(result).toContainText('Graphs, Graphs basics')

  await page.getByRole('link', { name: 'Quiz' }).click()
  await expect(
    page.getByRole('region', { name: 'Past quizzes' }).getByRole('listitem'),
  ).toHaveCount(1)
})
