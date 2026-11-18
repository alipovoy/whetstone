import { expect, test } from '@playwright/test'

test('move between the sections from the top bar, reload, switch the theme', async ({ page }) => {
  await page.goto('./')
  const menu = page.getByRole('navigation', { name: 'Main' })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Practise for the technical interview',
  )

  for (const [label, heading] of [
    ['Coding problems', 'Coding problems'],
    ['Quizzes', 'Quizzes'],
    ['Reports', 'Coding problems'],
    ['Settings', 'Appearance'],
  ]) {
    await menu.getByRole('link', { name: label }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(menu.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  }

  await page
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Topics' })
    .click()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Topics')
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Appearance')

  const html = page.locator('html')
  await page.getByRole('button', { name: 'Dark theme' }).click()
  await expect(html).toHaveAttribute('data-bs-theme', 'dark')
  await page.reload()
  await expect(html).toHaveAttribute('data-bs-theme', 'dark')
  await page.getByRole('button', { name: 'Light theme' }).click()
  await expect(html).toHaveAttribute('data-bs-theme', 'light')

  await page.getByRole('link', { name: 'Whetstone' }).click()
  await expect(page).toHaveURL(/#\/$/)
})
