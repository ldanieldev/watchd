import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { readTraktUpload } from '~~/server/utils/import/trakt'
import { NotAnExportError } from '~~/server/utils/import/types'

const episodeEvent = {
  id: 1, watched_at: '2026-07-19T18:06:00.000Z', action: 'scrobble', type: 'episode',
  episode: { ids: { tmdb: 5124228 }, title: 'My Older Brother\'s Feelings', number: 17, season: 2 },
  show: { ids: { tmdb: 94664 }, year: 2021, title: 'Mushoku Tensei: Jobless Reincarnation' }
}
const movieEvent = {
  id: 2, watched_at: '2026-07-13T04:41:00.000Z', action: 'watch', type: 'movie',
  movie: { ids: { tmdb: 1228710 }, year: 2026, title: 'The Mandalorian and Grogu' }
}

const jsonFile = (filename: string, value: unknown) => ({ filename, data: strToU8(JSON.stringify(value)) })

describe('readTraktUpload', () => {
  it('reads episode plays keyed by the show id', () => {
    const parsed = readTraktUpload([jsonFile('watched-history-1.json', [episodeEvent])])

    expect(parsed.plays).toEqual([{
      kind: 'tv', tmdbId: 94664, season: 2, number: 17, watchedAt: new Date('2026-07-19T18:06:00Z'),
      titleName: 'Mushoku Tensei: Jobless Reincarnation'
    }])
  })

  it('reads movie plays', () => {
    const parsed = readTraktUpload([jsonFile('watched-history-1.json', [movieEvent])])

    expect(parsed.plays).toEqual([{
      kind: 'movie', tmdbId: 1228710, watchedAt: new Date('2026-07-13T04:41:00Z'), titleName: 'The Mandalorian and Grogu'
    }])
  })

  it('skips an event with no TMDB id', () => {
    const parsed = readTraktUpload([jsonFile('watched-history-1.json', [{ ...movieEvent, movie: { ...movieEvent.movie, ids: {} } }])])

    expect(parsed.plays).toEqual([])
    expect(parsed.skipped).toEqual([{ line: 1, title: 'The Mandalorian and Grogu', reason: 'no TMDB id' }])
  })

  it('reads every history file inside a zip and ignores the rest', () => {
    const zip = zipSync({
      'watched-history-1.json': strToU8(JSON.stringify([episodeEvent])),
      'watched-history-2.json': strToU8(JSON.stringify([movieEvent])),
      'user-stats.json': strToU8('{}')
    })

    const parsed = readTraktUpload([{ filename: 'trakt-export.zip', data: zip }])

    expect(parsed.plays.map(play => play.tmdbId).sort((first, second) => first - second)).toEqual([94664, 1228710])
  })

  it('rejects an upload with no history files', () => {
    const zip = zipSync({ 'user-stats.json': strToU8('{}') })

    expect(() => readTraktUpload([{ filename: 'trakt-export.zip', data: zip }])).toThrow(NotAnExportError)
    expect(() => readTraktUpload([{ filename: 'floppy.csv', data: strToU8('row_type,media_id') }])).toThrow(NotAnExportError)
  })
})
