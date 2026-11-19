import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { topic, problems } = JSON.parse(readFileSync('src/content/algorithms.json', 'utf8'))
const address = `./#/coding/${topic.id}/${problems[0].id}`

test('resize the panes, collapse one, keep the layout after reload', async ({ page }) => {
  await page.goto(address)
  const problem = page.getByRole('region', { name: 'Problem' })
  const code = page.getByRole('region', { name: 'Code' })
  const separator = page.getByRole('separator', { name: 'Resize panes' })
  await expect(separator).toHaveAttribute('aria-valuenow', '50')

  const box = (await page.locator('.ws-split').boundingBox())!
  const handle = (await separator.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.35, handle.y + 100, { steps: 5 })
  await page.mouse.up()
  const dragged = Number(await separator.getAttribute('aria-valuenow'))
  expect(dragged).toBeGreaterThanOrEqual(33)
  expect(dragged).toBeLessThanOrEqual(35)
  const left = (await problem.boundingBox())!.width
  expect(left).toBeLessThan((await code.boundingBox())!.width)

  await page.getByRole('button', { name: 'Collapse Code' }).click()
  await expect(code).toBeHidden()
  await expect(page.getByRole('button', { name: 'Collapse Problem' })).toBeHidden()

  await page.reload()
  await expect(code).toBeHidden()
  await page.getByRole('button', { name: 'Expand Code' }).click()
  await expect(code).toBeVisible()
  await expect(separator).toHaveAttribute('aria-valuenow', String(dragged))
})

test('stack the panes on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto(address)
  const problem = (await page.getByRole('region', { name: 'Problem' }).boundingBox())!
  const code = (await page.getByRole('region', { name: 'Code' }).boundingBox())!
  expect(code.y).toBeGreaterThan(problem.y + problem.height - 1)
  await expect(page.getByRole('separator')).toBeHidden()
})
