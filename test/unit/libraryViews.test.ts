import { describe, expect, it } from 'vitest'
import type { LibraryData, Title } from '~~/shared/utils/library/types'
import type { PersonDetail } from '~~/shared/types/library'
import { historyView, homeView, inViewerZone, personLibraryTitles, releasesView, slimTitle, statsView, summariesView, titleSlice } from '~~/shared/utils/library/views'

const today = new Date(2026, 10, 20)
const credit = { personId: 1, name: 'Actor', role: 'Lead' }
const show: Title = {
  id: 'show', type: 'tv', name: 'Show', tmdbId: 10, firstAired: '2020-01-01', posterPath: '/s.jpg',
  genres: ['Drama'], studios: ['Studio'], network: 'Net', cast: [credit], crew: [{ personId: 2, name: 'Director', role: 'Director' }]
}
const movie: Title = { id: 'movie', type: 'movie', name: 'Movie', tmdbId: 10, firstAired: '2026-11-18', posterPath: '/m.jpg', runtimeMinutes: 100, cast: [credit] }
const sequel: Title = { id: 'sequel', type: 'movie', name: 'Sequel', tmdbId: 11, firstAired: '2026-12-01', posterPath: '/q.jpg', runtimeMinutes: 90 }

const library: LibraryData = {
  titles: [show, movie, sequel],
  episodes: [1, 2, 3].map(number => ({ id: `show-1-${number}`, titleId: 'show', season: 1, number, airDate: `2026-11-1${number}` })),
  watches: [
    { titleId: 'show', episodeId: 'show-1-1', watchedAt: '2026-11-11T21:00:00' },
    { titleId: 'movie', watchedAt: '2026-11-19T20:00:00' },
    { titleId: 'sequel', watchedAt: '2025-01-01T20:00:00' }
  ]
}

const richKeys = ['cast', 'crew', 'genres', 'studios', 'network']
const expectSlim = (title: Title) => richKeys.forEach(key => expect(title).not.toHaveProperty(key))

describe('slimTitle', () => {
  it('drops the credit and taxonomy fields and keeps what cards render', () => {
    expect(slimTitle(show)).toEqual({ id: 'show', type: 'tv', name: 'Show', tmdbId: 10, firstAired: '2020-01-01', posterPath: '/s.jpg' })
  })
})

describe('inViewerZone', () => {
  it('turns UTC instants into wall-clock times in the zone', () => {
    const stored = { ...library, watches: [{ titleId: 'movie', watchedAt: '2026-11-20T03:15:00.000Z' }] }
    expect(inViewerZone(stored, 'America/Chicago').watches[0]!.watchedAt).toBe('2026-11-19T21:15:00')
  })
})

describe('homeView', () => {
  it('picks up next, the week, in progress and recent with slim titles', () => {
    const view = homeView(library, today)

    expect(view.upNext?.title.id).toBe('show')
    expect(view.upNext?.nextEpisode?.id).toBe('show-1-2')
    expect(view.inProgress.map(summary => summary.title.id)).toEqual(['show'])
    expect(view.recent.map(entry => entry.title.id)).toEqual(['movie', 'show', 'sequel'])
    expect(view.week).toHaveLength(7)
    expect(view.week.flatMap(day => day.releases).map(release => release.title.id)).toEqual(['movie'])
    expectSlim(view.upNext!.title)
    expectSlim(view.recent[0]!.title)
    expectSlim(view.week.flatMap(day => day.releases)[0]!.title)
  })
})

describe('summariesView', () => {
  it('summarizes only titles of the type, with slim titles', () => {
    const view = summariesView(library, 'movie', today)

    expect(view.map(summary => summary.title.id)).toEqual(['movie', 'sequel'])
    view.forEach(summary => expectSlim(summary.title))
  })
})

describe('releasesView', () => {
  it('lists releases in the range with slim titles', () => {
    const view = releasesView(library, '2026-11-12', '2026-11-18')

    expect(view.map(release => `${release.title.id}:${release.date}`)).toEqual(['show:2026-11-12', 'show:2026-11-13', 'movie:2026-11-18'])
    expectSlim(view[0]!.title)
  })
})

describe('historyView', () => {
  it('opens on the latest month with watches of the type', () => {
    const view = historyView(library, 'latest', 'all', today)

    expect(view).toMatchObject({ month: '2026-11', latest: '2026-11' })
    expect(view.days.map(day => day.date)).toEqual(['2026-11-19', '2026-11-11'])
    expectSlim(view.days[0]!.entries[0]!.title)
  })

  it('returns the asked month and still reports the latest', () => {
    expect(historyView(library, '2025-01', 'movie', today)).toMatchObject({ month: '2025-01', latest: '2026-11', days: [{ date: '2025-01-01' }] })
  })

  it('falls back to the current month when nothing matches', () => {
    const empty = { ...library, watches: [] }
    expect(historyView(empty, 'latest', 'all', today)).toEqual({ month: '2026-11', days: [] })
  })
})

describe('statsView', () => {
  it('reports the range totals, the previous range, and both variants of each toggle', () => {
    const view = statsView(library, '30d', 'all', today)

    expect(view.total).toEqual({ minutes: 145, plays: 2, titles: 2 })
    expect(view.previousTotal).toEqual({ minutes: 0, plays: 0, titles: 0 })
    expect(view.people.actor.plays.map(row => row.item.name)).toEqual(['Actor'])
    expect(view.people.actor.titles[0]!.value).toBe(2)
    expect(view.studios.plays.map(row => row.item)).toEqual(['Net', 'Studio'])
    expect(view.genres.minutes).toEqual([{ item: 'Drama', value: 45 }])
    expect(view.genres.plays).toEqual([{ item: 'Drama', value: 1 }])
    expect(view.top.movie.map(row => row.title.id)).toEqual(['movie'])
    expect(view.featured?.person.name).toBe('Actor')
    expect(view.months).toHaveLength(2)
    expect(view.daily).toHaveLength(30)
    view.featured!.titles.forEach(expectSlim)
    expectSlim(view.highlights.first!.title)
    expectSlim(view.top.movie[0]!.title)
  })
})

describe('titleSlice', () => {
  it('keeps one title with its episodes and watches', () => {
    const slice = titleSlice(library, 'show', [])!

    expect(slice.titles).toEqual([show])
    expect(slice.episodes).toHaveLength(3)
    expect(slice.watches.map(watch => watch.titleId)).toEqual(['show'])
  })

  it('adds the collection members in the library and their watches', () => {
    const slice = titleSlice(library, 'movie', [10, 11, 99])!

    expect(slice.titles.map(title => title.id)).toEqual(['movie', 'sequel'])
    expect(slice.watches.map(watch => watch.titleId)).toEqual(['movie', 'sequel'])
  })

  it('is undefined for a title outside the library', () => {
    expect(titleSlice(library, 'missing', [])).toBeUndefined()
  })
})

describe('personLibraryTitles', () => {
  it('returns library titles credited to the person, matching movie and TV ids separately', () => {
    const person = { personId: 1, credits: [{ tmdbId: 10, mediaType: 'tv' }] } as unknown as PersonDetail

    expect(personLibraryTitles(library, person)).toEqual([slimTitle(show)])
  })
})
