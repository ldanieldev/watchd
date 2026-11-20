import { describe, expect, it } from 'vitest'
import type { LibraryData, Title } from '~/utils/library/types'
import { historyMonth, latestMonthWithWatches } from '~/utils/library/history'

const show: Title = { id: 'show', type: 'tv', name: 'Show', firstAired: '2020-01-01', posterPath: '/p.jpg' }
const movie: Title = { id: 'movie', type: 'movie', name: 'Movie', firstAired: '2020-01-01', posterPath: '/p.jpg', runtimeMinutes: 100 }

const data: LibraryData = {
  titles: [show, movie],
  episodes: [1, 2, 3].map(number => ({ id: `show-1-${number}`, titleId: 'show', season: 1, number, airDate: '2020-01-01' })),
  watches: [
    { titleId: 'show', episodeId: 'show-1-1', watchedAt: '2026-10-31T23:30:00' },
    { titleId: 'show', episodeId: 'show-1-2', watchedAt: '2026-11-02T20:00:00' },
    { titleId: 'show', episodeId: 'show-1-3', watchedAt: '2026-11-02T21:00:00' },
    { titleId: 'movie', watchedAt: '2026-11-05T19:00:00', minutesWatched: 25 },
    { titleId: 'movie', watchedAt: '2026-11-06T19:00:00' }
  ]
}

describe('historyMonth', () => {
  it('lists days newest first with entries newest first', () => {
    const days = historyMonth(data, 2026, 10, 'all')
    expect(days.map(day => day.date)).toEqual(['2026-11-06', '2026-11-05', '2026-11-02'])
    expect(days[2]!.entries.map(entry => entry.episode?.id)).toEqual(['show-1-3', 'show-1-2'])
  })

  it('keeps a late-night watch on its own date', () => {
    expect(historyMonth(data, 2026, 9, 'all').map(day => day.date)).toEqual(['2026-10-31'])
  })

  it('filters by media type', () => {
    expect(historyMonth(data, 2026, 10, 'movie').map(day => day.date)).toEqual(['2026-11-06', '2026-11-05'])
  })

  it('totals the minutes for each day', () => {
    const days = historyMonth(data, 2026, 10, 'all')
    expect(days.find(day => day.date === '2026-11-02')!.totalMinutes).toBe(90)
    expect(days.find(day => day.date === '2026-11-05')!.totalMinutes).toBe(25)
  })

  it('gives partial watches a progress and full watches none', () => {
    const days = historyMonth(data, 2026, 10, 'all')
    expect(days.find(day => day.date === '2026-11-05')!.entries[0]!.progress).toBe(0.25)
    expect(days.find(day => day.date === '2026-11-06')!.entries[0]!.progress).toBeUndefined()
  })

  it('returns nothing for an empty month', () => {
    expect(historyMonth(data, 2026, 0, 'all')).toEqual([])
  })
})

describe('latestMonthWithWatches', () => {
  it('finds the newest month with a matching watch', () => {
    expect(latestMonthWithWatches(data, 'all')).toEqual({ year: 2026, monthIndex: 10 })
  })

  it('is undefined for a type with no watches', () => {
    expect(latestMonthWithWatches(data, 'anime')).toBeUndefined()
  })
})
