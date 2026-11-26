import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { builtInTopics } from './content.ts'

interface BuiltInQuestion {
  type: string
  concepts: string[]
  wordings: { options: string[] }[]
  answers: number[]
  summary: string
}
const content = JSON.parse(readFileSync('src/content/algorithms.json', 'utf8'))
const topicId: string = content.topic.id
const builtIn: BuiltInQuestion[] = content.questions
const concept: { id: string; name: string } = content.topic.concepts[0]
const sample = builtIn.find((q) => q.type === 'single' && q.concepts.includes(concept.id))!
const correct = sample.wordings[0].options[sample.answers[0]]

function savedQuestions(page: Page): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('whetstone')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const get = open.result.transaction('topics').objectStore('topics').get(id)
          get.onsuccess = () => resolve(get.result.questions.length)
          get.onerror = () => reject(get.error)
        }
      }),
    topicId,
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
    `Write 3 new interview quiz questions for the topic "${content.topic.name}".`,
  )

  await page.getByRole('textbox', { name: 'Chat bot answer' }).fill(answer)
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByRole('checkbox', { name: 'Average dict lookup cost' })).toBeChecked()
  await page.getByRole('button', { name: 'Add 1 question' }).click()
  await expect(page.getByText(`Added 1 question to ${content.topic.name}.`)).toBeVisible()
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
  const all = builtInTopics.flatMap((t) => t.questions)
  const count = (type: string, of?: string) =>
    all.filter((q) => q.type === type && (!of || q.concepts.includes(of))).length
  await expect(rows).toHaveCount(all.length)

  await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Multiple choice' })
  await expect(rows).toHaveCount(count('multiple'))
  await page.getByLabel('Type', { exact: true }).selectOption({ label: 'Single choice' })
  await page.getByRole('button', { name: /^Concepts / }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('checkbox', { name: concept.name, exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(rows).toHaveCount(count('single', concept.id))

  const { summary } = sample
  await page.getByRole('link', { name: summary, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: summary })).toBeVisible()
  const options = page.getByRole('list', { name: 'Options' })
  await expect(options.locator('li[data-correct]')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Explanation' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/#\/settings\/questions\?/)
  await expect(page.getByRole('link', { name: summary, exact: true })).toHaveCount(0)
  await expect.poll(() => savedQuestions(page)).toBe(builtIn.length - 1)
})

test('edit a question beside its preview', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const { summary } = sample
  await page.goto('./#/settings/questions')
  await page.getByRole('link', { name: summary, exact: true }).click()
  await page.getByRole('link', { name: 'Edit' }).click()
  // The editor renders only the lines in view, so the text goes out and back by the clipboard.
  await page.getByRole('textbox', { name: 'Question JSON' }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  await page.keyboard.insertText(text.replace(JSON.stringify(correct), '"Edited option"'))
  const preview = page.getByRole('region', { name: 'Preview' })
  await expect(preview.locator('li[data-correct]').first()).toContainText('Edited option')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(new RegExp(`#/settings/questions/${topicId}/[^/]+$`))
  await expect(page.getByRole('heading', { level: 1, name: summary })).toBeVisible()
  await expect(page.getByText('Edited option').first()).toBeVisible()
})
