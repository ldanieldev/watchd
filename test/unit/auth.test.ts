import { beforeEach, describe, expect, it, vi } from 'vitest'

interface DbRows { select?: unknown[][], insert?: unknown[] }

let selectQueue: unknown[][] = []
let insertReturn: unknown[] = []
const insertValues = vi.fn(() => ({ returning: () => Promise.resolve(insertReturn) }))
const updateSet = vi.fn(() => ({ where: () => Promise.resolve() }))
const setUserSession = vi.fn(() => Promise.resolve())
let session: { user?: { id: string } } = {}

const db = {
  select: () => {
    const rows = selectQueue.shift() ?? []
    const chain: Record<string, unknown> = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows)
    }
    return chain
  },
  insert: () => ({ values: insertValues }),
  update: () => ({ set: updateSet })
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', (event: { body: unknown }) => Promise.resolve(event.body))
vi.stubGlobal('createError', (opts: { statusCode: number, statusMessage: string }) =>
  Object.assign(new Error(opts.statusMessage), opts))
vi.stubGlobal('withQuerySpan', (_name: string, fn: () => Promise<unknown>) => fn())
vi.stubGlobal('db', db)
vi.stubGlobal('hashPassword', (plain: string) => Promise.resolve(`scrypt:${plain}`))
vi.stubGlobal('verifyPassword', (hash: string, plain: string) => Promise.resolve(hash === `scrypt:${plain}`))
vi.stubGlobal('setUserSession', setUserSession)
vi.stubGlobal('getUserSession', () => Promise.resolve(session))

const register = (await import('~~/server/api/auth/register.post')).default as (e: unknown) => Promise<unknown>
const login = (await import('~~/server/api/auth/login.post')).default as (e: unknown) => Promise<unknown>
const changePassword = (await import('~~/server/api/auth/password.put')).default as (e: unknown) => Promise<unknown>

function givenDb({ select = [], insert = [] }: DbRows) {
  selectQueue = [...select]
  insertReturn = insert
}

const event = (body: unknown) => ({ body })

beforeEach(() => {
  vi.clearAllMocks()
  givenDb({})
  session = {}
})

describe('POST /api/auth/register', () => {
  it.each([
    ['a password under 8 characters', { name: 'A', email: 'a@example.com', password: 'short' }],
    ['a malformed email', { name: 'A', email: 'not-an-email', password: 'password123' }],
    ['an empty name', { name: '', email: 'a@example.com', password: 'password123' }]
  ])('rejects %s with 400', async (_label, body) => {
    await expect(register(event(body))).rejects.toMatchObject({ statusCode: 400 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('rejects an email that is already registered with 409', async () => {
    givenDb({ select: [[{ id: 'existing', password: 'scrypt:whatever' }]] })

    await expect(
      register(event({ name: 'A', email: 'taken@example.com', password: 'password123' }))
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('stores a hash rather than the submitted password', async () => {
    givenDb({ select: [[]], insert: [{ id: '1', email: 'a@example.com', name: 'A' }] })

    await register(event({ name: 'A', email: 'a@example.com', password: 'password123' }))

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ password: 'scrypt:password123' }))
  })

  it('opens a session for the new user', async () => {
    givenDb({ select: [[]], insert: [{ id: 'new-id', email: 'a@example.com', name: 'A' }] })

    await expect(register(event({ name: 'A', email: 'a@example.com', password: 'password123' }))).resolves.toEqual({ success: true })
    expect(setUserSession).toHaveBeenCalledWith(expect.anything(), {
      user: { id: 'new-id', email: 'a@example.com', name: 'A' }
    })
  })
})

describe('POST /api/auth/login', () => {
  const credentials = { email: 'a@example.com', password: 'password123' }

  it('rejects an unknown email with 401', async () => {
    givenDb({ select: [[]] })

    await expect(login(event(credentials))).rejects.toMatchObject({ statusCode: 401 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('rejects an account with no password set with 401', async () => {
    givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: null }]] })

    await expect(login(event(credentials))).rejects.toMatchObject({ statusCode: 401 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('rejects a wrong password with 401', async () => {
    givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: 'scrypt:different' }]] })

    await expect(login(event(credentials))).rejects.toMatchObject({ statusCode: 401 })
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('reports the same message for an unknown email and a wrong password', async () => {
    givenDb({ select: [[]] })
    const unknownEmail = await login(event(credentials)).catch((e: Error) => e.message)
    givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: 'scrypt:different' }]] })
    const wrongPassword = await login(event(credentials)).catch((e: Error) => e.message)

    expect(unknownEmail).toBe(wrongPassword)
  })

  it('opens a session on valid credentials', async () => {
    givenDb({ select: [[{ id: '1', email: credentials.email, name: 'A', password: 'scrypt:password123' }]] })

    await expect(login(event(credentials))).resolves.toEqual({ success: true })
    expect(setUserSession).toHaveBeenCalledWith(expect.anything(), {
      user: { id: '1', email: credentials.email, name: 'A' }
    })
  })
})

describe('PUT /api/auth/password', () => {
  it('rejects an unauthenticated request with 401', async () => {
    await expect(changePassword(event({ newPassword: 'newpassword123' }))).rejects.toMatchObject({ statusCode: 401 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('rejects a new password under 8 characters with 400', async () => {
    session = { user: { id: '1' } }

    await expect(changePassword(event({ newPassword: 'short' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('requires the current password when the account already has one', async () => {
    session = { user: { id: '1' } }
    givenDb({ select: [[{ id: '1', password: 'scrypt:oldpassword' }]] })

    await expect(changePassword(event({ newPassword: 'newpassword123' }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password with 401', async () => {
    session = { user: { id: '1' } }
    givenDb({ select: [[{ id: '1', password: 'scrypt:oldpassword' }]] })

    await expect(
      changePassword(event({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' }))
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('skips the current-password check for an account that has none', async () => {
    session = { user: { id: '1' } }
    givenDb({ select: [[{ id: '1', password: null }]] })

    await expect(changePassword(event({ newPassword: 'newpassword123' }))).resolves.toEqual({ success: true })
    expect(updateSet).toHaveBeenCalledWith({ password: 'scrypt:newpassword123' })
  })

  it('stores a hash of the new password', async () => {
    session = { user: { id: '1' } }
    givenDb({ select: [[{ id: '1', password: 'scrypt:oldpassword' }]] })

    await changePassword(event({ currentPassword: 'oldpassword', newPassword: 'newpassword123' }))

    expect(updateSet).toHaveBeenCalledWith({ password: 'scrypt:newpassword123' })
  })
})
