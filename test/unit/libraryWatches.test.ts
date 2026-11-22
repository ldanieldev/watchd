import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const send = vi.hoisted(() => vi.fn())
const queueSearchReindex = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/search/searchEvents', () => ({ queueSearchReindex }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send } }))
let syncMode = 'on'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier: 'test-client-id' } }))

const harness = createServerHandlerHarness()
const { insertValues, deleteWhere, updateSet } = harness.mocks

type Handler = (e: unknown) => Promise<unknown>
const addWatches = (await import('~~/server/api/library/watches.post')).default as Handler
const removeWatches = (await import('~~/server/api/library/watches/delete.post')).default as Handler
const { removeWatchRows } = await import('~~/server/utils/library/removeWatchRows')
const saveSettings = (await import('~~/server/api/library/titles/[id]/settings.put')).default as Handler
const { queuePlexPush, queuePlexPushAfterDelete } = await import('~~/server/utils/plex/outbound')

const episodeWatch = { titleId: '5', episodeId: '5-2-7', watchedAt: '2026-11-20T21:15:00-06:00' }

const connection = { id: 3, userId: 7, serverMachineId: 'server-a', serverUrl: 'http://plex.invalid:32400', serverUrlOverride: null, serverToken: 'secret-token' }
const episodeItem = { ratingKey: '900', kind: 'episode', titleId: 5, season: 2, number: 7 }
const deleteKey = { ...episodeWatch }

beforeEach(() => {
  syncMode = 'on'
  send.mockReset().mockResolvedValue(undefined)
  queueSearchReindex.mockReset().mockResolvedValue(undefined)
  harness.reset()
  harness.setSession({ user: { id: 7 } })
})

describe('POST /api/library/watches', () => {
  it('rejects a request without a session with 401', async () => {
    harness.setSession({})

    await expect(addWatches(event({ body: { watches: [episodeWatch] } }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects an episode id that belongs to another title with 400', async () => {
    await expect(addWatches(event({ body: { watches: [{ ...episodeWatch, episodeId: '6-2-7' }] } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a watch time without a UTC offset with 400', async () => {
    await expect(addWatches(event({ body: { watches: [{ ...episodeWatch, watchedAt: '2026-11-20T21:15:00' }] } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a watch for a title that does not exist with 400', async () => {
    harness.givenDb({ select: [[]] })

    await expect(addWatches(event({ body: { watches: [episodeWatch] } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('stores the watch for the session user with season and number from the episode id', async () => {
    harness.givenDb({ select: [[{ id: 5 }]], insert: [{ id: 1 }] })

    await expect(addWatches(event({ body: { watches: [{ ...episodeWatch, userId: 99 }] } }))).resolves.toEqual({ added: 1 })

    expect(insertValues).toHaveBeenCalledWith([expect.objectContaining({
      userId: 7, titleId: 5, season: 2, number: 7, source: 'watchd',
      watchedAt: new Date('2026-11-21T03:15:00Z'), watchedMinute: new Date('2026-11-21T03:15:00Z')
    })])
  })

  it('sends search/library.changed for the user after adding watches', async () => {
    harness.givenDb({ select: [[{ id: 5 }]], insert: [{ id: 1 }] })

    await addWatches(event({ body: { watches: [episodeWatch] } }))

    expect(queueSearchReindex).toHaveBeenCalledWith([7])
  })

  it('stores a movie watch without season or number', async () => {
    harness.givenDb({ select: [[{ id: 9 }]], insert: [{ id: 1 }] })

    await addWatches(event({ body: { watches: [{ titleId: '9', watchedAt: '2026-11-20T21:15:30Z' }] } }))

    expect(insertValues).toHaveBeenCalledWith([expect.objectContaining({ titleId: 9, season: null, number: null })])
  })
})

describe('POST /api/library/watches/delete', () => {
  it('requires a session', async () => {
    harness.setSession({})

    await expect(removeWatches(event({ body: { watches: [episodeWatch] } }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('reports how many watches it removed', async () => {
    harness.givenDb({ delete: [{ id: 1 }, { id: 2 }] })

    await expect(removeWatches(event({ body: { watches: [episodeWatch] } }))).resolves.toEqual({ removed: 2 })
    expect(deleteWhere).toHaveBeenCalledTimes(1)
  })

  it('sends search/library.changed for the user after removing watches', async () => {
    harness.givenDb({ delete: [{ id: 1, plexHistoryId: null }] })

    await removeWatches(event({ body: { watches: [episodeWatch] } }))

    expect(queueSearchReindex).toHaveBeenCalledWith([7])
  })

  it('only deletes watches that are not already soft-deleted', async () => {
    harness.givenDb({ delete: [{ id: 1, plexHistoryId: null }] })

    await removeWatches(event({ body: { watches: [episodeWatch] } }))

    const condition = (deleteWhere.mock.calls[0] as unknown as [SQL])[0]
    expect(new PgDialect().sqlToQuery(condition).sql).toContain('"watches"."deleted_at" is null')
  })

  it('returns the plex history ids (each with its server) and the distinct keys of the rows it deleted, next to the count', async () => {
    harness.givenDb({ delete: [
      { id: 1, titleId: 5, season: 2, number: 7, plexHistoryId: 501, plexServerMachineId: 'server-a' },
      { id: 2, titleId: 5, season: 2, number: 7, plexHistoryId: null, plexServerMachineId: null },
      { id: 3, titleId: 5, season: 2, number: 7, plexHistoryId: 503, plexServerMachineId: 'server-b' }
    ] })

    await expect(removeWatchRows(7, [{ titleId: 5, season: 2, number: 7, watchedMinute: new Date('2026-11-21T03:15:00Z') }]))
      .resolves.toEqual({ removed: 3, deletedKeys: [{ titleId: 5, season: 2, number: 7 }], plexHistory: [
        { historyId: 501, serverMachineId: 'server-a', titleId: 5, season: 2, number: 7 },
        { historyId: 503, serverMachineId: 'server-b', titleId: 5, season: 2, number: 7 }
      ] })
  })
})

describe('PUT /api/library/titles/:id/settings', () => {
  it('rejects an anime override on a movie with 400', async () => {
    harness.givenDb({ select: [[{ kind: 'movie' }]] })

    await expect(saveSettings(event({ params: { id: '9' }, body: { typeOverride: 'anime' } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an unknown title with 404', async () => {
    harness.givenDb({ select: [[]] })

    await expect(saveSettings(event({ params: { id: '9' }, body: { typeOverride: 'anime' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('saves the override for the session user', async () => {
    harness.givenDb({ select: [[{ kind: 'tv' }]] })

    await saveSettings(event({ params: { id: '5' }, body: { typeOverride: 'anime' } }))

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, titleId: 5, typeOverride: 'anime' }))
  })

  it('sends search/library.changed for the user after saving settings', async () => {
    harness.givenDb({ select: [[{ kind: 'tv' }]] })

    await saveSettings(event({ params: { id: '5' }, body: { typeOverride: 'anime' } }))

    expect(queueSearchReindex).toHaveBeenCalledWith([7])
  })
})

describe('Plex outbound hooks', () => {
  const inserted = { id: 1, titleId: 5, season: 2, number: 7 }

  it('sends a mark event for an added episode and flags its Plex item as pending', async () => {
    harness.givenDb({ select: [[{ id: 5 }], [connection], [episodeItem]], insert: [inserted] })

    await expect(addWatches(event({ body: { watches: [episodeWatch] } }))).resolves.toEqual({ added: 1 })

    expect(updateSet).toHaveBeenCalledWith({ outboundPending: true })
    expect(send).toHaveBeenCalledWith({ name: 'plex/push', data: { userId: 7, ops: [{ op: 'mark', titleId: 5, season: 2, number: 7 }] } })
  })

  const episodeItems = (count: number) => Array.from({ length: count }, (_, index) => ({ ratingKey: `rk${index + 1}`, kind: 'episode', titleId: 5, season: 1, number: index + 1 }))
  const sentOps = () => send.mock.calls.map(([sent]) => (sent as { data: { ops: Record<string, unknown>[] } }).data.ops)

  it('splits a large push into events of at most 500 ops', async () => {
    const items = episodeItems(1001)
    harness.givenDb({ select: [[connection], items, items, items] })
    const ops = items.map(item => ({ op: 'mark' as const, titleId: 5, season: 1, number: item.number }))

    await queuePlexPush(7, ops)

    expect(sentOps().map(batch => batch.length)).toEqual([500, 500, 1])
  })

  it('keeps each key\'s history deletes and its follow-up in one event, deletes first, when a delete spans several events', async () => {
    const items = episodeItems(300)
    harness.givenDb({ select: [[connection], [], items, items, items] })
    const deletedKeys = items.map(item => ({ titleId: 5, season: 1, number: item.number }))
    const plexHistory = items.flatMap(item => [1, 2].map(copy => ({ historyId: item.number * 10 + copy, serverMachineId: 'server-a', titleId: 5, season: 1, number: item.number })))

    await queuePlexPushAfterDelete(7, deletedKeys, plexHistory)

    const events = sentOps()
    expect(events.length).toBeGreaterThan(1)
    expect(events.every(batch => batch.length <= 500)).toBe(true)
    for (const item of items) {
      const holding = events.filter(batch => batch.some(op => op.number === item.number || [item.number * 10 + 1, item.number * 10 + 2].includes(op.historyId as number)))
      expect(holding).toHaveLength(1)
      expect(holding[0]!.filter(op => op.number === item.number || [item.number * 10 + 1, item.number * 10 + 2].includes(op.historyId as number))).toEqual([
        { op: 'delete-history', historyId: item.number * 10 + 1 },
        { op: 'delete-history', historyId: item.number * 10 + 2 },
        { op: 'unmark', titleId: 5, season: 1, number: item.number }
      ])
    }
  })

  it('stops at a chunk whose send fails, resetting pending only for that chunk', async () => {
    const items = episodeItems(600)
    harness.givenDb({ select: [[connection], items, items] })
    send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('inngest down'))

    await queuePlexPush(7, items.map(item => ({ op: 'mark' as const, titleId: 5, season: 1, number: item.number })))

    expect(send).toHaveBeenCalledTimes(2)
    expect(updateSet.mock.calls.map(call => (call as unknown[])[0])).toEqual([{ outboundPending: true }, { outboundPending: true }, { outboundPending: false }])
    expect(log.warn).toHaveBeenCalled()
  })

  it('looks up remaining plays for a large delete in chunks of keys', async () => {
    const items = episodeItems(2500)
    harness.givenDb({ select: [[connection], [], [], []] })

    await queuePlexPushAfterDelete(7, items.map(item => ({ titleId: 5, season: 1, number: item.number })), [])

    const remainingLookups = harness.mocks.selectWhere.mock.calls.slice(1, 4).map(([where]) => new PgDialect().sqlToQuery(where as SQL).params.length)
    expect(remainingLookups).toHaveLength(3)
    expect(Math.max(...remainingLookups)).toBeLessThan(5000)
  })

  it('sends nothing for a mark on a title with no Plex mapping', async () => {
    harness.givenDb({ select: [[{ id: 5 }], [connection], []], insert: [inserted] })

    await addWatches(event({ body: { watches: [episodeWatch] } }))

    expect(send).not.toHaveBeenCalled()
  })

  it('does not look for a connection when the sync mode is off', async () => {
    syncMode = 'off'
    harness.givenDb({ select: [[{ id: 5 }], [connection], [episodeItem]], insert: [inserted] })

    await addWatches(event({ body: { watches: [episodeWatch] } }))

    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing for a user with no Plex connection', async () => {
    harness.givenDb({ select: [[{ id: 5 }], []], insert: [inserted] })

    await addWatches(event({ body: { watches: [episodeWatch] } }))

    expect(send).not.toHaveBeenCalled()
  })

  it('answers 200 when the Plex server is down, because the route only queues an event', async () => {
    harness.givenDb({ select: [[{ id: 5 }], [connection], [episodeItem]], insert: [inserted] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connect ECONNREFUSED'))

    await expect(addWatches(event({ body: { watches: [episodeWatch] } }))).resolves.toEqual({ added: 1 })

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('still answers when the event cannot be sent, and warns', async () => {
    send.mockRejectedValue(new Error('inngest is down'))
    harness.givenDb({ select: [[{ id: 5 }], [connection], [episodeItem]], insert: [inserted] })

    await expect(addWatches(event({ body: { watches: [episodeWatch] } }))).resolves.toEqual({ added: 1 })

    expect(log.warn).toHaveBeenCalled()
    expect(updateSet).toHaveBeenLastCalledWith({ outboundPending: false })
  })

  it('deleting one of two plays sends delete-history, then a mark so Plex stays watched', async () => {
    harness.givenDb({
      delete: [{ id: 1, titleId: 5, season: 2, number: 7, plexHistoryId: 501, plexServerMachineId: 'server-a' }],
      select: [[connection], [{ titleId: 5, season: 2, number: 7 }], [episodeItem]]
    })

    await expect(removeWatches(event({ body: { watches: [deleteKey] } }))).resolves.toEqual({ removed: 1 })

    expect(send).toHaveBeenCalledWith({ name: 'plex/push', data: { userId: 7, ops: [
      { op: 'delete-history', historyId: 501 },
      { op: 'mark', titleId: 5, season: 2, number: 7 }
    ] } })
    expect(updateSet).toHaveBeenCalledWith({ outboundPending: true })
  })

  it('sends no mark for a remaining key whose deleted play had no Plex history entry', async () => {
    harness.givenDb({
      delete: [{ id: 1, titleId: 5, season: 2, number: 7, plexHistoryId: null, plexServerMachineId: null }],
      select: [[connection], [{ titleId: 5, season: 2, number: 7 }]]
    })

    await removeWatches(event({ body: { watches: [deleteKey] } }))

    expect(send).not.toHaveBeenCalled()
  })

  it('deleting the last play sends delete-history and unmark', async () => {
    harness.givenDb({
      delete: [{ id: 1, titleId: 5, season: 2, number: 7, plexHistoryId: 501, plexServerMachineId: 'server-a' }],
      select: [[connection], [], [episodeItem]]
    })

    await removeWatches(event({ body: { watches: [deleteKey] } }))

    expect(send).toHaveBeenCalledWith({ name: 'plex/push', data: { userId: 7, ops: [
      { op: 'delete-history', historyId: 501 },
      { op: 'unmark', titleId: 5, season: 2, number: 7 }
    ] } })
  })

  it('skips history ids that belong to a different Plex server', async () => {
    harness.givenDb({
      delete: [{ id: 1, titleId: 5, season: 2, number: 7, plexHistoryId: 501, plexServerMachineId: 'server-b' }, { id: 2, plexHistoryId: null, plexServerMachineId: null }],
      select: [[connection], [{ titleId: 5, season: 2, number: 7 }]]
    })

    await removeWatches(event({ body: { watches: [deleteKey] } }))

    expect(send).not.toHaveBeenCalled()
  })

  it('unmarks only keys that had a row deleted, not every requested key', async () => {
    harness.givenDb({
      delete: [{ id: 1, titleId: 5, season: 2, number: 7, plexHistoryId: null, plexServerMachineId: null }],
      select: [[connection], [], [episodeItem]]
    })

    await removeWatches(event({ body: { watches: [deleteKey, { ...episodeWatch, episodeId: '5-2-8' }] } }))

    expect(send).toHaveBeenCalledWith({ name: 'plex/push', data: { userId: 7, ops: [{ op: 'unmark', titleId: 5, season: 2, number: 7 }] } })
  })

  it('sends nothing when no row was deleted', async () => {
    harness.givenDb({ delete: [], select: [[connection], [], [episodeItem]] })

    await removeWatches(event({ body: { watches: [deleteKey] } }))

    expect(send).not.toHaveBeenCalled()
  })
})
