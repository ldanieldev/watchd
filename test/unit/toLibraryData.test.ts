import { describe, expect, it } from 'vitest'
import { toLibraryData, type LibraryRows } from '~~/server/utils/library/toLibraryData'

const show = {
  id: 5, kind: 'tv' as const, tmdbId: 1396, name: 'Breaking Bad', firstAired: '2008-01-20', posterPath: '/p.jpg', backdropPath: null,
  runtimeMinutes: 47, isAnime: false, genres: ['Drama'], studios: ['Sony'], network: 'AMC', cast: [], crew: []
}
const movie = { ...show, id: 9, kind: 'movie' as const, tmdbId: 603, name: 'The Matrix', network: null, firstAired: null, posterPath: null }

function rows(overrides: Partial<LibraryRows> = {}): LibraryRows {
  return { titles: [show], episodes: [], watches: [], userTitles: [], ...overrides }
}

const watch = (season: number | null, number: number | null, iso: string, titleId = 5) =>
  ({ titleId, season, number, watchedAt: new Date(iso), minutesWatched: null })

describe('toLibraryData', () => {
  it('maps titles with string ids and their summary fields', () => {
    const data = toLibraryData(rows({ titles: [show, movie] }))

    expect(data.titles[0]).toMatchObject({ id: '5', type: 'tv', name: 'Breaking Bad', tmdbId: 1396, genres: ['Drama'], network: 'AMC', posterPath: '/p.jpg' })
    expect(data.titles[1]).toMatchObject({ id: '9', type: 'movie', firstAired: '', posterPath: '' })
  })

  it('names episodes by title, season and number', () => {
    const data = toLibraryData(rows({ episodes: [{ titleId: 5, season: 1, number: 3, airDate: '2008-02-10', name: '...And the Bag\'s in the River', runtimeMinutes: 48 }] }))

    expect(data.episodes).toEqual([{ id: '5-1-3', titleId: '5', season: 1, number: 3, airDate: '2008-02-10', name: '...And the Bag\'s in the River', runtimeMinutes: 48 }])
  })

  it('invents a stub episode for a play TMDB has no episode for, dated by its earliest watch in UTC', () => {
    const data = toLibraryData(rows({ watches: [watch(1, 3, '2026-11-18T03:00:00Z'), watch(1, 3, '2026-11-17T01:45:24Z')] }))

    expect(data.episodes).toEqual([{ id: '5-1-3', titleId: '5', season: 1, number: 3, airDate: '2026-11-17' }])
    expect(data.watches.map(entry => entry.episodeId)).toEqual(['5-1-3', '5-1-3'])
  })

  it('gives watch times as UTC instants', () => {
    const data = toLibraryData(rows({ watches: [watch(null, null, '2026-03-08T06:30:00Z', 9)], titles: [movie] }))

    expect(data.watches).toEqual([{ titleId: '9', watchedAt: '2026-03-08T06:30:00.000Z' }])
  })

  it('applies the user\'s anime override and held status', () => {
    const data = toLibraryData(rows({ userTitles: [{ titleId: 5, typeOverride: 'anime', heldStatus: 'paused' }] }))

    expect(data.titles[0]).toMatchObject({ type: 'anime', heldStatus: 'paused' })
  })

  it('types a detected anime series as anime unless overridden back to tv', () => {
    expect(toLibraryData(rows({ titles: [{ ...show, isAnime: true }] })).titles[0]!.type).toBe('anime')
    expect(toLibraryData(rows({ titles: [{ ...show, isAnime: true }], userTitles: [{ titleId: 5, typeOverride: 'tv', heldStatus: null }] })).titles[0]!.type).toBe('tv')
  })
})
