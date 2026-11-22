import { z } from 'zod'
import { WATCHD_BACKUP_FORMAT, WATCHD_BACKUP_VERSION } from '../../../shared/types/backup'
import { POSTGRES_INTEGER_MAX, POSTGRES_INTEGER_MIN } from '../../../shared/utils/postgresLimits'
import type { SkippedRow } from '../../../shared/types/library'
import { NotAnExportError, UnsupportedBackupVersionError, type ImportedPlay, type ImportedTitleSetting, type ParsedImport } from './types'

const POSTGRES_SMALLINT_MAX = 32767

const titleKindSchema = z.enum(['movie', 'tv'])
const tmdbIdSchema = z.number().int().positive().max(POSTGRES_INTEGER_MAX)
const titleNameSchema = z.string().max(500)
const smallintSchema = z.number().int().min(0).max(POSTGRES_SMALLINT_MAX)

const backupPlaySchema = z.object({
  kind: titleKindSchema,
  tmdbId: tmdbIdSchema,
  titleName: titleNameSchema,
  season: smallintSchema.nullish(),
  number: smallintSchema.nullish(),
  watchedAt: z.string(),
  minutesWatched: smallintSchema.nullish(),
  source: z.enum(['floppy', 'trakt', 'watchd', 'plex']),
  plexHistoryId: z.number().int().min(POSTGRES_INTEGER_MIN).max(POSTGRES_INTEGER_MAX).nullish(),
  plexServerMachineId: z.string().max(64).nullish()
}).loose()

const backupTitleSettingSchema = z.object({
  kind: titleKindSchema,
  tmdbId: tmdbIdSchema,
  titleName: titleNameSchema,
  typeOverride: z.enum(['tv', 'anime']).nullable(),
  heldStatus: z.enum(['paused', 'dropped']).nullable()
}).loose()

const backupHeaderSchema = z.object({
  format: z.literal(WATCHD_BACKUP_FORMAT),
  version: z.number().int().positive()
}).loose()

const backupBodySchema = z.object({
  plays: z.array(z.unknown()),
  titleSettings: z.array(z.unknown())
}).loose()

function readEnvelope(text: string) {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new NotAnExportError('not a JSON file')
  }
  const header = backupHeaderSchema.safeParse(document)
  if (!header.success) throw new NotAnExportError('not a watchd backup document')
  if (header.data.version > WATCHD_BACKUP_VERSION) {
    throw new UnsupportedBackupVersionError(`backup version ${header.data.version} is newer than ${WATCHD_BACKUP_VERSION}`)
  }
  const body = backupBodySchema.safeParse(document)
  if (!body.success) throw new NotAnExportError('backup has no plays or titleSettings list')
  return body.data
}

const titleNameOf = (raw: unknown) => {
  const titleName = (raw as { titleName?: unknown } | null)?.titleName
  return typeof titleName === 'string' ? titleName : ''
}

const invalidFieldsOf = (error: z.ZodError) => [...new Set(error.issues.map(issue => issue.path.join('.') || 'row'))].join(', ')

export function parseWatchdBackup(text: string): ParsedImport {
  const envelope = readEnvelope(text)

  const plays: ImportedPlay[] = []
  const skipped: SkippedRow[] = []
  envelope.plays.forEach((raw, position) => {
    const line = position + 1
    const play = backupPlaySchema.safeParse(raw)
    if (!play.success) return skipped.push({ line, title: titleNameOf(raw), reason: `invalid ${invalidFieldsOf(play.error)}` })
    const { kind, tmdbId, titleName, season, number, watchedAt: watchedAtText, minutesWatched, source, plexHistoryId, plexServerMachineId } = play.data
    const watchedAt = new Date(watchedAtText)
    if (Number.isNaN(watchedAt.getTime())) return skipped.push({ line, title: titleName, reason: `unreadable watch date "${watchedAtText}"` })
    const restoredPlay: ImportedPlay = { kind, tmdbId, titleName, watchedAt, source }
    if (season != null) restoredPlay.season = season
    if (number != null) restoredPlay.number = number
    if (minutesWatched != null) restoredPlay.minutesWatched = minutesWatched
    if (plexHistoryId != null) restoredPlay.plexHistoryId = plexHistoryId
    if (plexServerMachineId != null) restoredPlay.plexServerMachineId = plexServerMachineId
    plays.push(restoredPlay)
  })

  const titleSettings: ImportedTitleSetting[] = []
  envelope.titleSettings.forEach((raw, position) => {
    const setting = backupTitleSettingSchema.safeParse(raw)
    if (!setting.success) {
      return skipped.push({ line: envelope.plays.length + position + 1, title: titleNameOf(raw), reason: `invalid title setting ${invalidFieldsOf(setting.error)}` })
    }
    const { kind, tmdbId, titleName, typeOverride, heldStatus } = setting.data
    titleSettings.push({ kind, tmdbId, titleName, typeOverride, heldStatus })
  })

  return { plays, skipped, titleSettings }
}
