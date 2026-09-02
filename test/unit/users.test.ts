import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/db/schema'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const harness = createServerHandlerHarness()
const { selectColumns, returningColumns, insertValues, updateSet, deleteWhere, setUserSession, clearUserSession } = harness.mocks

type Handler = (e: unknown) => Promise<unknown>

const listUsers = (await import('~~/server/api/users/index.get')).default as Handler
const createUser = (await import('~~/server/api/users/index.post')).default as Handler
const getUser = (await import('~~/server/api/users/[id].get')).default as Handler
const updateUser = (await import('~~/server/api/users/[id].put')).default as Handler
const deleteUser = (await import('~~/server/api/users/[id].delete')).default as Handler

const owner = { id: 1, email: 'owner@example.com', name: 'Owner' }
const columnsOf = (spy: typeof selectColumns) => Object.keys(spy.mock.calls[0]?.[0] as object)

beforeEach(() => harness.reset())

describe('GET /api/users', () => {
  it('returns every user row', async () => {
    harness.givenDb({ select: [[{ id: 1 }, { id: 2 }]] })

    await expect(listUsers(event())).resolves.toEqual([{ id: 1 }, { id: 2 }])
  })

  it('never selects the password column', async () => {
    harness.givenDb({ select: [[]] })

    await listUsers(event())

    expect(columnsOf(selectColumns)).not.toContain('password')
    expect(columnsOf(selectColumns)).toContain('email')
  })
})

describe('GET /api/users/:id', () => {
  it.each([
    ['a non-numeric id', 'abc'],
    ['an empty id', ''],
    ['a zero id', '0']
  ])('rejects %s with 400', async (_label, id) => {
    await expect(getUser(event({ params: { id } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an id with no matching row with 404', async () => {
    harness.givenDb({ select: [[]] })

    await expect(getUser(event({ params: { id: '9' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns the matching user', async () => {
    harness.givenDb({ select: [[owner]] })

    await expect(getUser(event({ params: { id: '1' } }))).resolves.toEqual(owner)
  })

  it('never selects the password column', async () => {
    harness.givenDb({ select: [[owner]] })

    await getUser(event({ params: { id: '1' } }))

    expect(columnsOf(selectColumns)).not.toContain('password')
  })
})

describe('POST /api/users', () => {
  const body = { name: 'A', email: 'a@example.com', password: 'password123' }

  it.each([
    ['a malformed email', { ...body, email: 'not-an-email' }],
    ['a missing name', { email: 'a@example.com', password: 'password123' }],
    ['a missing password', { name: 'A', email: 'a@example.com' }]
  ])('rejects %s with 400', async (_label, invalid) => {
    await expect(createUser(event({ body: invalid }))).rejects.toMatchObject({ statusCode: 400 })
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('stores a hash rather than the submitted password', async () => {
    harness.givenDb({ insert: [{ id: 1 }] })

    await createUser(event({ body }))

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ password: 'scrypt:password123' }))
  })

  it('translates a unique-violation into a 409', async () => {
    harness.givenDb({ insertError: Object.assign(new Error('duplicate key'), { code: '23505' }) })

    await expect(createUser(event({ body }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rethrows a database error that is not a unique violation', async () => {
    harness.givenDb({ insertError: Object.assign(new Error('connection lost'), { code: '08006' }) })

    await expect(createUser(event({ body }))).rejects.toThrow('connection lost')
  })

  it('returns the created row without its password column', async () => {
    harness.givenDb({ insert: [{ id: 1, ...body, password: undefined }] })

    await expect(createUser(event({ body }))).resolves.toMatchObject({ id: 1 })
    expect(columnsOf(returningColumns)).not.toContain('password')
  })
})

describe('PUT /api/users/:id', () => {
  const body = { name: 'New Name', email: 'owner@example.com' }

  it('rejects an unauthenticated request with 401', async () => {
    await expect(updateUser(event({ params: { id: '1' }, body }))).rejects.toMatchObject({ statusCode: 401 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-numeric id', 'abc'],
    ['a zero id', '0']
  ])('rejects %s with 400', async (_label, id) => {
    harness.setSession({ user: owner })

    await expect(updateUser(event({ params: { id }, body }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('rejects updating another account with 403', async () => {
    harness.setSession({ user: owner })

    await expect(updateUser(event({ params: { id: '2' }, body }))).rejects.toMatchObject({ statusCode: 403 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty name', { name: '', email: 'owner@example.com' }],
    ['a malformed email', { name: 'A', email: 'not-an-email' }]
  ])('rejects %s with 400', async (_label, invalid) => {
    harness.setSession({ user: owner })

    await expect(updateUser(event({ params: { id: '1' }, body: invalid }))).rejects.toMatchObject({ statusCode: 400 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('rejects an email already held by another account with 409', async () => {
    harness.setSession({ user: owner })
    harness.givenDb({ select: [[{ id: 2 }]] })

    await expect(
      updateUser(event({ params: { id: '1' }, body: { name: 'A', email: 'taken@example.com' } }))
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(updateSet).not.toHaveBeenCalled()
  })

  it('skips the uniqueness lookup when the email is unchanged', async () => {
    harness.setSession({ user: owner })
    harness.givenDb({ update: [{ ...owner, name: 'New Name' }] })

    await updateUser(event({ params: { id: '1' }, body }))

    expect(selectColumns).not.toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledWith({ name: 'New Name', email: 'owner@example.com' })
  })

  it('updates the account and returns the new row', async () => {
    const updated = { ...owner, name: 'New Name', email: 'new@example.com' }
    harness.setSession({ user: owner })
    harness.givenDb({ select: [[]], update: [updated] })

    await expect(
      updateUser(event({ params: { id: '1' }, body: { name: 'New Name', email: 'new@example.com' } }))
    ).resolves.toEqual(updated)
  })

  it('refreshes the session with the updated row', async () => {
    const updated = { ...owner, name: 'New Name' }
    harness.setSession({ user: owner })
    harness.givenDb({ update: [updated] })

    await updateUser(event({ params: { id: '1' }, body }))

    expect(setUserSession).toHaveBeenCalledWith(expect.anything(), { user: updated })
  })

  it('never returns the password column', async () => {
    harness.setSession({ user: owner })
    harness.givenDb({ update: [owner] })

    await updateUser(event({ params: { id: '1' }, body }))

    expect(columnsOf(returningColumns)).not.toContain('password')
  })
})

describe('DELETE /api/users/:id', () => {
  it('rejects an unauthenticated request with 401', async () => {
    await expect(deleteUser(event({ params: { id: '1' } }))).rejects.toMatchObject({ statusCode: 401 })
    expect(deleteWhere).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-numeric id', 'abc'],
    ['an empty id', ''],
    ['a zero id', '0']
  ])('rejects %s with 400', async (_label, id) => {
    harness.setSession({ user: owner })

    await expect(deleteUser(event({ params: { id } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(deleteWhere).not.toHaveBeenCalled()
  })

  it('rejects deleting another account with 403', async () => {
    harness.setSession({ user: owner })

    await expect(deleteUser(event({ params: { id: '2' } }))).rejects.toMatchObject({ statusCode: 403 })
    expect(deleteWhere).not.toHaveBeenCalled()
    expect(clearUserSession).not.toHaveBeenCalled()
  })

  it('deletes only the authenticated user row', async () => {
    harness.setSession({ user: owner })

    await expect(deleteUser(event({ params: { id: '1' } }))).resolves.toEqual({ success: true })
    expect(deleteWhere).toHaveBeenCalledWith(eq(users.id, 1))
  })

  it('clears the session after deleting', async () => {
    harness.setSession({ user: owner })

    await deleteUser(event({ params: { id: '1' } }))

    expect(clearUserSession).toHaveBeenCalled()
  })
})
