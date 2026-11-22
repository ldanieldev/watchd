import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const queueSearchReindexForTitle = vi.hoisted(() => vi.fn())
const tmdbGet = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({
  inngest: { send: vi.fn(), createFunction: (config: unknown, handler: unknown) => ({ config, handler }) }
}))
vi.mock('~~/server/utils/search/searchEvents', () => ({ queueSearchReindexForTitle }))
const mapped = vi.hoisted(() => ({ name: 'Mapped', episodes: [] }))
vi.mock('~~/server/utils/tmdb/mapTitle', () => ({ mapMovie: () => mapped, mapTv: () => mapped }))
vi.mock('~~/server/utils/tmdb/client', async importOriginal => ({ ...await importOriginal<typeof import('~~/server/utils/tmdb/client')>(), tmdbGet }))

const harness = createServerHandlerHarness()
const harnessDb = (globalThis as unknown as { db: { select: (columns?: unknown) => unknown } }).db
const { enrichTitle } = await import('~~/server/inngest/enrichTitle')
const handler = (enrichTitle as unknown as { handler: (input: unknown) => Promise<unknown> }).handler
const step = { run: <Result>(_id: string, run: () => Promise<Result>) => run() }

const rawMovie = { belongs_to_collection: null }
const rawTv = { seasons: [] }

beforeEach(() => {
  harness.reset()
  queueSearchReindexForTitle.mockReset().mockResolvedValue(undefined)
  tmdbGet.mockReset()
})

afterEach(() => {
  vi.stubGlobal('db', harnessDb)
})

describe('enrich-title', () => {
  it('sends search/library.changed for the title\'s watchers after storing a movie', async () => {
    harness.givenDb({ select: [[{ kind: 'movie', tmdbId: 603 }]] })
    tmdbGet.mockResolvedValue(rawMovie)

    await handler({ event: { data: { titleId: 5 } }, step })

    expect(queueSearchReindexForTitle).toHaveBeenCalledWith(5)
    expect(queueSearchReindexForTitle.mock.invocationCallOrder[0]).toBeGreaterThan(harness.mocks.updateSet.mock.invocationCallOrder[0]!)
  })

  it('sends it after the absolute-episode remap for a show', async () => {
    harness.givenDb({ select: [[{ kind: 'tv', tmdbId: 1 }], []] })
    tmdbGet.mockResolvedValue(rawTv)
    vi.stubGlobal('db', { ...harnessDb, selectDistinct: () => ({ from: () => ({ where: async () => [] }) }) })

    await handler({ event: { data: { titleId: 6 } }, step })

    expect(queueSearchReindexForTitle).toHaveBeenCalledWith(6)
  })

  it('still resolves without marking the title failed when the watcher lookup throws', async () => {
    const { queueSearchReindexForTitle: realQueueSearchReindexForTitle } = await vi.importActual<typeof import('~~/server/utils/search/searchEvents')>('~~/server/utils/search/searchEvents')
    queueSearchReindexForTitle.mockImplementation(realQueueSearchReindexForTitle)
    harness.givenDb({ select: [[{ kind: 'movie', tmdbId: 603 }]] })
    tmdbGet.mockResolvedValue(rawMovie)
    const failingLookup = { from: () => failingLookup, innerJoin: () => failingLookup, where: () => Promise.reject(new Error('db down')) }
    const harnessSelect = harnessDb.select
    let selectCalls = 0
    vi.stubGlobal('db', { ...harnessDb, select: (columns?: unknown) => ++selectCalls === 1 ? harnessSelect(columns) : failingLookup })

    await expect(handler({ event: { data: { titleId: 5 } }, step })).resolves.toEqual({ titleId: 5, episodes: 0 })

    expect(harness.mocks.updateSet).not.toHaveBeenCalledWith(expect.objectContaining({ enrichmentState: 'failed' }))
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ titleId: 5 }), 'failed to queue search reindex for a title; the nightly rebuild will catch up')
  })

  it('sends nothing when TMDB does not know the title', async () => {
    const { TmdbNotFoundError } = await import('~~/server/utils/tmdb/client')
    harness.givenDb({ select: [[{ kind: 'movie', tmdbId: 603 }]] })
    tmdbGet.mockRejectedValue(new TmdbNotFoundError('missing'))

    await expect(handler({ event: { data: { titleId: 5 } }, step })).rejects.toThrow()
    expect(queueSearchReindexForTitle).not.toHaveBeenCalled()
  })
})
