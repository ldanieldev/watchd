import { describe, expect, it } from 'vitest'
import type { Episode, LibraryData, Title } from '~/utils/library/types'
import { buildFixtures } from '~/utils/library/fixtures'
import { relativeDay } from '~/utils/library/dates'
import {
  episodeCode,
  groupByLetter,
  groupByPeriod,
  monthGrid,
  pickUpNext,
  recentlyWatched,
  releasesBetween,
  summarize,
  weekOf
} from '~/utils/library/derive'

const now = new Date(2026, 10, 19, 12)

function show(id: string, overrides: Partial<Title> = {}): Title {
  return { id, type: 'tv', name: id, firstAired: '2026-01-01', posterPath: '/p.jpg', ...overrides }
}

function episodes(titleId: string, count: number, airedCount: number, season = 1): Episode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${titleId}-${season}-${index + 1}`,
    titleId,
    season,
    number: index + 1,
    airDate: index < airedCount ? `2026-10-${String(index + 1).padStart(2, '0')}` : `2026-12-${String(index + 1).padStart(2, '0')}`
  }))
}

function watched(titleId: string, count: number, day = 10, season = 1) {
  return Array.from({ length: count }, (_, index) => ({
    titleId,
    episodeId: `${titleId}-${season}-${index + 1}`,
    watchedAt: `2026-11-${String(day).padStart(2, '0')}T20:00:00`
  }))
}

describe('summarize', () => {
  it('counts watched, aired and new episodes for a show in progress', () => {
    const data: LibraryData = { titles: [show('a')], episodes: episodes('a', 10, 8), watches: watched('a', 5) }
    expect(summarize(data, now)[0]).toMatchObject({ watchedCount: 5, airedCount: 8, totalCount: 10, newCount: 3, status: 'watching', progress: 0.5 })
  })

  it('treats a show with no aired episodes as planned with zero progress', () => {
    const data: LibraryData = { titles: [show('a')], episodes: episodes('a', 12, 0), watches: [] }
    expect(summarize(data, now)[0]).toMatchObject({ progress: 0, status: 'planned', newCount: 0 })
  })

  it('marks a show completed when every episode has aired and been watched', () => {
    const data: LibraryData = { titles: [show('a')], episodes: episodes('a', 4, 4), watches: watched('a', 4) }
    expect(summarize(data, now)[0]!.status).toBe('completed')
  })

  it('lets a held status win over the derived one', () => {
    const data: LibraryData = { titles: [show('a', { heldStatus: 'paused' })], episodes: episodes('a', 10, 8), watches: watched('a', 5) }
    expect(summarize(data, now)[0]!.status).toBe('paused')
  })

  it('marks a movie completed when watched without a partial position', () => {
    const data: LibraryData = { titles: [show('m', { type: 'movie', runtimeMinutes: 120 })], episodes: [], watches: [{ titleId: 'm', watchedAt: '2026-11-01T20:00:00' }] }
    expect(summarize(data, now)[0]!.status).toBe('completed')
  })

  it('marks a partially watched movie as watching with minutes left', () => {
    const data: LibraryData = { titles: [show('m', { type: 'movie', runtimeMinutes: 120 })], episodes: [], watches: [{ titleId: 'm', watchedAt: '2026-11-01T20:00:00', minutesWatched: 30 }] }
    expect(summarize(data, now)[0]).toMatchObject({ status: 'watching', minutesLeft: 90 })
  })
})

describe('specials', () => {
  it('summarize ignores specials', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: [...episodes('a', 3, 3), ...episodes('a', 2, 2, 0)],
      watches: watched('a', 3)
    }
    const summary = summarize(data, now)[0]!
    expect(summary).toMatchObject({ status: 'completed', newCount: 0, totalCount: 3 })
    expect(summary.nextEpisode).toBeUndefined()
  })

  it('lastWatchedAt ignores watches of specials', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: [...episodes('a', 3, 3), ...episodes('a', 2, 2, 0)],
      watches: [...watched('a', 1, 5), ...watched('a', 1, 15, 0)]
    }
    expect(summarize(data, now)[0]!.lastWatchedAt).toBe('2026-11-05T20:00:00')
  })

  it('releasesBetween leaves out specials', () => {
    const data: LibraryData = { titles: [show('a')], episodes: episodes('a', 2, 2, 0), watches: [] }
    expect(releasesBetween(data, '2026-10-01', '2026-10-31')).toEqual([])
  })
})

describe('pickUpNext', () => {
  it('picks the most recently watched episodic title with new episodes, never a movie', () => {
    const data: LibraryData = {
      titles: [show('older'), show('newer', { type: 'anime' }), show('caught-up'), show('m', { type: 'movie', runtimeMinutes: 100 })],
      episodes: [...episodes('older', 6, 6), ...episodes('newer', 6, 6), ...episodes('caught-up', 2, 2)],
      watches: [...watched('older', 2, 5), ...watched('newer', 3, 12), ...watched('caught-up', 2, 18), { titleId: 'm', watchedAt: '2026-11-19T10:00:00', minutesWatched: 10 }]
    }
    const pick = pickUpNext(summarize(data, now))
    expect(pick?.title.id).toBe('newer')
    expect(pick?.nextEpisode?.number).toBe(4)
  })

  it('returns undefined when nothing has unwatched aired episodes', () => {
    const data: LibraryData = { titles: [show('a')], episodes: episodes('a', 2, 2), watches: watched('a', 2) }
    expect(pickUpNext(summarize(data, now))).toBeUndefined()
  })
})

describe('weekOf', () => {
  const empty: LibraryData = { titles: [], episodes: [], watches: [] }
  const expectedDates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

  it('returns Monday to Sunday when today is Monday', () => {
    const week = weekOf(empty, new Date(2026, 10, 16, 9))
    expect(week.map(day => day.date)).toEqual(expectedDates)
    expect(week[0]!.isToday).toBe(true)
  })

  it('returns the same week when today is Sunday', () => {
    const week = weekOf(empty, new Date(2026, 10, 22, 23))
    expect(week.map(day => day.date)).toEqual(expectedDates)
    expect(week[6]!.isToday).toBe(true)
    expect(week[5]!.isPast).toBe(true)
  })
})

describe('monthGrid', () => {
  it('starts on the 1st when the month begins on a Monday', () => {
    const grid = monthGrid(2026, 5)
    expect(grid[0]![0]!.date).toBe('2026-06-01')
    expect(grid.every(week => week.length === 7)).toBe(true)
  })

  it('pads November 2026 back to Monday 26 October across six weeks', () => {
    const grid = monthGrid(2026, 10)
    expect(grid[0]![0]).toEqual({ date: '2026-10-26', inMonth: false })
    expect(grid.length).toBe(6)
    expect(grid[5]!.some(cell => cell.date === '2026-11-30')).toBe(true)
  })
})

describe('groupByPeriod', () => {
  it('groups dates into upcoming, this week, earlier this month, months, years and not started', () => {
    const items = ['2025-06-01', undefined, '2026-11-03', '2026-11-25', '2026-10-11', '2026-11-17']
    const groups = groupByPeriod(items, item => item, now)
    expect(groups.map(group => group.label)).toEqual(['Upcoming', 'This week', 'Earlier in November', 'October', '2025', 'Not started'])
  })
})

describe('groupByLetter', () => {
  it('groups by first letter with # for non-letters', () => {
    const groups = groupByLetter(['Arcane', '86', 'Ash'], name => name)
    expect(groups).toEqual([{ label: '#', items: ['86'] }, { label: 'A', items: ['Arcane', 'Ash'] }])
  })
})

describe('episodeCode', () => {
  const episode = (season: number, number: number): Episode => ({ id: 'e', titleId: 't', season, number, airDate: '2026-11-19' })

  it('uses SxEy for TV', () => {
    expect(episodeCode(show('t'), episode(3, 9))).toBe('S3E9')
  })

  it('uses a bare episode number for single-season anime', () => {
    expect(episodeCode(show('t', { type: 'anime' }), episode(1, 39))).toBe('E39')
  })

  it('uses SxEy for anime past season one', () => {
    expect(episodeCode(show('t', { type: 'anime' }), episode(2, 7))).toBe('S2E7')
  })
})

describe('buildFixtures', () => {
  const fixtures = buildFixtures(now)
  const summaries = summarize(fixtures, now)

  it('gives TV and anime every status so each library tab has items', () => {
    for (const type of ['tv', 'anime'] as const) {
      const statuses = new Set(summaries.filter(summary => summary.title.type === type).map(summary => summary.status))
      expect([...statuses].sort()).toEqual(['completed', 'dropped', 'paused', 'planned', 'watching'])
    }
  })

  it('has an up-next title and releases in the current week', () => {
    expect(pickUpNext(summaries)).toBeDefined()
    expect(weekOf(fixtures, now).filter(day => day.releases.length > 0).length).toBeGreaterThanOrEqual(4)
  })

  it('Tulsa King fixture has a mid-series gap and an upcoming episode', () => {
    const watchedIds = new Set(fixtures.watches.map(watch => watch.episodeId))
    for (let number = 7; number <= 10; number++) expect(watchedIds.has(`tulsa-king-3-${number}`)).toBe(false)
    expect(watchedIds.has('tulsa-king-3-6')).toBe(true)
    expect(watchedIds.has('tulsa-king-4-8')).toBe(true)
    expect(fixtures.episodes.find(episode => episode.id === 'tulsa-king-4-9')?.airDate).toBe('2026-11-20')
  })

  it('never records a watch for an episode that has not aired', () => {
    const airDates = new Map(fixtures.episodes.map(episode => [episode.id, episode.airDate]))
    const today = '2026-11-19'
    expect(fixtures.watches.filter(watch => watch.episodeId && airDates.get(watch.episodeId)! > today)).toEqual([])
  })
})

describe('recentlyWatched', () => {
  it('lists each title once, at its latest finished watch, newest first', () => {
    const data: LibraryData = {
      titles: [show('a'), show('b')],
      episodes: episodes('a', 3, 3).concat(episodes('b', 1, 1)),
      watches: [...watched('a', 1, 10), { titleId: 'a', episodeId: 'a-1-2', watchedAt: '2026-11-12T20:00:00' }, ...watched('b', 1, 11)]
    }
    expect(recentlyWatched(data).map(entry => [entry.title.id, entry.episode?.id])).toEqual([['a', 'a-1-2'], ['b', 'b-1-1']])
  })
})

describe('relativeDay', () => {
  it('describes recent days in words', () => {
    expect(['2026-11-19T08:00:00', '2026-11-18T23:00:00', '2026-11-12T20:00:00'].map(date => relativeDay(date, now))).toEqual(['today', 'yesterday', '7 days ago'])
  })
})
