import { expect, test, type Page } from '@playwright/test'

function savedQuestions(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('whetstone')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const get = open.result.transaction('topics').objectStore('topics').get('algorithms')
          get.onsuccess = () => resolve(get.result.questions.length)
          get.onerror = () => reject(get.error)
        }
      }),
  )
}

const answer = `Here you go.

\`\`\`json
${JSON.stringify({
  questions: [
    {
      concepts: [{ name: 'Hash maps', group: 'Lookup' }],
      type: 'single',
      difficulty: 'Easy',
      wordings: [
        {
          text: 'What is the average cost of a lookup in a Python `dict`?',
          options: ['O(1)', 'O(log n)', 'O(n)'],
        },
      ],
      answers: [0],
      explanation: 'A dict hashes the key straight to its slot.',
      summary: 'Average dict lookup cost',
    },
  ],
})}
\`\`\``

test('see the built-in questions, add one from a chat answer', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Topics' }).click()
  await expect(page.getByRole('listitem', { name: 'Algorithms & data structures' })).toContainText(
    '35 questions',
  )
  await page.getByRole('button', { name: 'Open Algorithms & data structures' }).click()
  await expect(page.getByRole('button', { name: 'New question' })).toBeHidden()
  await page.getByRole('tab', { name: 'Questions' }).click()
  await expect(page.getByRole('button', { name: 'New problem' })).toBeHidden()
  const questions = page.getByRole('region', { name: 'Topic questions' })
  await expect(questions.locator(':scope > ul > li')).toHaveCount(35)

  await page.getByRole('button', { name: 'New question' }).click()
  await page.getByRole('textbox', { name: 'Question JSON' }).fill(answer)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(questions.getByRole('listitem', { name: 'Average dict lookup cost' })).toBeVisible()

  await expect.poll(() => savedQuestions(page)).toBe(36)

  await page.reload()
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Topics' }).click()
  await page.getByRole('button', { name: 'Open Algorithms & data structures' }).click()
  await page.getByRole('tab', { name: 'Questions' }).click()
  await expect(questions.locator(':scope > ul > li')).toHaveCount(36)
})
