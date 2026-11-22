import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const buildBackup = vi.fn()
const backupCounts = vi.fn()
const resolveAccessToken = vi.fn()
const touchAccessToken = vi.fn()
const warn = vi.fn()
vi.mock('~~/server/utils/backup/buildBackup', () => ({ buildBackup, backupCounts, backupFilename: () => 'watchd-backup-2026-11-21.json' }))
vi.mock('~~/server/utils/accessTokens/store', () => ({ resolveAccessToken, touchAccessToken }))
vi.mock('~~/server/utils/logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

const harness = createServerHandlerHarness()

type Handler = (e: unknown) => Promise<unknown>
const exportBackup = (await import('~~/server/api/export/index.get')).default as Handler
const exportSummary = (await import('~~/server/api/export/summary.get')).default as Handler

const validToken = `wd_${'a'.repeat(43)}`
const requestTo = (path: string, authorization?: string, clientHeaders: Record<string, string> = {}) => ({
  ...event({ headers: { ...(authorization ? { authorization } : {}), ...clientHeaders } }),
  path,
  context: {}
})
const request = (authorization?: string, clientHeaders: Record<string, string> = {}) =>
  requestTo('/api/export', authorization, clientHeaders)
const summaryRequest = (authorization?: string) => requestTo('/api/export/summary', authorization)
const requestFrom = (clientAddress: string, authorization?: string) =>
  request(authorization, { 'x-forwarded-for': clientAddress })

let cacheDriver: Record<string, unknown> = {}
let trustProxy: unknown = true
let socketAddress: string | undefined
const stubRateLimitGlobals = () => {
  vi.stubGlobal('getRequestIP', () => socketAddress)
  vi.stubGlobal('useStorage', () => ({ getMount: () => ({ driver: cacheDriver }) }))
  vi.stubGlobal('useRuntimeConfig', () => ({ trustProxy }))
}
stubRateLimitGlobals()
const backup = { format: 'watchd-backup', version: 1, exportedAt: '2026-11-21T00:00:00.000Z', plays: [], titleSettings: [] }

beforeEach(() => {
  harness.reset()
  buildBackup.mockReset().mockResolvedValue(backup)
  backupCounts.mockReset().mockResolvedValue({ plays: 3, titleSettings: 2 })
  resolveAccessToken.mockReset().mockResolvedValue({ tokenId: 11, userId: 42 })
  touchAccessToken.mockReset().mockResolvedValue(undefined)
  warn.mockReset()
})

afterEach(() => {
  cacheDriver = {}
  trustProxy = true
  socketAddress = undefined
})

describe('GET /api/export', () => {
  it('rejects a request with neither session nor header with 401', async () => {
    await expect(exportBackup(request())).rejects.toMatchObject({ statusCode: 401 })
    expect(buildBackup).not.toHaveBeenCalled()
  })

  it('returns the session user backup with download headers', async () => {
    harness.setSession({ user: { id: 7 } })

    const result = await exportBackup(request())

    expect(result).toEqual(backup)
    expect(buildBackup).toHaveBeenCalledWith(7, expect.any(Date))
    const headers = harness.mocks.setResponseHeader.mock.calls.map(([, name, value]) => [name, value])
    expect(headers).toEqual(expect.arrayContaining([
      ['Content-Type', 'application/json'],
      ['Content-Disposition', 'attachment; filename="watchd-backup-2026-11-21.json"'],
      ['Cache-Control', 'no-store']
    ]))
  })

  it('serves the token owner backup for a valid bearer without a session and touches the token', async () => {
    await expect(exportBackup(request(`Bearer ${validToken}`))).resolves.toEqual(backup)

    expect(resolveAccessToken).toHaveBeenCalledWith(validToken)
    expect(buildBackup).toHaveBeenCalledWith(42, expect.any(Date))
    expect(touchAccessToken).toHaveBeenCalledWith(11)
  })

  it('serves the token owner backup, not the session user, when a valid bearer and a session are both present', async () => {
    harness.setSession({ user: { id: 7 } })

    await expect(exportBackup(request(`Bearer ${validToken}`))).resolves.toEqual(backup)

    expect(buildBackup).toHaveBeenCalledTimes(1)
    expect(buildBackup).toHaveBeenCalledWith(42, expect.any(Date))
  })

  it('still serves the backup and warns without the token when touching the token fails', async () => {
    touchAccessToken.mockRejectedValue(new Error('db down'))

    await expect(exportBackup(request(`Bearer ${validToken}`))).resolves.toEqual(backup)

    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ route: '/api/export' }), 'access token last-used update failed')
    expect(JSON.stringify(warn.mock.calls)).not.toContain(validToken)
  })

  it('rejects an unknown bearer with 401 even when a session exists', async () => {
    harness.setSession({ user: { id: 7 } })
    resolveAccessToken.mockResolvedValue(null)

    await expect(exportBackup(request(`Bearer ${validToken}`))).rejects.toMatchObject({ statusCode: 401, message: 'Invalid access token' })
    expect(buildBackup).not.toHaveBeenCalled()
    expect(touchAccessToken).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith({ route: '/api/export', malformed: false }, 'access token rejected')
  })

  it('rejects a malformed header with 401 and logs it without the token text', async () => {
    harness.setSession({ user: { id: 7 } })

    await expect(exportBackup(request('Bearer secret-garbage'))).rejects.toMatchObject({ statusCode: 401 })

    expect(resolveAccessToken).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith({ route: '/api/export', malformed: true }, 'access token rejected')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-garbage')
  })
})

describe('GET /api/export bad token rate limit', () => {
  const badBearer = `Bearer ${validToken}`

  beforeEach(() => {
    resolveAccessToken.mockResolvedValue(null)
  })

  it('answers 401 for 30 bad tokens from one address and 429 with Retry-After on the 31st', async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await expect(exportBackup(requestFrom('203.0.113.1', badBearer))).rejects.toMatchObject({ statusCode: 401 })
    }

    warn.mockClear()
    await expect(exportBackup(requestFrom('203.0.113.1', badBearer))).rejects.toMatchObject({ statusCode: 429 })
    expect(warn.mock.calls.map(([, message]) => message)).toEqual(['rate limit exceeded'])
    expect(harness.mocks.setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Retry-After', expect.any(Number))
    expect(JSON.stringify(warn.mock.calls)).not.toContain(validToken)
  })

  it('leaves a different address unaffected', async () => {
    for (let attempt = 0; attempt < 31; attempt++) {
      await exportBackup(requestFrom('203.0.113.2', badBearer)).catch(() => {})
    }

    await expect(exportBackup(requestFrom('203.0.113.3', badBearer))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('counts malformed headers too', async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await exportBackup(requestFrom('203.0.113.4', 'Bearer junk')).catch(() => {})
    }

    await expect(exportBackup(requestFrom('203.0.113.4', 'Bearer junk'))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('never counts or limits valid tokens', async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await exportBackup(requestFrom('203.0.113.5', badBearer)).catch(() => {})
    }
    resolveAccessToken.mockResolvedValue({ tokenId: 11, userId: 42 })

    await expect(exportBackup(requestFrom('203.0.113.5', badBearer))).resolves.toEqual(backup)
    for (let attempt = 0; attempt < 40; attempt++) {
      await expect(exportBackup(requestFrom('203.0.113.6', badBearer))).resolves.toEqual(backup)
    }
    resolveAccessToken.mockResolvedValue(null)
    await expect(exportBackup(requestFrom('203.0.113.6', badBearer))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('never limits session requests', async () => {
    harness.setSession({ user: { id: 7 } })
    for (let attempt = 0; attempt < 40; attempt++) {
      await expect(exportBackup(requestFrom('203.0.113.7'))).resolves.toEqual(backup)
    }
  })

  it('keys on the last X-Forwarded-For hop, not client-supplied earlier ones', async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await exportBackup(request(badBearer, { 'x-forwarded-for': `198.51.100.${attempt}, 203.0.113.8` })).catch(() => {})
    }

    await expect(exportBackup(request(badBearer, { 'x-forwarded-for': '198.51.100.99, 203.0.113.8' })))
      .rejects.toMatchObject({ statusCode: 429 })
  })

  it('falls back to the socket address without X-Forwarded-For', async () => {
    socketAddress = '203.0.113.9'
    for (let attempt = 0; attempt < 30; attempt++) {
      await exportBackup(request(badBearer)).catch(() => {})
    }

    await expect(exportBackup(request(badBearer))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('ignores X-Forwarded-For and uses the socket address when trustProxy is off', async () => {
    trustProxy = false
    socketAddress = '203.0.113.11'
    for (let attempt = 0; attempt < 30; attempt++) {
      await exportBackup(requestFrom(`198.51.100.${attempt}`, badBearer)).catch(() => {})
    }

    await expect(exportBackup(requestFrom('198.51.100.200', badBearer))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('treats trustProxy given as the string "true" (env override) as on', async () => {
    trustProxy = 'true'
    for (let attempt = 0; attempt < 30; attempt++) {
      await exportBackup(requestFrom('203.0.113.12', badBearer)).catch(() => {})
    }

    await expect(exportBackup(requestFrom('203.0.113.12', badBearer))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('fails open with a warning when the Redis store errors', async () => {
    const exec = vi.fn().mockRejectedValue(new Error('redis down'))
    const pipeline = { set: vi.fn(), incr: vi.fn(), pttl: vi.fn(), get: vi.fn(), exec }
    cacheDriver = { name: 'redis', getInstance: () => ({ status: 'ready', multi: () => pipeline }) }

    for (let attempt = 0; attempt < 35; attempt++) {
      await expect(exportBackup(requestFrom('203.0.113.10', badBearer))).rejects.toMatchObject({ statusCode: 401 })
    }
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ rule: 'token-ip' }), expect.stringContaining('rate-limit store unavailable'))
  })
})

describe('GET /api/export/summary', () => {
  it('returns counts for the session user', async () => {
    harness.setSession({ user: { id: 7 } })

    await expect(exportSummary(summaryRequest())).resolves.toEqual({ plays: 3, titleSettings: 2 })
    expect(backupCounts).toHaveBeenCalledWith(7)
  })

  it('rejects a bearer-only request with 401', async () => {
    await expect(exportSummary(summaryRequest(`Bearer ${validToken}`))).rejects.toMatchObject({ statusCode: 401 })
    expect(resolveAccessToken).not.toHaveBeenCalled()
    expect(backupCounts).not.toHaveBeenCalled()
  })
})
