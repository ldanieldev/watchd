import { expect, test } from '@nuxt/test-utils/playwright'
import type { SearchHit } from '~~/shared/types/search'
import { makeUser, registerViaApi } from './helpers'

const attackOnTitan: SearchHit = {
  titleId: '12',
  type: 'anime',
  name: 'Attack on Titan',
  year: '2013',
  posterPath: null,
  matchedAlias: 'Shingeki no Kyojin'
}

test.describe('library search bar', () => {
  // The e2e server's Inngest events reach the dev app, not this server, so its search index is never filled; the API is stubbed instead.
  test('opens a title from the dropdown', async ({ page, goto }) => {
    await page.route('**/api/search*', route => route.fulfill({ json: [attackOnTitan] }))
    await goto('/auth/login', { waitUntil: 'hydration' })
    await registerViaApi(page, makeUser())
    await goto('/', { waitUntil: 'hydration' })

    await page.getByRole('combobox', { name: 'Search your library' }).fill('attak')
    const option = page.getByRole('option', { name: /Attack on Titan/ })
    await expect(option).toContainText('also: Shingeki no Kyojin')
    await option.click()

    await expect(page).toHaveURL(/\/anime\/12$/)
  })
})
