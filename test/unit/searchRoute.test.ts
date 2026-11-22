import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const search = vi.fn()
vi.mock('~~/server/utils/search/meili', () => ({ libraryTitlesIndex: () => ({ search }) }))

const harness = createServerHandlerHarness()

type Handler = (e: unknown) => Promise<unknown>
const route = (await import('~~/server/api/search.get')).default as Handler

const document = { id: '5_9', userId: 5, titleId: 9, name: 'Attack on Titan', originalName: '進撃の巨人', alternativeNames: ['Shingeki no Kyojin', 'AOT'], year: '2013', category: 'anime', posterPath: '/a.jpg' }

beforeEach(() => {
  harness.reset()
  harness.setSession({ user: { id: 5 } })
  search.mockReset().mockResolvedValue({ hits: [] })
})

describe('GET /api/search', () => {
  it('rejects a request without a session with 401', async () => {
    harness.setSession({})

    await expect(route(event({ query: { q: 'a' } }))).rejects.toMatchObject({ statusCode: 401 })
    expect(search).not.toHaveBeenCalled()
  })

  it.each([[undefined], [''], ['   ']])('returns [] for q=%j without querying Meilisearch', async (q) => {
    await expect(route(event({ query: q === undefined ? {} : { q } }))).resolves.toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('rejects an unknown category with 400', async () => {
    await expect(route(event({ query: { q: 'a', category: 'books' } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(search).not.toHaveBeenCalled()
  })

  it('filters by the session user and category', async () => {
    await route(event({ query: { q: ' attack ', category: 'anime' } }))
    await route(event({ query: { q: 'attack', category: 'all' } }))
    await route(event({ query: { q: 'attack' } }))

    expect(search).toHaveBeenNthCalledWith(1, 'attack', { filter: 'userId = 5 AND category = "anime"', limit: 8, showMatchesPosition: true })
    expect(search).toHaveBeenNthCalledWith(2, 'attack', { filter: 'userId = 5', limit: 8, showMatchesPosition: true })
    expect(search).toHaveBeenNthCalledWith(3, 'attack', { filter: 'userId = 5', limit: 8, showMatchesPosition: true })
  })

  it('caps q at 200 characters', async () => {
    await route(event({ query: { q: 'x'.repeat(300) } }))

    expect(search.mock.calls[0]![0]).toHaveLength(200)
  })

  it('maps hits and reports the alias that matched when the name did not', async () => {
    search.mockResolvedValue({
      hits: [
        { ...document, _matchesPosition: { alternativeNames: [{ start: 0, length: 8, indices: [0] }] } },
        { ...document, titleId: 10, _matchesPosition: { originalName: [{ start: 0, length: 2 }] } },
        { ...document, titleId: 11, _matchesPosition: { name: [{ start: 0, length: 6 }], alternativeNames: [{ start: 0, length: 3, indices: [1] }] } }
      ]
    })

    await expect(route(event({ query: { q: 'shingeki' } }))).resolves.toEqual([
      { titleId: '9', type: 'anime', name: 'Attack on Titan', year: '2013', posterPath: '/a.jpg', matchedAlias: 'Shingeki no Kyojin' },
      { titleId: '10', type: 'anime', name: 'Attack on Titan', year: '2013', posterPath: '/a.jpg', matchedAlias: '進撃の巨人' },
      { titleId: '11', type: 'anime', name: 'Attack on Titan', year: '2013', posterPath: '/a.jpg', matchedAlias: null }
    ])
  })

  it('returns 503 carrying the Meilisearch error as cause when the query throws', async () => {
    const failure = new Error('connection refused')
    search.mockRejectedValue(failure)

    await expect(route(event({ query: { q: 'a' } }))).rejects.toMatchObject({ statusCode: 503, cause: failure })
  })
})
