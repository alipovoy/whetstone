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

async function answerCurrent(page: Page) {
  await page.locator('input[name^="question-"]').first().check()
}

test('take a quiz, reload and resume it, submit and read the results', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Quizzes' }).click()
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
  await page.getByRole('link', { name: 'Quizzes' }).click()
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

  await page.getByRole('link', { name: 'Quizzes' }).click()
  await expect(
    page.getByRole('region', { name: 'Past quizzes' }).getByRole('listitem'),
  ).toHaveCount(1)
})
