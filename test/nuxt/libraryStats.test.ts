import { describe, expect, it } from 'vitest'
import type { LibraryData, Title, TitleStatus, TitleSummary, WatchEvent } from '~/utils/library/types'
import {
  averages,
  changePercent,
  completedOfStarted,
  dailyMinutes,
  eraLeaders,
  featuredPerson,
  genreLeaders,
  highlights,
  mostPlayed,
  roleLeaders,
  statusByType,
  statusCounts,
  studioLeaders,
  minutesByHour,
  minutesByMonth,
  minutesByType,
  minutesByWeekday,
  mostActiveWeekday,
  rhythm,
  statsWindow,
  statWatches,
  streaks,
  totals
} from '~/utils/library/stats'
import { withSnapshotDetails } from '~~/test/fixtures/library'

const today = new Date(2026, 10, 20)
const show: Title = { id: 'show', type: 'tv', name: 'Show', firstAired: '2020-01-01', posterPath: '/p.jpg' }
const movie: Title = { id: 'movie', type: 'movie', name: 'Movie', firstAired: '2020-01-01', posterPath: '/p.jpg', runtimeMinutes: 100 }

function libraryWith(watches: WatchEvent[]): LibraryData {
  return {
    titles: [show, movie],
    episodes: Array.from({ length: 20 }, (_, index) => ({ id: `show-1-${index + 1}`, titleId: 'show', season: 1, number: index + 1, airDate: '2020-01-01' })),
    watches
  }
}

function episodeWatch(number: number, watchedAt: string): WatchEvent {
  return { titleId: 'show', episodeId: `show-1-${number}`, watchedAt }
}

const data = libraryWith([
  episodeWatch(1, '2025-11-20T21:00:00'),
  episodeWatch(2, '2026-11-16T21:15:00'),
  episodeWatch(3, '2026-11-18T09:00:00'),
  episodeWatch(4, '2026-11-19T22:00:00'),
  { titleId: 'movie', watchedAt: '2026-11-19T20:00:00' }
])

describe('statsWindow', () => {
  it('covers the last 30 days and the 30 before', () => {
    expect(statsWindow('30d', today, data)).toEqual({ from: '2026-10-22', to: '2026-11-20', previousFrom: '2026-09-22', previousTo: '2026-10-21' })
  })

  it('covers the last 90 days', () => {
    expect(statsWindow('90d', today, data)).toMatchObject({ from: '2026-08-23', to: '2026-11-20', previousTo: '2026-08-22' })
  })

  it('starts 12 months on the first of the month', () => {
    expect(statsWindow('12m', today, data)).toMatchObject({ from: '2025-12-01', to: '2026-11-20', previousTo: '2025-11-30' })
  })

  it('starts all time at the earliest watch', () => {
    expect(statsWindow('all', today, data)).toMatchObject({ from: '2025-11-20', to: '2026-11-20' })
  })
})

describe('statWatches', () => {
  it('keeps watches inside inclusive bounds for the type', () => {
    expect(statWatches(data, 'tv', '2026-11-16', '2026-11-18').map(watch => watch.date)).toEqual(['2026-11-16', '2026-11-18'])
    expect(statWatches(data, 'movie', '2026-01-01', '2026-12-31')).toHaveLength(1)
  })

  it('numbers weekdays from Monday', () => {
    expect(statWatches(data, 'all', '2026-11-16', '2026-11-16')[0]).toMatchObject({ weekday: 0, hour: 21, minutes: 45 })
  })
})

describe('time aggregates', () => {
  const recent = statWatches(data, 'all', '2026-11-01', '2026-11-20')

  it('totals minutes, plays and titles', () => {
    expect(totals(recent)).toEqual({ minutes: 235, plays: 4, titles: 2 })
  })

  it('splits minutes by type', () => {
    expect(minutesByType(recent)).toEqual({ tv: 135, anime: 0, movie: 100 })
  })

  it('buckets by weekday, hour and both', () => {
    expect(minutesByWeekday(recent)).toEqual([45, 0, 45, 145, 0, 0, 0])
    expect(minutesByHour(recent)[9]).toBe(45)
    expect(minutesByHour(recent)).toHaveLength(24)
    expect(rhythm(recent)[3]![20]).toBe(100)
  })

  it('includes empty months and days in the window', () => {
    const window = statsWindow('12m', today, data)
    const months = minutesByMonth(recent, window)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: '2025-12', minutes: 0 })
    expect(months.at(-1)).toEqual({ month: '2026-11', minutes: 235 })
    expect(dailyMinutes(recent, statsWindow('30d', today, data))).toHaveLength(30)
  })

  it('picks the busiest weekday with its share', () => {
    expect(mostActiveWeekday(recent)).toEqual({ weekday: 3, share: 145 / 235 })
  })
})

describe('streaks', () => {
  it('counts back from yesterday when nothing is watched today', () => {
    expect(streaks(statWatches(data, 'all', '2026-01-01', '2026-11-20'), today)).toEqual({ current: 2, longest: 2 })
  })

  it('resets on a gap and keeps the longest run', () => {
    const watches = statWatches(libraryWith([
      episodeWatch(1, '2026-11-01T21:00:00'),
      episodeWatch(2, '2026-11-02T21:00:00'),
      episodeWatch(3, '2026-11-03T21:00:00'),
      episodeWatch(4, '2026-11-20T08:00:00')
    ]), 'all', '2026-01-01', '2026-11-20')
    expect(streaks(watches, today)).toEqual({ current: 1, longest: 3 })
  })
})

describe('changePercent', () => {
  it('is the change against the previous value', () => {
    expect(changePercent(150, 100)).toBe(50)
  })

  it('is undefined without a previous value', () => {
    expect(changePercent(5, 0)).toBeUndefined()
  })
})

describe('highlights', () => {
  it('finds the first, last and today-in-history watches', () => {
    const recent = statWatches(data, 'all', '2026-11-01', '2026-11-20')
    const found = highlights(data, recent, today)
    expect(found.first?.date).toBe('2026-11-16')
    expect(found.last?.watch.watchedAt).toBe('2026-11-19T22:00:00')
    expect(found.todayInHistory?.date).toBe('2025-11-20')
  })
})

describe('empty input', () => {
  const window = statsWindow('30d', today, data)

  it('returns zeros and nothing without NaN', () => {
    expect(totals([])).toEqual({ minutes: 0, plays: 0, titles: 0 })
    expect(mostActiveWeekday([])).toBeUndefined()
    expect(streaks([], today)).toEqual({ current: 0, longest: 0 })
    expect(Object.values(averages([], window)).every(value => value === 0)).toBe(true)
    expect(highlights(libraryWith([]), [], today)).toEqual({})
  })
})

describe('library panels', () => {
  const films: Title[] = [
    { id: 'dune', type: 'movie', name: 'Dune', firstAired: '2021-09-15', posterPath: '/p.jpg', runtimeMinutes: 155 },
    { id: 'dune-part-two', type: 'movie', name: 'Dune: Part Two', firstAired: '2024-03-01', posterPath: '/p.jpg', runtimeMinutes: 166 },
    { id: 'blade-runner-2049', type: 'movie', name: 'Blade Runner 2049', firstAired: '2017-10-06', posterPath: '/p.jpg', runtimeMinutes: 164 },
    { id: 'not-in-snapshot', type: 'movie', name: 'Unknown', firstAired: '1995-01-01', posterPath: '/p.jpg', runtimeMinutes: 90 }
  ]
  const library: LibraryData = {
    titles: films.map(withSnapshotDetails),
    episodes: [],
    watches: [
      { titleId: 'dune', watchedAt: '2026-11-01T21:00:00' },
      { titleId: 'dune-part-two', watchedAt: '2026-11-02T21:00:00' },
      { titleId: 'dune-part-two', watchedAt: '2026-11-09T21:00:00' },
      { titleId: 'blade-runner-2049', watchedAt: '2026-11-03T21:00:00' },
      { titleId: 'not-in-snapshot', watchedAt: '2026-11-04T21:00:00' }
    ]
  }
  const watches = statWatches(library, 'all', '2026-11-01', '2026-11-20')

  it('features the person across the most watched titles', () => {
    const featured = featuredPerson(watches)!
    expect(featured.person.name).toBe('Denis Villeneuve')
    expect(featured.titles.map(title => title.id).sort()).toEqual(['blade-runner-2049', 'dune', 'dune-part-two'])
    expect(featured).toMatchObject({ movies: 3, shows: 0, playShare: 0.8 })
  })

  it('ranks actors, directors and writers', () => {
    const actorsByTitles = roleLeaders(watches, 'actor', 'titles')
    expect(actorsByTitles.slice(0, 2).map(row => row.item.name).sort()).toEqual(['Rebecca Ferguson', 'Timothée Chalamet'])
    expect(actorsByTitles[0]!.value).toBe(2)
    expect(roleLeaders(watches, 'actor', 'plays')[0]!.value).toBe(3)
    expect(roleLeaders(watches, 'director', 'titles')[0]).toMatchObject({ item: { name: 'Denis Villeneuve' }, value: 3 })
    expect(roleLeaders(watches, 'writer', 'titles')[0]).toMatchObject({ item: { name: 'Jon Spaihts' }, value: 2 })
    expect(roleLeaders(watches, 'actor', 'titles', 3)).toHaveLength(3)
  })

  it('ranks studios, genres and eras', () => {
    expect(studioLeaders(watches, 'plays')[0]).toEqual({ item: 'Legendary Pictures', value: 3 })
    expect(studioLeaders(watches, 'titles')[0]).toEqual({ item: 'Legendary Pictures', value: 2 })
    expect(genreLeaders(watches, 'plays')[0]).toEqual({ item: 'Science Fiction', value: 4 })
    expect(genreLeaders(watches, 'minutes')[0]).toEqual({ item: 'Science Fiction', value: 155 + 166 * 2 + 164 })
    expect(eraLeaders(watches, 'plays')).toEqual([{ item: '2020s', value: 3 }, { item: '1990s', value: 1 }, { item: '2010s', value: 1 }])
  })

  it('lists the most played titles of a type by minutes', () => {
    expect(mostPlayed(watches, 'movie').map(row => row.title.id)).toEqual(['dune-part-two', 'blade-runner-2049', 'dune', 'not-in-snapshot'])
    expect(mostPlayed(watches, 'movie')[0]).toMatchObject({ minutes: 332, plays: 2 })
    expect(mostPlayed(watches, 'anime')).toEqual([])
  })

  it('returns nothing for no watches', () => {
    expect(featuredPerson([])).toBeUndefined()
    expect(roleLeaders([], 'actor', 'plays')).toEqual([])
    expect(studioLeaders([], 'plays')).toEqual([])
    expect(genreLeaders([], 'plays')).toEqual([])
  })
})

describe('status panels', () => {
  function summary(type: Title['type'], status: TitleStatus): TitleSummary {
    return {
      title: { id: `${type}-${status}`, type, name: 'x', firstAired: '2020-01-01', posterPath: '/p.jpg' },
      status,
      watchedCount: 0,
      airedCount: 0,
      totalCount: 0,
      newCount: 0,
      progress: 0,
      timesWatched: 0
    }
  }
  const summaries = [summary('tv', 'completed'), summary('tv', 'watching'), summary('anime', 'completed'), summary('movie', 'planned'), summary('movie', 'dropped')]

  it('counts statuses for a type filter', () => {
    expect(statusCounts(summaries, 'all')).toEqual({ watching: 1, completed: 2, planned: 1, paused: 0, dropped: 1 })
    expect(statusCounts(summaries, 'tv')).toEqual({ watching: 1, completed: 1, planned: 0, paused: 0, dropped: 0 })
  })

  it('breaks statuses down by type', () => {
    expect(statusByType(summaries).movie).toEqual({ watching: 0, completed: 0, planned: 1, paused: 0, dropped: 1 })
  })

  it('counts completed out of started titles', () => {
    expect(completedOfStarted(summaries, 'all')).toEqual({ completed: 2, started: 4 })
  })
})
