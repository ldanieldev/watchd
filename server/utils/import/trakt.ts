import { strFromU8, unzipSync } from 'fflate'
import { z } from 'zod'
import { NotAnExportError, type ImportedPlay, type ParsedImport, type SkippedRow } from './types'

export interface UploadedFile {
  filename: string
  data: Uint8Array
}

const HISTORY_FILE = /(^|\/)watched-history-\d+\.json$/

const idsSchema = z.object({ tmdb: z.number().optional() }).loose()
const eventSchema = z.object({
  watched_at: z.string(),
  type: z.enum(['episode', 'movie']),
  episode: z.object({ season: z.number(), number: z.number() }).loose().optional(),
  show: z.object({ title: z.string(), ids: idsSchema }).loose().optional(),
  movie: z.object({ title: z.string(), ids: idsSchema }).loose().optional()
}).loose()

function historyFiles(files: UploadedFile[]): UploadedFile[] {
  return files.flatMap((file) => {
    if (!file.filename.toLowerCase().endsWith('.zip')) return [file]
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(file.data)
    } catch {
      throw new NotAnExportError(`${file.filename} is not a readable zip`)
    }
    return Object.entries(entries).map(([filename, data]) => ({ filename, data }))
  }).filter(file => HISTORY_FILE.test(file.filename))
}

function readEvents(file: UploadedFile): unknown[] {
  try {
    const parsed: unknown = JSON.parse(strFromU8(file.data))
    if (Array.isArray(parsed)) return parsed
  } catch {
    // Falls through to the same rejection as a non-array file.
  }
  throw new NotAnExportError(`${file.filename} is not a Trakt history file`)
}

export function readTraktUpload(files: UploadedFile[]): ParsedImport {
  const history = historyFiles(files)
  if (!history.length) throw new NotAnExportError('no watched-history files found')

  const plays: ImportedPlay[] = []
  const skipped: SkippedRow[] = []
  for (const file of history) {
    readEvents(file).forEach((raw, position) => {
      const line = position + 1
      const event = eventSchema.safeParse(raw)
      if (!event.success) return skipped.push({ line, title: file.filename, reason: 'unrecognised history entry' })
      const { type, watched_at: watchedAtText, episode, show, movie } = event.data
      const owner = type === 'movie' ? movie : show
      const title = owner?.title ?? file.filename
      const tmdbId = owner?.ids.tmdb
      if (tmdbId === undefined) return skipped.push({ line, title, reason: 'no TMDB id' })
      const watchedAt = new Date(watchedAtText)
      if (Number.isNaN(watchedAt.getTime())) return skipped.push({ line, title, reason: `unreadable watch date "${watchedAtText}"` })
      if (type === 'movie') return plays.push({ kind: 'movie', tmdbId, watchedAt, titleName: title })
      if (!episode) return skipped.push({ line, title, reason: 'no season or episode number' })
      plays.push({ kind: 'tv', tmdbId, season: episode.season, number: episode.number, watchedAt, titleName: title })
    })
  }
  return { plays, skipped }
}
