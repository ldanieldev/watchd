import { describe, expect, it } from 'vitest'
import { parseWatchdBackup } from '~~/server/utils/import/watchdBackup'
import { NotAnExportError, UnsupportedBackupVersionError } from '~~/server/utils/import/types'
import type { BackupPlay, BackupTitleSetting, WatchdBackup } from '~~/shared/types/backup'

const episodePlay: BackupPlay = {
  kind: 'tv', tmdbId: 10283, titleName: 'Archer', season: 1, number: 1, watchedAt: '2026-11-17T01:45:24.000Z',
  minutesWatched: 22, source: 'plex', plexHistoryId: 4512, plexServerMachineId: 'machine-abc'
}
const moviePlay: BackupPlay = {
  kind: 'movie', tmdbId: 603, titleName: 'The Matrix', season: null, number: null, watchedAt: '2020-01-02T03:04:00.000Z',
  minutesWatched: null, source: 'floppy', plexHistoryId: null, plexServerMachineId: null
}

const backupOf = (overrides: Partial<WatchdBackup> = {}): WatchdBackup => ({
  format: 'watchd-backup',
  version: 1,
  exportedAt: '2026-11-21T09:00:00.000Z',
  plays: [episodePlay, moviePlay],
  titleSettings: [
    { kind: 'tv', tmdbId: 10283, titleName: 'Archer', typeOverride: 'anime', heldStatus: null },
    { kind: 'movie', tmdbId: 550, titleName: 'Fight Club', typeOverride: null, heldStatus: 'dropped' }
  ],
  ...overrides
})

describe('parseWatchdBackup', () => {
  it('round-trips every play field and title setting of a backup', () => {
    const backup = backupOf()

    const parsed = parseWatchdBackup(JSON.stringify(backup))

    expect(parsed.skipped).toEqual([])
    expect(parsed.plays).toEqual([
      {
        kind: 'tv', tmdbId: 10283, titleName: 'Archer', season: 1, number: 1, watchedAt: new Date(episodePlay.watchedAt),
        minutesWatched: 22, source: 'plex', plexHistoryId: 4512, plexServerMachineId: 'machine-abc'
      },
      { kind: 'movie', tmdbId: 603, titleName: 'The Matrix', watchedAt: new Date(moviePlay.watchedAt), source: 'floppy' }
    ])
    expect(parsed.titleSettings).toEqual(backup.titleSettings)
  })

  it('keeps plays and title settings whose title name is empty', () => {
    const backup = backupOf({
      plays: [{ ...moviePlay, titleName: '' }],
      titleSettings: [{ kind: 'movie', tmdbId: 603, titleName: '', typeOverride: null, heldStatus: 'paused' }]
    })

    const parsed = parseWatchdBackup(JSON.stringify(backup))

    expect(parsed.skipped).toEqual([])
    expect(parsed.plays).toEqual([expect.objectContaining({ tmdbId: 603, titleName: '' })])
    expect(parsed.titleSettings).toEqual(backup.titleSettings)
  })

  it('rejects a Floppy CSV and a JSON object that is not a backup as not an export', () => {
    const floppyCsv = 'row_type,media_id,media_type,title,end_date\nmedia,603,movie,The Matrix,2020-01-02 03:04:00+00:00\n'

    expect(() => parseWatchdBackup(floppyCsv)).toThrow(NotAnExportError)
    expect(() => parseWatchdBackup('{"foo":1}')).toThrow(NotAnExportError)
    expect(() => parseWatchdBackup('[]')).toThrow(NotAnExportError)
    expect(() => parseWatchdBackup('null')).toThrow(NotAnExportError)
  })

  it('rejects a backup from a newer version', () => {
    expect(() => parseWatchdBackup(JSON.stringify(backupOf({ version: 2 })))).toThrow(UnsupportedBackupVersionError)
  })

  it('rejects a newer-version backup by its version even when its arrays are reshaped', () => {
    expect(() => parseWatchdBackup(JSON.stringify({ format: 'watchd-backup', version: 2 }))).toThrow(UnsupportedBackupVersionError)
  })

  it('skips malformed plays by their 1-based position and keeps the rest', () => {
    const plays = [
      { ...moviePlay, titleName: 'Unknown source', source: 'netflix' },
      moviePlay,
      { ...moviePlay, titleName: 'Bad date', watchedAt: 'yesterday' },
      { ...moviePlay, titleName: 'Zero id', tmdbId: 0 },
      { ...moviePlay, titleName: 'Wrong kind', kind: 'episode' }
    ] as BackupPlay[]

    const parsed = parseWatchdBackup(JSON.stringify(backupOf({ plays })))

    expect(parsed.plays).toEqual([expect.objectContaining({ tmdbId: 603, titleName: 'The Matrix' })])
    expect(parsed.skipped.map(row => ({ line: row.line, title: row.title }))).toEqual([
      { line: 1, title: 'Unknown source' },
      { line: 3, title: 'Bad date' },
      { line: 4, title: 'Zero id' },
      { line: 5, title: 'Wrong kind' }
    ])
  })

  it('numbers skipped title settings after every play so lines never collide with plays', () => {
    const plays = [{ ...moviePlay, titleName: 'Unknown source', source: 'netflix' }, moviePlay, moviePlay] as BackupPlay[]
    const titleSettings = [
      { kind: 'movie', tmdbId: 603, titleName: 'Bad override', typeOverride: 'movie', heldStatus: null },
      { kind: 'movie', tmdbId: 604, titleName: 'Fine', typeOverride: null, heldStatus: 'paused' },
      { kind: 'movie', tmdbId: 0, titleName: 'Zero id', typeOverride: null, heldStatus: null }
    ] as unknown as BackupTitleSetting[]

    const parsed = parseWatchdBackup(JSON.stringify(backupOf({ plays, titleSettings })))

    expect(parsed.skipped.map(row => ({ line: row.line, title: row.title }))).toEqual([
      { line: 1, title: 'Unknown source' },
      { line: 4, title: 'Bad override' },
      { line: 6, title: 'Zero id' }
    ])
  })

  it('skips a plexHistoryId below the Postgres integer range', () => {
    const plays = [{ ...moviePlay, plexHistoryId: -2147483649 }, { ...moviePlay, plexHistoryId: -2147483648 }] as BackupPlay[]

    const parsed = parseWatchdBackup(JSON.stringify(backupOf({ plays })))

    expect(parsed.plays).toHaveLength(1)
    expect(parsed.skipped).toEqual([expect.objectContaining({ line: 1, reason: 'invalid plexHistoryId' })])
  })
})
