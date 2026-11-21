import { parse } from 'csv-parse/sync'
import { NotAnExportError, type ImportedPlay, type ParsedImport, type SkippedRow } from './types'

const REQUIRED_COLUMNS = ['row_type', 'media_id', 'media_type', 'title', 'end_date'] as const
const OPTIONAL_COLUMNS = ['image', 'season_number', 'episode_number', 'runtime_minutes', 'release_datetime', 'series_name'] as const
type Column = typeof REQUIRED_COLUMNS[number] | typeof OPTIONAL_COLUMNS[number]

const TMDB_IMAGE_PREFIX = /^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+/

interface TitleRow {
  name: string
  posterPath?: string
  firstAired?: string
}

function readRecords(text: string): string[][] {
  try {
    return parse(text, { relax_column_count: true, bom: true }) as string[][]
  } catch {
    throw new NotAnExportError('not a CSV file')
  }
}

function columnIndexes(header: string[]): Record<Column, number> {
  const missing = REQUIRED_COLUMNS.filter(column => !header.includes(column))
  if (missing.length) throw new NotAnExportError(`missing columns: ${missing.join(', ')}`)
  const indexes = {} as Record<Column, number>
  for (const column of [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]) indexes[column] = header.indexOf(column)
  return indexes
}

function optionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseFloppyCsv(text: string): ParsedImport {
  const [header, ...records] = readRecords(text)
  if (!header) throw new NotAnExportError('empty file')
  const index = columnIndexes(header)
  const cell = (record: string[], column: Column) => (index[column] === -1 ? '' : record[index[column]] ?? '')

  const titleRows = new Map<string, TitleRow>()
  for (const record of records) {
    const mediaType = cell(record, 'media_type')
    if (cell(record, 'row_type') !== 'media' || (mediaType !== 'tv' && mediaType !== 'movie')) continue
    titleRows.set(`${mediaType}-${cell(record, 'media_id')}`, {
      name: cell(record, 'title'),
      posterPath: cell(record, 'image').replace(TMDB_IMAGE_PREFIX, '') || undefined,
      firstAired: cell(record, 'release_datetime').slice(0, 10) || undefined
    })
  }

  const plays: ImportedPlay[] = []
  const skipped: SkippedRow[] = []
  records.forEach((record, position) => {
    const mediaType = cell(record, 'media_type')
    if (cell(record, 'row_type') !== 'media' || (mediaType !== 'episode' && mediaType !== 'movie')) return
    const line = position + 2
    const title = cell(record, 'title')
    const tmdbId = optionalNumber(cell(record, 'media_id'))
    if (tmdbId === undefined) return skipped.push({ line, title, reason: 'no TMDB id' })
    const endDate = cell(record, 'end_date')
    if (!endDate) return skipped.push({ line, title, reason: 'no watch date' })
    const watchedAt = new Date(endDate)
    if (Number.isNaN(watchedAt.getTime())) return skipped.push({ line, title, reason: `unreadable watch date "${endDate}"` })

    if (mediaType === 'movie') {
      const movie = titleRows.get(`movie-${tmdbId}`)
      plays.push(withoutUndefined({
        kind: 'movie', tmdbId, watchedAt, titleName: title,
        posterPath: movie?.posterPath, firstAired: movie?.firstAired, runtimeMinutes: optionalNumber(cell(record, 'runtime_minutes'))
      }))
      return
    }

    const season = optionalNumber(cell(record, 'season_number'))
    const number = optionalNumber(cell(record, 'episode_number'))
    if (season === undefined || number === undefined) return skipped.push({ line, title, reason: 'no season or episode number' })
    const show = titleRows.get(`tv-${tmdbId}`)
    plays.push(withoutUndefined({
      kind: 'tv', tmdbId, season, number, watchedAt,
      titleName: cell(record, 'series_name') || show?.name || title,
      posterPath: show?.posterPath, firstAired: show?.firstAired
    }))
  })

  return { plays, skipped }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}
