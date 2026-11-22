import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const clearCachedFunction = vi.hoisted(() => vi.fn())
const cacheBackend = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/cache/cacheBackend', () => ({ clearCachedFunction, cacheBackend }))

const inUserLibrary = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/library/libraryTitleCondition', () => ({ inUserLibrary }))

const queueEnrichment = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/import/writePlays', () => ({ queueEnrichment }))
const inngestSend = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send: inngestSend } }))
vi.mock('~~/server/utils/search/searchEvents', () => ({ SEARCH_LIBRARY_CHANGED_EVENT: 'search/library.changed' }))
const consumeLimit = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/rateLimit/limit', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/rateLimit/limit')>(),
  consumeLimit
}))

const { titles } = await import('~~/server/db/schema')
const HOUR_BUCKET = 490_000
const harness = createServerHandlerHarness()
vi.stubGlobal('useStorage', () => ({}))

type Handler = (e: unknown) => Promise<unknown>
const cacheStatus = (await import('~~/server/api/maintenance/cache.get')).default as Handler
const clearPeopleCache = (await import('~~/server/api/maintenance/clear-people-cache.post')).default as Handler
const refreshLibrary = (await import('~~/server/api/maintenance/refresh-library.post')).default as Handler
const rebuildSearch = (await import('~~/server/api/maintenance/rebuild-search.post')).default as Handler
const refreshTitle = (await import('~~/server/api/library/titles/[id]/refresh.post')).default as Handler
const { RATE_RULES } = await import('~~/server/utils/rateLimit/limit')

beforeEach(() => {
  harness.reset()
  clearCachedFunction.mockReset().mockResolvedValue(3)
  cacheBackend.mockReset().mockReturnValue('memory-fallback')
  queueEnrichment.mockReset().mockResolvedValue(undefined)
  inngestSend.mockReset().mockResolvedValue(undefined)
  consumeLimit.mockReset().mockResolvedValue(undefined)
  inUserLibrary.mockReset().mockReturnValue('in-library-condition')
  harness.setSession({ user: { id: 7 } })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(HOUR_BUCKET * 3_600_000 + 5000))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('maintenance routes', () => {
  it('reject a request without a session with 401', async () => {
    harness.setSession({})

    await expect(cacheStatus(event())).rejects.toMatchObject({ statusCode: 401 })
    await expect(clearPeopleCache(event())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('GET cache reports the backend', async () => {
    await expect(cacheStatus(event())).resolves.toEqual({ backend: 'memory-fallback' })
  })

  it('POST clear-people-cache returns the removed count and backend', async () => {
    await expect(clearPeopleCache(event())).resolves.toEqual({ removed: 3, backend: 'memory-fallback' })
    expect(clearCachedFunction).toHaveBeenCalledWith(expect.anything(), 'tmdb-person')
  })
})

describe('refresh and rebuild routes', () => {
  const titleEvent = (id: string) => event({ params: { id } })

  it('reject a request without a session with 401', async () => {
    harness.setSession({})

    await expect(refreshLibrary(event())).rejects.toMatchObject({ statusCode: 401 })
    await expect(rebuildSearch(event())).rejects.toMatchObject({ statusCode: 401 })
    await expect(refreshTitle(titleEvent('12'))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refresh-library queues every title in the user\'s library', async () => {
    harness.givenDb({ select: [[{ id: 4 }, { id: 9 }]] })

    await expect(refreshLibrary(event())).resolves.toEqual({ queued: 2 })
    expect(queueEnrichment).toHaveBeenCalledWith([4, 9], { eventIdForTitle: expect.any(Function) })
    expect(inUserLibrary).toHaveBeenCalledWith(titles.id, 7)
    expect(harness.mocks.selectWhere).toHaveBeenCalledWith('in-library-condition')
    const { eventIdForTitle } = queueEnrichment.mock.calls[0]![1]
    expect(eventIdForTitle(4)).toBe(`library-refresh-4-${HOUR_BUCKET}`)
    expect(consumeLimit).toHaveBeenCalledWith(expect.anything(), RATE_RULES.libraryRefresh, '7')
    expect(consumeLimit.mock.invocationCallOrder[0]).toBeLessThan(harness.mocks.selectColumns.mock.invocationCallOrder[0]!)
  })

  it('refresh-library with an empty library queues nothing', async () => {
    harness.givenDb({ select: [[]] })

    await expect(refreshLibrary(event())).resolves.toEqual({ queued: 0 })
    expect(queueEnrichment).not.toHaveBeenCalled()
  })

  it('refresh-library stops at the rate limit', async () => {
    consumeLimit.mockRejectedValue({ statusCode: 429 })
    harness.givenDb({ select: [[{ id: 4 }]] })

    await expect(refreshLibrary(event())).rejects.toMatchObject({ statusCode: 429 })
    expect(queueEnrichment).not.toHaveBeenCalled()
  })

  it.each(['abc', '0'])('title refresh rejects the bad id %s with 400 before spending the rate limit', async (id) => {
    await expect(refreshTitle(titleEvent(id))).rejects.toMatchObject({ statusCode: 400 })
    expect(consumeLimit).not.toHaveBeenCalled()
    expect(queueEnrichment).not.toHaveBeenCalled()
  })

  it('title refresh rejects a title outside the library with 404', async () => {
    harness.givenDb({ select: [[]] })

    await expect(refreshTitle(titleEvent('12'))).rejects.toMatchObject({ statusCode: 404 })
    expect(queueEnrichment).not.toHaveBeenCalled()
  })

  it('title refresh queues the title', async () => {
    harness.givenDb({ select: [[{ id: 12 }]] })

    await expect(refreshTitle(titleEvent('12'))).resolves.toEqual({ queued: 1 })
    expect(queueEnrichment).toHaveBeenCalledWith([12], { eventIdForTitle: expect.any(Function) })
    expect(queueEnrichment.mock.calls[0]![1].eventIdForTitle(12)).toBe(`title-refresh-12-${HOUR_BUCKET}`)
    expect(inUserLibrary).toHaveBeenCalledWith(titles.id, 7)
    expect(harness.mocks.selectWhere).toHaveBeenCalledTimes(1)
    expect(consumeLimit).toHaveBeenCalledWith(expect.anything(), RATE_RULES.titleRefresh, '7')
  })

  it('title refresh stops at the rate limit', async () => {
    consumeLimit.mockRejectedValue({ statusCode: 429 })

    await expect(refreshTitle(titleEvent('12'))).rejects.toMatchObject({ statusCode: 429 })
    expect(queueEnrichment).not.toHaveBeenCalled()
  })

  it('rebuild-search surfaces a failed send', async () => {
    inngestSend.mockRejectedValue(new Error('inngest down'))

    await expect(rebuildSearch(event())).rejects.toThrow('inngest down')
  })

  it('rebuild-search queues the user\'s reindex', async () => {
    await expect(rebuildSearch(event())).resolves.toEqual({ ok: true })
    expect(inngestSend).toHaveBeenCalledWith({ name: 'search/library.changed', data: { userId: 7 } })
    expect(consumeLimit).toHaveBeenCalledWith(expect.anything(), RATE_RULES.searchRebuild, '7')
  })
})
