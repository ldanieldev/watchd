import { describe, expect, it } from 'vitest'
import { parseFloppyCsv } from '~~/server/utils/import/floppy'
import { NotAnExportError } from '~~/server/utils/import/types'

const header = ['row_type', 'media_id', 'source', 'media_type', 'title', 'synopsis', 'image', 'season_number', 'episode_number',
  'runtime_minutes', 'release_datetime', 'status', 'series_name', 'status', 'end_date']

type Row = Partial<Record<'row_type' | 'media_id' | 'media_type' | 'title' | 'synopsis' | 'image' | 'season_number' | 'episode_number'
  | 'runtime_minutes' | 'release_datetime' | 'series_name' | 'end_date', string>>

function quote(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function csvOf(rows: Row[]): string {
  const lines = rows.map(row => header.map((column) => {
    if (column === 'source') return 'tmdb'
    if (column === 'status') return ''
    return quote(row[column as keyof Row] ?? '')
  }).join(','))
  return [header.join(','), ...lines].join('\n')
}

const show: Row = { row_type: 'media', media_id: '10283', media_type: 'tv', title: 'Archer', release_datetime: '2009-09-17 05:00:00+00:00' }

describe('parseFloppyCsv', () => {
  it('reads an episode play keyed by the show id, named after its show', () => {
    const parsed = parseFloppyCsv(csvOf([show, {
      row_type: 'media', media_id: '10283', media_type: 'episode', title: 'Mole Hunt', season_number: '1', episode_number: '1',
      runtime_minutes: '22', end_date: '2026-11-17 01:45:24+00:00'
    }]))

    expect(parsed.skipped).toEqual([])
    expect(parsed.plays).toEqual([{
      kind: 'tv', tmdbId: 10283, season: 1, number: 1, watchedAt: new Date('2026-11-17T01:45:24Z'),
      titleName: 'Archer', firstAired: '2009-09-17'
    }])
  })

  it('reads a movie play with its poster path and runtime', () => {
    const parsed = parseFloppyCsv(csvOf([{
      row_type: 'media', media_id: '603', media_type: 'movie', title: 'The Matrix', image: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      runtime_minutes: '136', release_datetime: '1999-03-30 05:00:00+00:00', end_date: '2020-01-02 03:04:00+00:00'
    }]))

    expect(parsed.plays).toEqual([{
      kind: 'movie', tmdbId: 603, watchedAt: new Date('2020-01-02T03:04:00Z'), titleName: 'The Matrix',
      posterPath: '/abc.jpg', firstAired: '1999-03-30', runtimeMinutes: 136
    }])
  })

  it('ignores aggregate, collection and list rows without reporting them', () => {
    const parsed = parseFloppyCsv(csvOf([
      show,
      { row_type: 'media', media_id: '10283', media_type: 'season', title: 'Season 1', season_number: '1', end_date: '2016-06-01 21:01:00+00:00' },
      { row_type: 'collection', media_id: '603', media_type: 'movie', title: 'The Matrix' },
      { row_type: 'list' },
      { row_type: 'list_item', media_id: '603', media_type: 'movie', title: 'The Matrix' }
    ]))

    expect(parsed).toEqual({ plays: [], skipped: [] })
  })

  it('skips a play with no watch date, naming its spreadsheet row', () => {
    const parsed = parseFloppyCsv(csvOf([show, { row_type: 'media', media_id: '603', media_type: 'movie', title: 'The Matrix' }]))

    expect(parsed.skipped).toEqual([{ line: 3, title: 'The Matrix', reason: 'no watch date' }])
  })

  it('keeps a quoted synopsis with a comma and a newline inside one row', () => {
    const parsed = parseFloppyCsv(csvOf([
      { row_type: 'media', media_id: '603', media_type: 'movie', title: 'The Matrix', synopsis: 'Neo, a hacker,\nwakes up.', end_date: '2020-01-02 03:04:00+00:00' }
    ]))

    expect(parsed.plays).toHaveLength(1)
    expect(parsed.skipped).toEqual([])
  })

  it('rejects a file without Floppy columns', () => {
    expect(() => parseFloppyCsv('[{"watched_at":"2026-07-19T18:06:00.000Z"}]')).toThrow(NotAnExportError)
    expect(() => parseFloppyCsv('title,year\nThe Matrix,1999')).toThrow(NotAnExportError)
  })
})
