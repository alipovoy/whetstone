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

test('switch the colour scheme, in light and dark, and keep it', async ({ page }) => {
  await page.goto('./#/settings/appearance')
  const accent = () =>
    page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bs-primary').trim())
  await page.getByRole('button', { name: 'Light theme' }).click()
  await expect.poll(accent).toBe('#2c6a8c')

  await page.getByRole('radio', { name: /Sunset/ }).check()
  await expect.poll(accent).toBe('#c03f12')
  await page.getByRole('button', { name: 'Dark theme' }).click()
  await expect.poll(accent).toBe('#f38c5c')
  await page.reload()
  await expect(page.getByRole('radio', { name: /Sunset/ })).toBeChecked()
  await expect.poll(accent).toBe('#f38c5c')

  await page.getByRole('radio', { name: /Rainbow/ }).check()
  const underline = (label: string) =>
    page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: label })
      .evaluate((a) => getComputedStyle(a).borderBottomColor)
  const settings = await underline('Settings')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Quizzes' })
    .click()
  expect(await underline('Quizzes')).not.toBe(settings)
})
