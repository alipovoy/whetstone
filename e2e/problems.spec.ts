import { expect, test } from '@playwright/test'
import { builtInTopics } from './content.ts'

const problems = builtInTopics.flatMap((t) => t.problems)
const titles = (difficulty: string): string[] =>
  problems.filter((p) => p.difficulty === difficulty).map((p) => p.wordings[0].title)
const topicIds = builtInTopics.map((t) => t.topic.id).join('|')

test('filter the problems, keep the filter, start a random match', async ({ page }) => {
  await page.goto('./#/')
  await page.getByRole('link', { name: 'Coding problems' }).click()
  const list = page.getByRole('region', { name: 'Problems' }).locator(':scope > ul > li')
  await expect(list).toHaveCount(problems.length)

  await page.getByRole('button', { name: 'Easy' }).click()
  await page.getByLabel('Search').fill('zzz')
  await expect(page.getByText('No problems match these filters')).toBeVisible()
  await page.getByLabel('Search').fill('')
  await expect(list).toHaveCount(titles('Easy').length)

  await page.reload()
  await expect(page).toHaveURL(/#\/coding\?difficulty=Easy$/)
  await expect(page.getByRole('button', { name: 'Easy' })).toHaveAttribute('aria-pressed', 'true')
  await expect(list).toHaveCount(titles('Easy').length)

  await page.getByRole('button', { name: 'Start a random one' }).click()
  await expect(page).toHaveURL(new RegExp(`#/coding/(${topicIds})/`))
  const heading = await page.getByRole('heading', { level: 1 }).innerText()
  expect(titles('Easy').some((t) => heading.startsWith(t))).toBe(true)

  // Filter changes replace the address, so Back returns to the list as it was left.
  await page.goBack()
  await expect(page).toHaveURL(/#\/coding\?difficulty=Easy$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/$/)
})
