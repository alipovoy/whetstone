import { expect, test } from '@playwright/test'

const reference = 'def count_vowels(s):\n    return sum(c in "aeiou" for c in s.lower())\n'

// What a chat might answer to the prompt: prose around one JSON block.
const answer = `Here is your problem.

\`\`\`json
${JSON.stringify({
  problems: [
    {
      concepts: [{ name: 'Counting', group: 'Strings' }],
      difficulty: 'Easy',
      language: 'python',
      wordings: [
        {
          title: 'Count vowels',
          statement: 'Return how many vowels `s` holds.',
          examples: [{ input: 's = "Hello"', output: '2' }],
          constraints: [],
        },
      ],
      starter_code: 'def count_vowels(s):\n    pass\n',
      reference_solution: reference,
      tests:
        'from solution import count_vowels\n\ndef test_example():\n    """Example"""\n    assert count_vowels("Hello") == 2\n\ndef test_upper():\n    """Capitals"""\n    assert count_vowels("AEIOU") == 5\n',
      visible_tests: ['test_example'],
      hints: ['Look at each letter', 'Lowercase first', 'Count letters in "aeiou"'],
      summary: 'Counting characters.',
    },
  ],
})}
\`\`\``

test('create a topic, fill it from a chat, solve a problem from it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const copied = async () => {
    await page.getByRole('button', { name: 'Copy Prompt' }).click()
    return page.evaluate(() => navigator.clipboard.readText())
  }
  const library = page
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Coding problems' })
  await page.goto('./')
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Topics' }).click()
  await page.getByRole('textbox', { name: 'New topic name' }).fill('Strings')
  await page.getByRole('button', { name: 'Create topic' }).click()
  await library.click()
  await page.getByRole('link', { name: 'Add problems' }).click()
  await page.getByLabel('Topic').selectOption({ label: 'Strings' })
  expect(await copied()).toContain(
    'Write 3 new Python coding interview problems for the topic "Strings"',
  )

  await page.getByRole('textbox', { name: 'Chat bot answer' }).fill(answer)
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Passes the check.')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Add 1 problem' }).click()
  await expect(page.getByText('Added 1 problem to Strings.')).toBeVisible()

  await page.getByRole('link', { name: 'Add problems' }).click()
  expect(await copied()).toContain('do not repeat them:\n- Count vowels')

  await page.reload()
  await library.click()
  await page.getByRole('link', { name: 'Count vowels' }).click()
  await expect(page.getByRole('region', { name: 'Reference solution' })).toBeVisible()
  await page.getByRole('button', { name: 'Try it' }).click()
  const editor = page.getByRole('textbox', { name: 'Solution code' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(reference)
  // The completion list may open over the buttons below the editor.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Grade' }).click()
  await expect(page.getByRole('region', { name: 'Grade' })).toContainText('Score: 100 / 100')
})
