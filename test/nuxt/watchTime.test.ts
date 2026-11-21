import { describe, expect, it } from 'vitest'
import type { Episode, Title } from '~~/shared/utils/library/types'
import { DEFAULT_RUNTIME_MINUTES, formatDuration, minutesForWatch } from '~~/shared/utils/library/watchTime'
import { withSnapshotDetails, withSnapshotEpisode } from '~~/test/fixtures/library'

const movie: Title = { id: 'dune', type: 'movie', name: 'Dune', firstAired: '2021-09-15', posterPath: '/p.jpg', runtimeMinutes: 155 }
const tulsaKing: Title = withSnapshotDetails({ id: 'tulsa-king', type: 'tv', name: 'Tulsa King', firstAired: '2022-11-13', posterPath: '/p.jpg' })
const onePiece: Title = withSnapshotDetails({ id: 'one-piece', type: 'anime', name: 'One Piece', firstAired: '1999-10-20', posterPath: '/p.jpg' })

function episode(titleId: string, season: number, number: number): Episode {
  return withSnapshotEpisode({ id: `${titleId}-${season}-${number}`, titleId, season, number, airDate: '2020-01-01' })
}

describe('minutesForWatch', () => {
  it('counts only the watched minutes of a partial movie watch', () => {
    expect(minutesForWatch({ titleId: 'dune', watchedAt: '2026-11-01T21:00:00', minutesWatched: 40 }, movie)).toBe(40)
  })

  it('counts the full runtime of a finished movie', () => {
    expect(minutesForWatch({ titleId: 'dune', watchedAt: '2026-11-01T21:00:00' }, movie)).toBe(155)
  })

  it('uses the episode runtime', () => {
    const pilot = episode('tulsa-king', 1, 1)
    expect(minutesForWatch({ titleId: 'tulsa-king', episodeId: pilot.id, watchedAt: '2026-11-01T21:00:00' }, tulsaKing, pilot)).toBe(42)
  })

  it('falls back to the show runtime when the episode has none', () => {
    const later = episode('one-piece', 1, 1050)
    expect(minutesForWatch({ titleId: 'one-piece', episodeId: later.id, watchedAt: '2026-11-01T21:00:00' }, onePiece, later)).toBe(24)
  })

  it('falls back to the type default for a title with no runtime', () => {
    const unknown: Title = { id: 'not-in-snapshot', type: 'anime', name: 'Unknown', firstAired: '2020-01-01', posterPath: '/p.jpg' }
    expect(minutesForWatch({ titleId: unknown.id, watchedAt: '2026-11-01T21:00:00' }, unknown)).toBe(DEFAULT_RUNTIME_MINUTES.anime)
  })
})

describe('formatDuration', () => {
  it.each([
    [24, '24 min'],
    [112, '1 h 52 min'],
    [180, '3 h'],
    [0, '0 min']
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected)
  })
})
