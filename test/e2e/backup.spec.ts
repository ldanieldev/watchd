import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import { makeUser, registerViaApi } from './helpers'

const FLOPPY_CSV = [
  'row_type,media_id,media_type,title,end_date',
  'media,603,movie,The Matrix,2020-01-02 03:04:00+00:00',
  'media,438631,movie,Dune,2021-05-06 07:08:00+00:00',
  ''
].join('\n')
const IMPORTED_PLAY_COUNT = 2

async function uploadOnCard(page: Page, cardLabel: string, buttonLabel: string, file: { name: string, mimeType: string, buffer: Buffer }) {
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: cardLabel, exact: true }) })
  await card.locator('input[type="file"]').setInputFiles(file)
  await card.getByRole('button', { name: buttonLabel }).click()
  return card
}

const summaryCount = (card: ReturnType<Page['locator']>, label: string) =>
  card.getByRole('status').getByRole('term').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).locator('xpath=./following-sibling::dd[1]')

test('plays imported from Floppy survive an export and restore as duplicates', async ({ page, goto, request }) => {
  await goto('/auth/login', { waitUntil: 'hydration' })
  await registerViaApi(page, makeUser())

  await goto('/settings/import', { waitUntil: 'hydration' })
  const floppyCard = await uploadOnCard(page, 'Floppy', 'Import plays', { name: 'floppy.csv', mimeType: 'text/csv', buffer: Buffer.from(FLOPPY_CSV) })
  await expect(summaryCount(floppyCard, 'Added')).toHaveText(String(IMPORTED_PLAY_COUNT))

  await goto('/settings/advanced', { waitUntil: 'hydration' })
  await page.getByLabel('Token name').fill('e2e-backup')
  await page.getByRole('button', { name: 'Create token' }).click()
  const token = (await page.getByRole('status').locator('code').innerText()).trim()
  expect(token).toMatch(/^wd_[\w-]{43}$/)

  const exportUrl = `${new URL(page.url()).origin}/api/export`
  expect((await request.get(exportUrl)).status()).toBe(401)

  const exportResponse = await request.get(exportUrl, { headers: { authorization: `Bearer ${token}` } })
  expect(exportResponse.status()).toBe(200)
  const backup = await exportResponse.json()
  expect(backup.format).toBe('watchd-backup')
  expect(backup.plays).toHaveLength(IMPORTED_PLAY_COUNT)

  await goto('/settings/import', { waitUntil: 'hydration' })
  const backupCard = await uploadOnCard(page, 'Watchd backup', 'Restore backup', {
    name: 'watchd-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))
  })
  await expect(summaryCount(backupCard, 'Added')).toHaveText('0')
  await expect(summaryCount(backupCard, 'Already in watchd')).toHaveText(String(IMPORTED_PLAY_COUNT))
})
