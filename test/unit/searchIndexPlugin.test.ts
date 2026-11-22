import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const send = vi.hoisted(() => vi.fn())
const getStats = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send } }))
vi.mock('~~/server/utils/search/meili', async importOriginal => ({
  ...await importOriginal<typeof import('~~/server/utils/search/meili')>(),
  libraryTitlesIndex: () => ({ getStats }),
  ensureLibraryTitlesIndex: vi.fn()
}))
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)

const harness = createServerHandlerHarness()
const { checkSearchIndexOnStartup } = await import('~~/server/plugins/searchIndex')
const { MeilisearchApiError } = await import('meilisearch')

function indexNotFound() {
  const error = new MeilisearchApiError(new Response(null, { status: 404 }), { message: 'Index not found', code: 'index_not_found', type: 'invalid_request', link: '' })
  return error
}

beforeEach(() => {
  send.mockReset().mockResolvedValue(undefined)
  getStats.mockReset()
  Object.values(log).forEach(spy => spy.mockReset())
  harness.reset()
})

describe('checkSearchIndexOnStartup', () => {
  it('queues all users when the index is empty', async () => {
    getStats.mockResolvedValue({ numberOfDocuments: 0 })
    harness.givenDb({ select: [[{ id: 1 }, { id: 2 }]] })

    await checkSearchIndexOnStartup()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('treats a missing index as empty', async () => {
    getStats.mockRejectedValue(indexNotFound())
    harness.givenDb({ select: [[{ id: 1 }]] })

    await checkSearchIndexOnStartup()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('queues nobody when the index has documents', async () => {
    getStats.mockResolvedValue({ numberOfDocuments: 804 })

    await checkSearchIndexOnStartup()

    expect(send).not.toHaveBeenCalled()
  })

  it('on a fresh database queues nobody and does not throw', async () => {
    getStats.mockResolvedValue({ numberOfDocuments: 0 })
    harness.givenDb({ select: [[]] })

    await expect(checkSearchIndexOnStartup()).resolves.toBeUndefined()

    expect(send).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith({ queued: 0 }, expect.any(String))
  })

  it('logs and returns when Meilisearch is unreachable', async () => {
    getStats.mockRejectedValue(new Error('fetch failed'))

    await expect(checkSearchIndexOnStartup()).resolves.toBeUndefined()

    expect(send).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalled()
  })
})
