import { expect, test } from '@playwright/test'

const reference = 'def count_vowels(s):\n    return sum(c in "aeiou" for c in s.lower())\n'

// What a chat might answer to the prompt: prose around one JSON block.
const answer = `Here is your problem.

\`\`\`json
${JSON.stringify({
  problems: [
    {
      concept: { name: 'Counting', group: 'Strings' },
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
    await page.getByRole('button', { name: 'Copy Chat bot request for problems' }).click()
    return page.evaluate(() => navigator.clipboard.readText())
  }
  await page.goto('./')
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('textbox', { name: 'New topic name' }).fill('Strings')
  await page.getByRole('button', { name: 'Create topic' }).click()
  await page.getByText('Chat bot request for problems').click()
  expect(await copied()).toContain(
    'Write 3 new Python coding interview problems for the topic "Strings"',
  )

  await page.getByRole('button', { name: 'New problem' }).click()
  await page.getByRole('textbox', { name: 'Problem JSON' }).fill(answer)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Topic problems' })
      .getByRole('listitem', { name: 'Count vowels' }),
  ).toBeVisible({ timeout: 90_000 })
  expect(await copied()).toContain('do not repeat them:\n- Count vowels')

  await page.reload()
  await page.getByRole('button', { name: 'Start Count vowels' }).click()
  const editor = page.getByRole('textbox', { name: 'Solution code' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(reference)
  await page.getByRole('button', { name: 'Grade' }).click()
  await expect(page.getByRole('region', { name: 'Grade' })).toContainText('Score: 100 / 100')
})
