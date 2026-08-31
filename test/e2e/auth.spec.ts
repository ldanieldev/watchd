import { expect, test } from '@nuxt/test-utils/playwright'
import { makeUser, registerViaApi, uniqueEmail } from './helpers'

test.describe('auth guard', () => {
  test('redirects an unauthenticated visit to a protected route to /auth/login', async ({ page, goto }) => {
    await goto('/', { waitUntil: 'hydration' })
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  // Prerendering a guarded route runs this guard at build time, where there is no session, freezing its redirect into a static file.
  test('/ is server-rendered per request, so the guard sees the visitor session', async ({ page, goto }) => {
    const user = makeUser()
    await goto('/auth/login', { waitUntil: 'hydration' })
    await registerViaApi(page, user)

    // page.request is not usable here: its client withholds the secure session cookie over http, unlike the browser.
    const res = await page.goto(`${new URL(page.url()).origin}/`)
    const html = await res!.text()

    expect(res!.status()).toBe(200)
    expect(html).toContain('/_nuxt/')
    expect(new URL(page.url()).pathname).toBe('/')
  })
})

test.describe('credentials register / login / logout', () => {
  test('a newly registered account lands authenticated on the dashboard', async ({ page, goto }) => {
    const user = makeUser()
    await goto('/auth/register', { waitUntil: 'hydration' })

    await page.getByPlaceholder('Enter your full name').fill(user.name)
    await page.getByPlaceholder('Enter your email').fill(user.email)
    await page.getByPlaceholder('Create a password').fill(user.password)
    await page.getByPlaceholder('Confirm your password').fill(user.password)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).not.toHaveURL(/\/auth\//)
    await expect(page.getByRole('button', { name: user.name })).toBeVisible()
  })

  test('blocks registration when the two passwords differ', async ({ page, goto }) => {
    const user = makeUser()
    await goto('/auth/register', { waitUntil: 'hydration' })

    await page.getByPlaceholder('Enter your full name').fill(user.name)
    await page.getByPlaceholder('Enter your email').fill(user.email)
    await page.getByPlaceholder('Create a password').fill(user.password)
    await page.getByPlaceholder('Confirm your password').fill('differentpassword')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText('Passwords do not match')).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/register/)
  })

  test('logs in with valid credentials and reaches the dashboard', async ({ page, goto }) => {
    const user = makeUser()
    await goto('/auth/login', { waitUntil: 'hydration' })
    // Drop the session the seeding created, so the login form runs against an existing user.
    await registerViaApi(page, user)
    await page.context().clearCookies()
    await goto('/auth/login', { waitUntil: 'hydration' })

    await page.getByPlaceholder('Enter your email').fill(user.email)
    await page.getByPlaceholder('Enter your password').fill(user.password)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).not.toHaveURL(/\/auth\//)
    await expect(page.getByRole('button', { name: user.name })).toBeVisible()
  })

  test('shows an error toast and stays on the login page for bad credentials', async ({ page, goto }) => {
    await goto('/auth/login', { waitUntil: 'hydration' })

    await page.getByPlaceholder('Enter your email').fill(uniqueEmail('nope'))
    await page.getByPlaceholder('Enter your password').fill('wrongpassword') // ≥8 chars to pass client validation
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText('Login failed', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('logs out via the user menu and re-blocks protected routes', async ({ page, goto }) => {
    const user = makeUser()
    await goto('/auth/login', { waitUntil: 'hydration' })
    await registerViaApi(page, user)
    await goto('/', { waitUntil: 'hydration' })

    await page.getByRole('button', { name: user.name }).click()
    await page.getByRole('menuitem', { name: 'Log out' }).click()

    // The default layout watches loggedIn and redirects on sign-out.
    await expect(page).toHaveURL(/\/auth\/login/)
    await goto('/', { waitUntil: 'hydration' })
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
