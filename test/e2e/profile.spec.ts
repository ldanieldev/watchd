import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import type { TestUser } from './helpers'
import { makeUser, registerViaApi } from './helpers'

type Goto = (path: string, options?: { waitUntil?: 'hydration' }) => Promise<unknown>

async function gotoProfileAs(page: Page, goto: Goto, user: TestUser) {
  await goto('/auth/login', { waitUntil: 'hydration' })
  await registerViaApi(page, user)
  await goto('/settings/profile', { waitUntil: 'hydration' })
}

async function logInWith(page: Page, goto: Goto, email: string, password: string) {
  await goto('/auth/login', { waitUntil: 'hydration' })
  await page.getByPlaceholder('Enter your email').fill(email)
  await page.getByPlaceholder('Enter your password').fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
}

test.describe('profile information', () => {
  test('renames the account and the new name survives a reload', async ({ page, goto }) => {
    const user = makeUser()
    await gotoProfileAs(page, goto, user)

    await page.getByPlaceholder('Enter your name').fill('Renamed User')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Profile updated', { exact: true })).toBeVisible()

    await page.reload()

    await expect(page.getByPlaceholder('Enter your name')).toHaveValue('Renamed User')
    await expect(page.getByRole('button', { name: 'Renamed User' })).toBeVisible()
  })
})

test.describe('password change', () => {
  test('rejects a change when the current password is wrong', async ({ page, goto }) => {
    const user = makeUser()
    await gotoProfileAs(page, goto, user)

    await page.getByLabel('Current Password', { exact: true }).fill('wrongpassword')
    await page.getByLabel('New Password', { exact: true }).fill('brandnewpass123')
    await page.getByLabel('Confirm Password', { exact: true }).fill('brandnewpass123')
    await page.getByRole('button', { name: 'Change password' }).click()

    await expect(page.getByText('Current password is incorrect', { exact: true })).toBeVisible()
  })

  test('changes the password and the new one works on the next login', async ({ page, goto }) => {
    const user = makeUser()
    const newPassword = 'brandnewpass123'
    await gotoProfileAs(page, goto, user)

    await page.getByLabel('Current Password', { exact: true }).fill(user.password)
    await page.getByLabel('New Password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm Password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed', { exact: true })).toBeVisible()

    await page.context().clearCookies()
    await logInWith(page, goto, user.email, newPassword)

    await expect(page).not.toHaveURL(/\/auth\//)
    await expect(page.getByRole('button', { name: user.name })).toBeVisible()
  })
})

test.describe('account deletion', () => {
  test('needs the modal confirmation before anything is deleted', async ({ page, goto }) => {
    const user = makeUser()
    await gotoProfileAs(page, goto, user)

    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await page.reload()
    await expect(page).toHaveURL(/\/settings\/profile/)
  })

  test('deletes the account, redirects to login, and invalidates the credentials', async ({ page, goto }) => {
    const user = makeUser()
    await gotoProfileAs(page, goto, user)

    await page.getByRole('button', { name: 'Delete account' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    // the default layout watches loggedIn, so clearing the session bounces us out
    await expect(page).toHaveURL(/\/auth\/login/)

    await logInWith(page, goto, user.email, user.password)

    await expect(page.getByText('Login failed', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
