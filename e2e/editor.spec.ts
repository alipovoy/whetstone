import { expect, test } from '@playwright/test'

test('the editor indents Python by 4 spaces and Tab indents', async ({ page }) => {
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Start / })
    .first()
    .click()
  const editor = page.getByRole('textbox', { name: 'Solution code' })
  const text = () => editor.innerText()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')

  await page.keyboard.type('def f(xs):\nfor x in xs:\nx')
  expect(await text()).toBe('def f(xs):\n    for x in xs:\n        x')

  await page.keyboard.press('Tab')
  expect(await text()).toBe('def f(xs):\n    for x in xs:\n            x')
  await page.keyboard.press('Shift+Tab')
  expect(await text()).toBe('def f(xs):\n    for x in xs:\n        x')
  await expect(editor).toBeFocused()

  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await expect(editor).not.toBeFocused()
})
