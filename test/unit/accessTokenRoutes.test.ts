import { beforeEach, describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const harness = createServerHandlerHarness()

type Handler = (e: unknown) => Promise<unknown>
const listTokens = (await import('~~/server/api/tokens/index.get')).default as Handler
const createToken = (await import('~~/server/api/tokens/index.post')).default as Handler
const deleteToken = (await import('~~/server/api/tokens/[id].delete')).default as Handler

const renderWhere = (condition: unknown) => new PgDialect().sqlToQuery(condition as SQL)

const createdAt = new Date('2026-11-01T10:00:00Z')
const tokenRow = (overrides = {}) => ({ id: 3, name: 'laptop', prefix: 'abcdefgh', createdAt, lastUsedAt: null, ...overrides })

beforeEach(() => {
  harness.reset()
  harness.setSession({ user: { id: 7 } })
})

describe('GET /api/tokens', () => {
  it('rejects a request without a session with 401', async () => {
    harness.setSession({})

    await expect(listTokens(event())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns only the caller tokens, filtered by the session user', async () => {
    harness.givenDb({ select: [[tokenRow()]] })

    const result = await listTokens(event())

    expect(result).toEqual([{ id: 3, name: 'laptop', prefix: 'abcdefgh', createdAt: createdAt.toISOString(), lastUsedAt: null }])
    const rendered = renderWhere(harness.mocks.selectWhere.mock.calls[0]![0])
    expect(rendered.sql).toMatch(/"user_id" = \$\d/)
    expect(rendered.params).toEqual([7])
  })
})

describe('POST /api/tokens', () => {
  it('rejects a request without a session with 401', async () => {
    harness.setSession({})

    await expect(createToken(event({ body: { name: 'laptop' } }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it.each([undefined, null, '', 'laptop', 5, []])('rejects the non-object body %j with "Name the token"', async (body) => {
    await expect(createToken(event({ body }))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Name the token' })
  })

  it('rejects a missing or non-string name with "Name the token"', async () => {
    await expect(createToken(event({ body: {} }))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Name the token' })
    await expect(createToken(event({ body: { name: 5 } }))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Name the token' })
  })

  it('rejects a blank name with 400', async () => {
    await expect(createToken(event({ body: { name: '  ' } }))).rejects.toMatchObject({ statusCode: 400, statusMessage: 'Name the token' })
  })

  it('rejects a name over 60 characters with 400', async () => {
    await expect(createToken(event({ body: { name: 'x'.repeat(61) } }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Token names are 60 characters or fewer.'
    })
  })

  it('rejects a duplicate name with 409', async () => {
    harness.givenDb({ insertError: Object.assign(new Error('duplicate'), { code: '23505' }) })

    await expect(createToken(event({ body: { name: 'laptop' } }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'A token with that name already exists.'
    })
  })

  it('rejects a duplicate name with 409 when Drizzle wraps the driver error', async () => {
    const driverError = Object.assign(new Error('duplicate'), { code: '23505' })
    harness.givenDb({ insertError: new Error('Failed query', { cause: driverError }) })

    await expect(createToken(event({ body: { name: 'laptop' } }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rethrows other insert failures', async () => {
    harness.givenDb({ insertError: new Error('db down') })

    await expect(createToken(event({ body: { name: 'laptop' } }))).rejects.toThrow('db down')
  })

  it('returns the plain token once and stores only its hash', async () => {
    harness.givenDb({ insert: [tokenRow()] })

    const result = await createToken(event({ body: { name: ' laptop ' } })) as { token: string }

    expect(result.token).toMatch(/^wd_[A-Za-z0-9_-]{43}$/)
    const stored = (harness.mocks.insertValues.mock.calls as unknown as Record<string, unknown>[][])[0]![0]!
    expect(stored).toMatchObject({ userId: 7, name: 'laptop', prefix: result.token.slice(3, 11) })
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.values(stored)).not.toContain(result.token)
  })
})

describe('DELETE /api/tokens/:id', () => {
  it('rejects a request without a session with 401', async () => {
    harness.setSession({})

    await expect(deleteToken(event({ params: { id: '3' } }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it.each(['0x3', '3e0', ' 3 ', '-3', '3.0', '', '2147483648', '99999999999', '99999999999999999999999'])('returns 404 for the id %j without touching the database', async (id) => {
    harness.givenDb({ delete: [{ id: 3 }] })

    await expect(deleteToken(event({ params: { id } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(harness.mocks.deleteWhere).not.toHaveBeenCalled()
  })

  it('returns 404 for another user\'s token', async () => {
    harness.givenDb({ delete: [] })

    await expect(deleteToken(event({ params: { id: '9' } }))).rejects.toMatchObject({ statusCode: 404 })
    const rendered = renderWhere((harness.mocks.deleteWhere.mock.calls as unknown[][])[0]![0])
    expect(rendered.sql).toMatch(/"user_id" = \$\d/)
    expect(rendered.params).toEqual(expect.arrayContaining([9, 7]))
  })

  it('returns 404 for a non-numeric id', async () => {
    await expect(deleteToken(event({ params: { id: 'abc' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('revokes an owned token', async () => {
    harness.givenDb({ delete: [{ id: 3 }] })

    expect(await deleteToken(event({ params: { id: '3' } }))).toEqual({ ok: true })
  })
})
