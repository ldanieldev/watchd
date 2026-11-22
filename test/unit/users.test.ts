import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { users } from '~~/server/db/schema'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const harness = createServerHandlerHarness()
const { selectColumns, returningColumns, updateSet, deleteWhere, setUserSession, clearUserSession } = harness.mocks

type Handler = (e: unknown) => Promise<unknown>

const getUser = (await import('~~/server/api/users/[id].get')).default as Handler
const updateUser = (await import('~~/server/api/users/[id].put')).default as Handler
const deleteUser = (await import('~~/server/api/users/[id].delete')).default as Handler

const owner = { id: 1, email: 'owner@example.com', name: 'Owner' }
const columnsOf = (spy: typeof selectColumns) => Object.keys(spy.mock.calls[0]?.[0] as object)

beforeEach(() => harness.reset())

describe('GET /api/users/:id', () => {
  const read = (id: string) => getUser(event({ params: { id } }))

  it('rejects an unauthenticated request with 401', async () => {
    await expect(read('1')).rejects.toMatchObject({ statusCode: 401 })
    expect(selectColumns).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-numeric id', 'abc'],
    ['an empty id', ''],
    ['a zero id', '0']
  ])('rejects %s with 400', async (_label, id) => {
    harness.setSession({ user: owner })

    await expect(read(id)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects reading another account with 403', async () => {
    harness.setSession({ user: owner })

    await expect(read('2')).rejects.toMatchObject({ statusCode: 403 })
    expect(selectColumns).not.toHaveBeenCalled()
  })

  it('rejects an own id with no matching row with 404', async () => {
    harness.setSession({ user: owner })
    harness.givenDb({ select: [[]] })

    await expect(read('1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns the own user without the password column', async () => {
    harness.setSession({ user: owner })
    harness.givenDb({ select: [[owner]] })

    await expect(read('1')).resolves.toEqual(owner)
    expect(columnsOf(selectColumns)).not.toContain('password')
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
