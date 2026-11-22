export const WATCHD_BACKUP_FORMAT = 'watchd-backup'
export const WATCHD_BACKUP_VERSION = 1

export type BackupTitleKind = 'movie' | 'tv'
export type BackupWatchSource = 'floppy' | 'trakt' | 'watchd' | 'plex'

export interface BackupPlay {
  kind: BackupTitleKind
  tmdbId: number
  titleName: string
  season: number | null
  number: number | null
  watchedAt: string
  minutesWatched: number | null
  source: BackupWatchSource
  plexHistoryId: number | null
  plexServerMachineId: string | null
}

export interface BackupTitleSetting {
  kind: BackupTitleKind
  tmdbId: number
  titleName: string
  typeOverride: 'tv' | 'anime' | null
  heldStatus: 'paused' | 'dropped' | null
}

export interface WatchdBackup {
  format: typeof WATCHD_BACKUP_FORMAT
  version: number
  exportedAt: string
  plays: BackupPlay[]
  titleSettings: BackupTitleSetting[]
}
