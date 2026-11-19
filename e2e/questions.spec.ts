import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const builtIn: { type: string; concepts: string[] }[] = JSON.parse(
  readFileSync('src/content/algorithms.json', 'utf8'),
).questions

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

test('add a question from a chat answer, checked first', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Quiz questions' }).click()
  await page.getByRole('link', { name: 'Add questions' }).click()
  await page.getByRole('button', { name: 'Copy Prompt' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Write 3 new interview quiz questions for the topic "Algorithms & data structures".',
  )

  await page.getByRole('textbox', { name: 'Chat bot answer' }).fill(answer)
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('checkbox', { name: 'Average dict lookup cost' })).toBeChecked()
  await page.getByRole('button', { name: 'Add 1 question' }).click()
  await expect(page.getByText('Added 1 question to Algorithms & data structures.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Average dict lookup cost' })).toBeVisible()
  await expect.poll(() => savedQuestions(page)).toBe(builtIn.length + 1)

  await page.reload()
  await page.getByRole('link', { name: 'Average dict lookup cost' }).click()
  await expect(page.getByRole('region', { name: 'Explanation' })).toContainText(
    'A dict hashes the key',
  )
})

test('filter the quiz questions, read one with its answers, delete it', async ({ page }) => {
  await page.goto('./#/settings/questions')
  const rows = page.getByRole('region', { name: 'Questions' }).locator(':scope > ul > li')
  const count = (type: string, concept?: string) =>
    builtIn.filter((q) => q.type === type && (!concept || q.concepts.includes(concept))).length
  await expect(rows).toHaveCount(builtIn.length)

  await page.getByLabel('Type').selectOption({ label: 'Multiple choice' })
  await expect(rows).toHaveCount(count('multiple'))
  await page.getByLabel('Type').selectOption({ label: 'Single choice' })
  await page.getByRole('button', { name: /^Concepts / }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Two pointers' }).click()
  await page.keyboard.press('Escape')
  await expect(rows).toHaveCount(count('single', 'two-pointers'))

  const summary = 'Precondition of the inward two-pointer pair search'
  await page.getByRole('link', { name: summary }).click()
  await expect(page.getByRole('heading', { level: 1, name: summary })).toBeVisible()
  const options = page.getByRole('tabpanel').getByRole('list', { name: 'Options' })
  await expect(options.locator('li[data-correct]')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Explanation' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/#\/settings\/questions\?/)
  await expect(page.getByRole('link', { name: summary })).toHaveCount(0)
  await expect.poll(() => savedQuestions(page)).toBe(builtIn.length - 1)
})
