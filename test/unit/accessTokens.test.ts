import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createServerHandlerHarness } from './serverHandlerHarness'

const harness = createServerHandlerHarness()
const { generateAccessToken, parseBearerToken, hashAccessToken } = await import('~~/server/utils/accessTokens/token')
const { resolveAccessToken, touchAccessToken } = await import('~~/server/utils/accessTokens/store')

beforeEach(() => harness.reset())

describe('generateAccessToken', () => {
  it('returns wd_ + 43 chars, its sha256 hash and the 8-char prefix', () => {
    const { token, hash, prefix } = generateAccessToken()

    expect(token).toMatch(/^wd_[A-Za-z0-9_-]{43}$/)
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(hashAccessToken(token)).toBe(hash)
    expect(prefix).toBe(token.slice(3, 11))
    expect(prefix).toHaveLength(8)
  })

  it('returns a different token each call', () => {
    expect(generateAccessToken().token).not.toBe(generateAccessToken().token)
  })
})

describe('parseBearerToken', () => {
  const body = 'a'.repeat(43)

  it('accepts "Bearer wd_..." case-insensitively', () => {
    expect(parseBearerToken(`Bearer wd_${body}`)).toBe(`wd_${body}`)
    expect(parseBearerToken(`  bEaReR wd_${body} `)).toBe(`wd_${body}`)
  })

  it('rejects mfj_ tokens, short tokens and a missing scheme', () => {
    expect(parseBearerToken(`Bearer mfj_${body}`)).toBeNull()
    expect(parseBearerToken(`Bearer wd_${'a'.repeat(42)}`)).toBeNull()
    expect(parseBearerToken(`wd_${body}`)).toBeNull()
  })
})

describe('resolveAccessToken', () => {
  it('returns null when the user is inactive', async () => {
    harness.givenDb({ select: [[{ tokenId: 1, userId: 7, isActive: false }]] })

    expect(await resolveAccessToken(`wd_${'a'.repeat(43)}`)).toBeNull()
  })

  it('returns the token and user ids for an active user', async () => {
    harness.givenDb({ select: [[{ tokenId: 1, userId: 7, isActive: true }]] })

    expect(await resolveAccessToken(`wd_${'a'.repeat(43)}`)).toEqual({ tokenId: 1, userId: 7 })
  })

  it('returns null when no token matches', async () => {
    harness.givenDb({ select: [[]] })

    expect(await resolveAccessToken(`wd_${'a'.repeat(43)}`)).toBeNull()
  })
})

describe('touchAccessToken', () => {
  const renderSql = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL)
  const renderedWhere = () => renderSql((harness.mocks.updateWhere.mock.calls as unknown[][])[0]![0])

  it('writes lastUsedAt = now() for the given token', async () => {
    await touchAccessToken(11)

    const [setValues] = harness.mocks.updateSet.mock.calls[0] as unknown as [{ lastUsedAt: unknown }]
    expect(renderSql(setValues.lastUsedAt).sql).toBe('now()')
    expect(renderedWhere().sql).toMatch(/"id" = \$\d/)
    expect(renderedWhere().params).toContain(11)
  })

  it('only updates a token never used or last used over 60 seconds ago', async () => {
    await touchAccessToken(11)

    expect(renderedWhere().sql).toContain('"last_used_at" is null')
    expect(renderedWhere().sql).toContain('"last_used_at" < now() - interval \'60 seconds\'')
  })
})
