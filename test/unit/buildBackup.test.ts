import { beforeEach, describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { WATCHD_BACKUP_FORMAT, WATCHD_BACKUP_VERSION } from '~~/shared/types/backup'
import { createServerHandlerHarness } from './serverHandlerHarness'

const harness = createServerHandlerHarness()
const { buildBackup, backupFilename } = await import('~~/server/utils/backup/buildBackup')

const playRow = {
  kind: 'tv' as const,
  tmdbId: 1399,
  titleName: 'Game of Thrones',
  season: 1,
  number: 1,
  watchedAt: new Date('2026-01-01T10:00:00Z'),
  minutesWatched: 52,
  source: 'floppy' as const,
  plexHistoryId: null,
  plexServerMachineId: null
}

const now = new Date('2026-11-21T12:00:00Z')

beforeEach(() => harness.reset())

describe('buildBackup', () => {
  it('maps live watches joined to titles into plays with ISO watchedAt', async () => {
    harness.givenDb({ select: [[playRow], []] })

    const backup = await buildBackup(7, now)

    expect(backup.format).toBe(WATCHD_BACKUP_FORMAT)
    expect(backup.version).toBe(WATCHD_BACKUP_VERSION)
    expect(backup.exportedAt).toBe(now.toISOString())
    expect(backup.plays[0]).toEqual({ ...playRow, watchedAt: '2026-01-01T10:00:00.000Z' })
  })

  it('filters out soft-deleted watches', async () => {
    harness.givenDb({ select: [[], []] })

    await buildBackup(7, now)

    const rendered = new PgDialect().sqlToQuery(harness.mocks.selectWhere.mock.calls[0]![0] as SQL)
    expect(rendered.sql).toContain('"deleted_at" is null')
    expect(rendered.sql).toContain('"user_id" = $1')
    expect(rendered.params).toEqual([7])
  })

  it('includes title settings for titles without plays', async () => {
    const setting = { kind: 'movie' as const, tmdbId: 603, titleName: 'The Matrix', typeOverride: null, heldStatus: 'paused' as const }
    harness.givenDb({ select: [[], [setting]] })

    const backup = await buildBackup(7, now)

    expect(backup.plays).toEqual([])
    expect(backup.titleSettings).toEqual([setting])
  })
})

describe('backupFilename', () => {
  it('uses the UTC date', () => {
    expect(backupFilename(new Date('2026-11-21T23:30:00-06:00'))).toBe('watchd-backup-2026-11-22.json')
  })
})
