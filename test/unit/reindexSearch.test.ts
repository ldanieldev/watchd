import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const send = vi.hoisted(() => vi.fn())
const ensureLibraryTitlesIndex = vi.hoisted(() => vi.fn())
const reindexUserSearch = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({
  inngest: { send, createFunction: (config: unknown, handler: unknown) => ({ config, handler }) }
}))
vi.mock('~~/server/utils/search/meili', () => ({ ensureLibraryTitlesIndex }))
vi.mock('~~/server/utils/search/reindexUserSearch', () => ({ reindexUserSearch }))

const harness = createServerHandlerHarness()
const { SEARCH_LIBRARY_CHANGED_EVENT, queueSearchReindex, queueSearchReindexForTitle } = await import('~~/server/utils/search/searchEvents')
const { reindexUserSearchFunction, reindexAllSearchFunction } = await import('~~/server/inngest/reindexSearch')

type Registered = { config: { debounce?: unknown, concurrency?: unknown, triggers: unknown[] }, handler: (input: unknown) => Promise<unknown> }
const step = { run: <Result>(_id: string, run: () => Promise<Result>) => run() }

beforeEach(() => {
  send.mockReset().mockResolvedValue(undefined)
  ensureLibraryTitlesIndex.mockReset().mockResolvedValue(undefined)
  reindexUserSearch.mockReset().mockResolvedValue({ upserted: 0, deleted: 0 })
  Object.values(log).forEach(spy => spy.mockReset())
  harness.reset()
})

describe('queueSearchReindex', () => {
  it('sends one search/library.changed per distinct user', async () => {
    await queueSearchReindex([5, 5, 7])

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith([
      { name: SEARCH_LIBRARY_CHANGED_EVENT, data: { userId: 5 } },
      { name: SEARCH_LIBRARY_CHANGED_EVENT, data: { userId: 7 } }
    ])
  })

  it('sends nothing for no users', async () => {
    await queueSearchReindex([])

    expect(send).not.toHaveBeenCalled()
  })

  it('logs and swallows a send failure', async () => {
    send.mockRejectedValue(new Error('inngest down'))

    await expect(queueSearchReindex([5])).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('queueSearchReindexForTitle', () => {
  it('queues users with a live watch and users with a Plex item for the title', async () => {
    harness.givenDb({ select: [[{ userId: 5 }, { userId: 7 }], [{ userId: 7 }, { userId: 9 }]] })

    await queueSearchReindexForTitle(42)

    expect(send).toHaveBeenCalledWith([5, 7, 9].map(userId => ({ name: SEARCH_LIBRARY_CHANGED_EVENT, data: { userId } })))
  })
})

describe('reindex-user-search', () => {
  const registered = reindexUserSearchFunction as unknown as Registered

  it('is debounced per user for 5s, at most 1m, and runs one at a time per user', () => {
    expect(registered.config.debounce).toEqual({ key: 'event.data.userId', period: '5s', timeout: '1m' })
    expect(registered.config.concurrency).toEqual({ key: 'event.data.userId', limit: 1 })
    expect(registered.config.triggers).toEqual([{ event: SEARCH_LIBRARY_CHANGED_EVENT }])
  })

  it('ensures the index then reindexes the user', async () => {
    reindexUserSearch.mockResolvedValue({ upserted: 2, deleted: 1 })

    const result = await registered.handler({ event: { data: { userId: 5 } }, step })

    expect(ensureLibraryTitlesIndex).toHaveBeenCalledTimes(1)
    expect(reindexUserSearch).toHaveBeenCalledWith(5)
    expect(ensureLibraryTitlesIndex.mock.invocationCallOrder[0]).toBeLessThan(reindexUserSearch.mock.invocationCallOrder[0]!)
    expect(result).toEqual({ upserted: 2, deleted: 1 })
  })
})

describe('reindex-all-search', () => {
  const registered = reindexAllSearchFunction as unknown as Registered

  it('runs at 30 3 * * * and queues every user', async () => {
    expect(registered.config.triggers).toEqual([{ cron: '30 3 * * *' }])
    harness.givenDb({ select: [[{ id: 1 }, { id: 2 }]] })

    await registered.handler({ step })

    expect(send).toHaveBeenCalledWith([1, 2].map(userId => ({ name: SEARCH_LIBRARY_CHANGED_EVENT, data: { userId } })))
  })
})
