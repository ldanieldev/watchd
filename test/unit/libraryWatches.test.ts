import { beforeEach, describe, expect, it } from 'vitest'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const harness = createServerHandlerHarness()
const { insertValues, deleteWhere } = harness.mocks

type Handler = (e: unknown) => Promise<unknown>
const addWatches = (await import('~~/server/api/library/watches.post')).default as Handler
const removeWatches = (await import('~~/server/api/library/watches/delete.post')).default as Handler
const saveSettings = (await import('~~/server/api/library/titles/[id]/settings.put')).default as Handler

const episodeWatch = { titleId: '5', episodeId: '5-2-7', watchedAt: '2026-11-20T21:15:00-06:00' }

beforeEach(() => {
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
})
