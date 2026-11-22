import type { SkippedRow } from '../../../shared/types/library'
import type { TitleKind, WatchSource } from '../../db/schema/library'

export interface ImportedPlay {
  kind: TitleKind
  tmdbId: number
  season?: number
  number?: number
  watchedAt: Date
  titleName: string
  posterPath?: string
  firstAired?: string
  runtimeMinutes?: number
  source?: WatchSource
  minutesWatched?: number
  plexHistoryId?: number
  plexServerMachineId?: string
}

export interface ImportedTitleSetting {
  kind: TitleKind
  tmdbId: number
  titleName: string
  typeOverride: 'tv' | 'anime' | null
  heldStatus: 'paused' | 'dropped' | null
}

export interface ParsedImport {
  plays: ImportedPlay[]
  skipped: SkippedRow[]
  titleSettings?: ImportedTitleSetting[]
}

export class NotAnExportError extends Error {}

export class UnsupportedBackupVersionError extends Error {}
