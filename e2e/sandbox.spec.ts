import { expect, test } from '@playwright/test'

const probe = `import js
for name in ["indexedDB", "caches", "XMLHttpRequest", "WebSocket", "Worker", "importScripts"]:
    print(name, hasattr(js, name))
print("fetch", "blocked" if "Network access is blocked" in str(js.fetch) else "open")
import numpy
print("packages load")
`

test('Python in the worker cannot reach stored data or the network', async ({ page }) => {
  await page.goto('./#/coding')
  await page
    .getByRole('button', { name: /^Start / })
    .first()
    .click()
  await expect(page.getByText('Python is ready')).toBeVisible({ timeout: 90_000 })
  const editor = page.getByRole('textbox', { name: 'Solution code' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(probe)
  // The completion list may open over the buttons below the editor.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const output = page.getByRole('region', { name: 'Output' })
  await expect(output).toContainText('packages load', { timeout: 60_000 })
  for (const name of [
    'indexedDB',
    'caches',
    'XMLHttpRequest',
    'WebSocket',
    'Worker',
    'importScripts',
  ]) {
    await expect(output).toContainText(`${name} False`)
  }
  await expect(output).toContainText('fetch blocked')
})
