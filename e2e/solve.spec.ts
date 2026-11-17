import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const topic = JSON.parse(readFileSync('src/content/algorithms.json', 'utf8'))
const problem = topic.problems[0]

test('solve a problem: run the visible tests, then grade to 100', async ({ page }) => {
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Start / })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(problem.wordings[0].title)
  await expect(page.getByText('Python is ready')).toBeVisible({ timeout: 90_000 })

  await page.getByRole('button', { name: 'Grade' }).click()
  const starterGrade = page.getByRole('region', { name: 'Grade' })
  await expect(starterGrade).toContainText('Score:')
  await expect(starterGrade).not.toContainText('Score: 100 / 100')

  const editor = page.getByRole('textbox', { name: 'Solution code' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  // Pasted, not typed: typing would add the editor's auto-indent to the solution's own.
  await page.keyboard.insertText(problem.reference_solution)

  await page.getByRole('button', { name: 'Run tests' }).click()
  const visible = problem.visible_tests.length
  await expect(page.getByRole('region', { name: 'Test results' })).toContainText(
    `${visible} of ${visible} tests passed`,
  )

  await page.getByRole('button', { name: 'Grade' }).click()
  const grade = page.getByRole('region', { name: 'Grade' })
  await expect(grade).toContainText('Score: 100 / 100')
  await expect(grade).toContainText('Hidden test')
})
