import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const topic = JSON.parse(readFileSync('src/content/algorithms.json', 'utf8'))
const problem = topic.problems[1]
const title = problem.wordings[0].title

function savedCode(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('whetstone')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result.transaction('attempts').objectStore('attempts').getAll()
          all.onsuccess = () => resolve(all.result.map((a: { code: string }) => a.code))
          all.onerror = () => reject(all.error)
        }
      }),
  )
}

test('start a problem, reload, continue, grade, find it in the list', async ({ page }) => {
  await page.goto('./')
  const list = page.getByRole('navigation', { name: 'Problems' })
  await list.getByRole('button', { name: title }).click()
  await page.getByRole('button', { name: 'Show hint 1 (max score 90)' }).click()

  const editor = page.getByRole('textbox', { name: 'Solution code' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(problem.reference_solution)
  await expect.poll(() => savedCode(page)).toContain(problem.reference_solution)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title)
  await expect(page.getByRole('region', { name: 'Hints' })).toContainText(problem.hints[0])
  expect(await editor.innerText()).toBe(problem.reference_solution)

  await expect(page.getByText('Python is ready')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Grade' }).click()
  await expect(page.getByRole('region', { name: 'Grade' })).toContainText('Score: 90 / 100')
  await expect(list.getByRole('button', { name: title })).toContainText('Last score 90')

  await page.reload()
  await expect(list.getByRole('button', { name: title })).toContainText('Last score 90')
  await expect(page.getByRole('region', { name: 'Grade' })).toContainText('Score: 90 / 100')
  await page.getByText('Reference solution').click()
  await expect(page.locator('details pre')).toHaveText(problem.reference_solution)
})
