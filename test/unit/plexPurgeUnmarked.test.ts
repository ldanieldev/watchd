import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createServerHandlerHarness } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const send = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({
  inngest: { send, createFunction: (config: unknown, handler: unknown) => ({ config, handler }) }
}))
let syncMode = 'on'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier: 'test-client-id' } }))

const harness = createServerHandlerHarness()
const { plexPurgeUnmarked } = await import('~~/server/inngest/plexPurgeUnmarked')
const handler = (plexPurgeUnmarked as unknown as { handler: (input: unknown) => Promise<unknown> }).handler
const step = { run: <Result>(_id: string, run: () => Promise<Result>) => run() }

const connection = { id: 3, userId: 7, serverMachineId: 'server-a', serverUrl: 'http://plex.invalid:32400', serverUrlOverride: null, serverToken: 'secret-token' }
const expiredPlexPlays = [
  { userId: 7, plexHistoryId: 501, plexServerMachineId: 'server-a' },
  { userId: 7, plexHistoryId: 502, plexServerMachineId: 'server-old' }
]

beforeEach(() => {
  syncMode = 'on'
  send.mockReset().mockResolvedValue(undefined)
  harness.reset()
})

describe('plex-purge-unmarked', () => {
  it('queues a Plex history delete for purged plays on the current server before hard-deleting them', async () => {
    harness.givenDb({ select: [expiredPlexPlays, [connection]], delete: [{ id: 1 }] })

    await handler({ step })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ name: 'plex/push', data: { userId: 7, ops: [{ op: 'delete-history', historyId: 501 }] } })
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(harness.mocks.deleteWhere.mock.invocationCallOrder[0]!)
    expect(harness.mocks.deleteWhere).toHaveBeenCalledTimes(2)
  })

  it('keeps a user\'s expired plays for the next run when their history deletes cannot be queued', async () => {
    send.mockRejectedValue(new Error('inngest down'))
    harness.givenDb({ select: [expiredPlexPlays, [connection]] })

    await handler({ step })

    const [purgeWhere, unmarkedWhere] = harness.mocks.deleteWhere.mock.calls.map(call => new PgDialect().sqlToQuery((call as unknown[])[0] as SQL))
    expect(purgeWhere!.sql).toContain('"watches"."user_id" not in')
    expect(purgeWhere!.params).toContain(7)
    expect(unmarkedWhere!.sql).toContain('"plex_unmarked"."connection_id" not in')
    expect(unmarkedWhere!.params).toContain(connection.id)
    expect(log.warn).toHaveBeenCalled()
  })

  it('in read-only mode purges without queueing any Plex write', async () => {
    syncMode = 'read-only'
    harness.givenDb({ select: [expiredPlexPlays, [connection]] })

    await handler({ step })

    expect(send).not.toHaveBeenCalled()
    expect(harness.mocks.deleteWhere).toHaveBeenCalledTimes(2)
  })

  it('does nothing when sync is off', async () => {
    syncMode = 'off'

    expect(await handler({ step })).toEqual({ skipped: 'sync off' })
    expect(harness.mocks.deleteWhere).not.toHaveBeenCalled()
  })
})
