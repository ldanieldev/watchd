import { beforeEach, describe, expect, it } from 'vitest'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const harness = createServerHandlerHarness()
const { insertValues, updateSet, setUserSession } = harness.mocks

type Handler = (e: unknown) => Promise<unknown>

const register = (await import('~~/server/api/auth/register.post')).default as Handler
const login = (await import('~~/server/api/auth/login.post')).default as Handler
const changePassword = (await import('~~/server/api/auth/password.put')).default as Handler

const bodyEvent = (body: unknown) => event({ body })

beforeEach(() => harness.reset())

describe('POST /api/auth/register', () => {
  it.each([
    ['a password under 8 characters', { name: 'A', email: 'a@example.com', password: 'short' }],
    ['a malformed email', { name: 'A', email: 'not-an-email', password: 'password123' }],
    ['an empty name', { name: '', email: 'a@example.com', password: 'password123' }]
  ])('rejects %s with 400', async (_label, body) => {
    await expect(register(bodyEvent(body))).rejects.toMatchObject({ statusCode: 400 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('rejects an email that is already registered with 409', async () => {
    harness.givenDb({ select: [[{ id: 'existing', password: 'scrypt:whatever' }]] })

    await expect(
      register(bodyEvent({ name: 'A', email: 'taken@example.com', password: 'password123' }))
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('stores a hash rather than the submitted password', async () => {
    harness.givenDb({ select: [[]], insert: [{ id: '1', email: 'a@example.com', name: 'A' }] })

    await register(bodyEvent({ name: 'A', email: 'a@example.com', password: 'password123' }))

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ password: 'scrypt:password123' }))
  })

  it('opens a session for the new user', async () => {
    harness.givenDb({ select: [[]], insert: [{ id: 'new-id', email: 'a@example.com', name: 'A' }] })

    await expect(register(bodyEvent({ name: 'A', email: 'a@example.com', password: 'password123' }))).resolves.toEqual({ success: true })
    expect(setUserSession).toHaveBeenCalledWith(expect.anything(), {
      user: { id: 'new-id', email: 'a@example.com', name: 'A' }
    })
  })
})

describe('POST /api/auth/login', () => {
  const credentials = { email: 'a@example.com', password: 'password123' }

  it('rejects an unknown email with 401', async () => {
    harness.givenDb({ select: [[]] })

    await expect(login(bodyEvent(credentials))).rejects.toMatchObject({ statusCode: 401 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('rejects an account with no password set with 401', async () => {
    harness.givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: null }]] })

    await expect(login(bodyEvent(credentials))).rejects.toMatchObject({ statusCode: 401 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('rejects a wrong password with 401', async () => {
    harness.givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: 'scrypt:different' }]] })

    await expect(login(bodyEvent(credentials))).rejects.toMatchObject({ statusCode: 401 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('reports the same message for an unknown email and a wrong password', async () => {
    harness.givenDb({ select: [[]] })
    const unknownEmail = await login(bodyEvent(credentials)).catch((e: Error) => e.message)
    harness.givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: 'scrypt:different' }]] })
    const wrongPassword = await login(bodyEvent(credentials)).catch((e: Error) => e.message)

    expect(unknownEmail).toBe(wrongPassword)
  })

  it('opens a session on valid credentials', async () => {
    harness.givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: 'scrypt:password123' }]] })

    await expect(login(bodyEvent(credentials))).resolves.toEqual({ success: true })
    expect(setUserSession).toHaveBeenCalledWith(expect.anything(), {
      user: { id: '1', email: credentials.email, name: 'A' }
    })
  })
})

describe('PUT /api/auth/password', () => {
  it('rejects an unauthenticated request with 401', async () => {
    await expect(changePassword(bodyEvent({ newPassword: 'newpassword123' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('rejects a new password under 8 characters with 400', async () => {
    harness.setSession({ user: { id: 1 } })

    await expect(changePassword(bodyEvent({ newPassword: 'short' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('requires the current password when the account already has one', async () => {
    harness.setSession({ user: { id: 1 } })
    harness.givenDb({ select: [[{ id: '1', password: 'scrypt:oldpassword' }]] })

    await expect(changePassword(bodyEvent({ newPassword: 'newpassword123' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password with 401', async () => {
    harness.setSession({ user: { id: 1 } })
    harness.givenDb({ select: [[{ id: '1', password: 'scrypt:oldpassword' }]] })

    await expect(
      changePassword(bodyEvent({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' }))
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('skips the current-password check for an account that has none', async () => {
    harness.setSession({ user: { id: 1 } })
    harness.givenDb({ select: [[{ id: '1', password: null }]] })

    await expect(changePassword(bodyEvent({ newPassword: 'newpassword123' }))).resolves.toEqual({ success: true })
    expect(updateSet).toHaveBeenCalledWith({ password: 'scrypt:newpassword123' })
  })

  it('stores a hash of the new password', async () => {
    harness.setSession({ user: { id: 1 } })
    harness.givenDb({ select: [[{ id: '1', password: 'scrypt:oldpassword' }]] })

    await changePassword(bodyEvent({ currentPassword: 'oldpassword', newPassword: 'newpassword123' }))

    expect(updateSet).toHaveBeenCalledWith({ password: 'scrypt:newpassword123' })
  })
})
