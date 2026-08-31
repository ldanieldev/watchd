import type { Page } from '@playwright/test'

// The e2e DB persists between runs, so registrations must not collide on users_email_unique.
export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

export interface TestUser {
  name: string
  email: string
  password: string
}

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  return { name: 'E2E User', email: uniqueEmail(), password: 'password123', ...overrides }
}

/**
 * Seeds a user through /api/auth/register and leaves the page authenticated as them.
 *
 * The endpoint calls setUserSession, and page.request shares a cookie jar with the
 * browser context, so the session it creates is visible to subsequent navigations.
 *
 * @param page - must have navigated already; the origin is resolved from page.url().
 */
export async function registerViaApi(page: Page, user: TestUser) {
  const base = new URL(page.url()).origin
  const res = await page.request.post(`${base}/api/auth/register`, {
    data: { name: user.name, email: user.email, password: user.password }
  })
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`)
  return user
}
