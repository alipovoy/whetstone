import { expect, test } from '@playwright/test'

test('resize the panes, collapse one, keep the layout after reload', async ({ page }) => {
  await page.goto('./#/coding/algorithms/pair-with-sum')
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
  await expect(separator).toHaveAttribute('aria-valuenow', '35')
  const left = (await problem.boundingBox())!.width
  expect(left).toBeLessThan((await code.boundingBox())!.width)

  await page.getByRole('button', { name: 'Collapse Code' }).click()
  await expect(code).toBeHidden()
  await expect(page.getByRole('button', { name: 'Collapse Problem' })).toBeHidden()

  await page.reload()
  await expect(code).toBeHidden()
  await page.getByRole('button', { name: 'Expand Code' }).click()
  await expect(code).toBeVisible()
  await expect(separator).toHaveAttribute('aria-valuenow', '35')
})

test('stack the panes on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('./#/coding/algorithms/pair-with-sum')
  const problem = (await page.getByRole('region', { name: 'Problem' }).boundingBox())!
  const code = (await page.getByRole('region', { name: 'Code' }).boundingBox())!
  expect(code.y).toBeGreaterThan(problem.y + problem.height - 1)
  await expect(page.getByRole('separator')).toBeHidden()
})
