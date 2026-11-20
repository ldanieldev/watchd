import { describe, expect, it } from 'vitest'
import type { Episode, LibraryData, Title } from '~/utils/library/types'
import { collectionMembers, seasonEpisodeRows, seasonName, seasonSummaries, titleGaps } from '~/utils/library/detail'

const todayIso = '2026-11-19'

function show(id: string, overrides: Partial<Title> = {}): Title {
  return { id, type: 'tv', name: id, firstAired: '2026-01-01', posterPath: '/p.jpg', ...overrides }
}

function seasonEpisodes(titleId: string, season: number, count: number, airedCount = count): Episode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${titleId}-${season}-${index + 1}`,
    titleId,
    season,
    number: index + 1,
    airDate: index < airedCount ? '2026-10-01' : '2026-12-01'
  }))
}

function watched(titleId: string, season: number, numbers: number[]) {
  return numbers.map(number => ({ titleId, episodeId: `${titleId}-${season}-${number}`, watchedAt: '2026-11-01T20:00:00' }))
}

describe('titleGaps', () => {
  it('gaps collapse consecutive missing episodes into ranges', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: seasonEpisodes('a', 1, 10),
      watches: watched('a', 1, [1, 2, 3, 4, 5, 6, 9])
    }

    expect(titleGaps(data, 'a', todayIso).missingRanges).toEqual([
      { season: 1, fromNumber: 7, toNumber: 8 },
      { season: 1, fromNumber: 10, toNumber: 10 }
    ])
  })

  it('a never-started season after a watched one is reported once, not as a range', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: [...seasonEpisodes('a', 1, 3), ...seasonEpisodes('a', 2, 4)],
      watches: watched('a', 1, [1, 2, 3])
    }
    const gaps = titleGaps(data, 'a', todayIso)

    expect(gaps.notStartedSeasons).toEqual([2])
    expect(gaps.missingRanges).toEqual([])
    expect(gaps.caughtUp).toBe(false)
  })

  it('a title with nothing watched reports no gaps and is not caught up', () => {
    const data: LibraryData = { titles: [show('a')], episodes: seasonEpisodes('a', 1, 4, 3), watches: [] }
    const gaps = titleGaps(data, 'a', todayIso)

    expect(gaps).toMatchObject({ missingRanges: [], notStartedSeasons: [], caughtUp: false })
    expect(gaps.nextUpcoming?.id).toBe('a-1-4')
  })

  it('caught up ignores specials and upcoming episodes', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: [...seasonEpisodes('a', 1, 4, 3), ...seasonEpisodes('a', 0, 2)],
      watches: watched('a', 1, [1, 2, 3])
    }
    const gaps = titleGaps(data, 'a', todayIso)

    expect(gaps.caughtUp).toBe(true)
    expect(gaps.nextUpcoming?.id).toBe('a-1-4')
  })
})

describe('season rows and summaries', () => {
  it('seasonEpisodeRows marks unaired episodes upcoming and lists rewatch dates newest first', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: seasonEpisodes('a', 1, 3, 2),
      watches: [
        { titleId: 'a', episodeId: 'a-1-1', watchedAt: '2026-11-01T20:00:00' },
        { titleId: 'a', episodeId: 'a-1-1', watchedAt: '2026-11-10T20:00:00' }
      ]
    }
    const rows = seasonEpisodeRows(data, 'a', 1, todayIso)

    expect(rows.map(row => row.state)).toEqual(['watched', 'missing', 'upcoming'])
    expect(rows[0]!.watchDates).toEqual(['2026-11-10T20:00:00', '2026-11-01T20:00:00'])
  })

  it('seasonSummaries puts specials last', () => {
    const data: LibraryData = {
      titles: [show('a')],
      episodes: [...seasonEpisodes('a', 0, 1), ...seasonEpisodes('a', 2, 2), ...seasonEpisodes('a', 1, 2)],
      watches: watched('a', 1, [1, 2])
    }
    const summaries = seasonSummaries(data, 'a', todayIso)

    expect(summaries.map(summary => summary.season)).toEqual([1, 2, 0])
    expect(summaries[0]).toMatchObject({ complete: true, watchedCount: 2, isSpecials: false })
    expect(summaries[2]!.isSpecials).toBe(true)
  })
})

describe('collectionMembers', () => {
  it('labels a future release unreleased', () => {
    const data: LibraryData = {
      titles: [
        show('m1', { type: 'movie', tmdbId: 1, firstAired: '2020-01-01' }),
        show('m2', { type: 'movie', tmdbId: 2, firstAired: '2027-01-01' })
      ],
      episodes: [],
      watches: [{ titleId: 'm1', watchedAt: '2026-11-01T20:00:00' }]
    }

    expect(collectionMembers(data, [2, 1, 99], todayIso).map(member => [member.title.id, member.state])).toEqual([
      ['m1', 'watched'],
      ['m2', 'unreleased']
    ])
  })
})

describe('seasonName', () => {
  it('prefers the TMDB name and falls back to Specials or Season N', () => {
    const seasonDetails = [{ season: 2, name: 'The Golden Arc' }]
    expect([seasonName(2, seasonDetails), seasonName(0), seasonName(3, seasonDetails)]).toEqual(['The Golden Arc', 'Specials', 'Season 3'])
  })
})
