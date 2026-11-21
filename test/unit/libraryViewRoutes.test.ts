import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryData } from '~~/shared/utils/library/types'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const loadUserLibrary = vi.fn<(userId: number) => Promise<LibraryData>>()
vi.mock('~~/server/utils/library/loadUserLibrary', () => ({ loadUserLibrary }))

const harness = createServerHandlerHarness()

type Handler = (e: unknown) => Promise<unknown>
const route = async (path: string) => (await import(`~~/server/api/library/views/${path}`)).default as Handler
const home = await route('home.get')
const summaries = await route('summaries.get')
const releases = await route('releases.get')
const history = await route('history.get')
const stats = await route('stats.get')
const title = await route('title/[id].get')

const library: LibraryData = {
  titles: [
    { id: '5', type: 'tv', name: 'Show', tmdbId: 50, firstAired: '2026-01-01', posterPath: '/s.jpg', cast: [{ personId: 1, name: 'A', role: 'B' }] },
    { id: '9', type: 'movie', name: 'Film', tmdbId: 90, firstAired: '2026-11-19', posterPath: '/f.jpg', runtimeMinutes: 100 }
  ],
  episodes: [{ id: '5-1-1', titleId: '5', season: 1, number: 1, airDate: '2026-11-01' }],
  watches: [
    { titleId: '5', episodeId: '5-1-1', watchedAt: '2026-11-20T03:15:00.000Z' },
    { titleId: '9', watchedAt: '2026-11-19T20:00:00.000Z' }
  ]
}

beforeEach(() => {
  harness.reset()
  harness.setSession({ user: { id: 7 } })
  loadUserLibrary.mockReset().mockResolvedValue(library)
})

describe('library view routes', () => {
  it.each([
    ['home', home, {}],
    ['summaries', summaries, { type: 'tv' }],
    ['releases', releases, { from: '2026-11-01', to: '2026-11-30' }],
    ['history', history, {}],
    ['stats', stats, {}]
  ])('%s rejects a request without a session with 401', async (_name, handler, query) => {
    harness.setSession({})

    await expect(handler(event({ query }))).rejects.toMatchObject({ statusCode: 401 })
    expect(loadUserLibrary).not.toHaveBeenCalled()
  })

  it('loads the session user\'s library', async () => {
    await home(event())

    expect(loadUserLibrary).toHaveBeenCalledWith(7)
  })

  it('groups watches by the viewer\'s zone and today', async () => {
    const chicago = await history(event({ query: { tz: 'America/Chicago', today: '2026-11-19', type: 'tv' } })) as { days: { date: string }[] }
    const utc = await history(event({ query: { tz: 'UTC', today: '2026-11-20', type: 'tv' } })) as { days: { date: string }[] }

    expect(chicago.days.map(day => day.date)).toEqual(['2026-11-19'])
    expect(utc.days.map(day => day.date)).toEqual(['2026-11-20'])
  })

  it('falls back to the tz cookie, then UTC, for an invalid zone', async () => {
    const fromCookie = await history(event({ query: { tz: 'Not/AZone', type: 'tv' }, cookies: { tz: 'America/Chicago' } })) as { days: { date: string }[] }
    const fallback = await history(event({ cookies: { tz: 'bogus' }, query: { type: 'tv' } })) as { days: { date: string }[] }

    expect(fromCookie.days.map(day => day.date)).toEqual(['2026-11-19'])
    expect(fallback.days.map(day => day.date)).toEqual(['2026-11-20'])
  })

  it('returns slim titles', async () => {
    const view = await summaries(event({ query: { type: 'tv', today: '2026-11-20' } })) as { title: object }[]

    expect(view[0]!.title).not.toHaveProperty('cast')
  })

  it.each([
    ['summaries without a type', summaries, {}],
    ['summaries with an unknown type', summaries, { type: 'book' }],
    ['releases without dates', releases, {}],
    ['releases with a reversed range', releases, { from: '2026-11-30', to: '2026-11-01' }],
    ['history with a bad month', history, { month: '2026-13' }],
    ['history with an unknown type', history, { type: 'book' }],
    ['stats with an unknown range', stats, { range: '7d' }]
  ])('rejects %s with 400', async (_name, handler, query) => {
    await expect(handler(event({ query }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('GET /api/library/views/title/:id', () => {
  it('returns the title\'s slice with its collection members', async () => {
    harness.givenDb({ select: [[{ detail: { collection: { memberTmdbIds: [90] } } }]] })

    const slice = await title(event({ params: { id: '9' } })) as LibraryData

    expect(slice.titles.map(candidate => candidate.id)).toEqual(['9'])
    expect(slice.watches).toEqual([library.watches[1]])
  })

  it('returns 404 for a title the user has not watched', async () => {
    harness.givenDb({ select: [[]] })

    await expect(title(event({ params: { id: '42' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a non-numeric id with 400', async () => {
    await expect(title(event({ params: { id: 'abc' } }))).rejects.toMatchObject({ statusCode: 400 })
  })
})
