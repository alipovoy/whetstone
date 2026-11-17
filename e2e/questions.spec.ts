import { expect, test } from '@playwright/test'

const answer = `Here you go.

\`\`\`json
${JSON.stringify({
  questions: [
    {
      concept: { name: 'Hash maps', group: 'Lookup' },
      type: 'single',
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
  await page.getByRole('link', { name: 'Topics' }).click()
  await expect(page.getByRole('listitem', { name: 'Algorithms & data structures' })).toContainText(
    '35 questions',
  )
  await page.getByRole('button', { name: 'Open Algorithms & data structures' }).click()
  const questions = page.getByRole('region', { name: 'Topic questions' })
  await expect(questions.getByRole('listitem')).toHaveCount(35)

  await page.getByRole('button', { name: 'New question' }).click()
  await page.getByRole('textbox', { name: 'Question JSON' }).fill(answer)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(questions.getByRole('listitem', { name: 'Average dict lookup cost' })).toBeVisible()

  await page.reload()
  await page.getByRole('link', { name: 'Topics' }).click()
  await page.getByRole('button', { name: 'Open Algorithms & data structures' }).click()
  await expect(questions.getByRole('listitem')).toHaveCount(36)
})
