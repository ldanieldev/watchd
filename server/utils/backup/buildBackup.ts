import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { titles, userTitles, watches } from '../../db/schema'
import { WATCHD_BACKUP_FORMAT, WATCHD_BACKUP_VERSION, type WatchdBackup } from '../../../shared/types/backup'

const liveWatchesOf = (userId: number) => and(eq(watches.userId, userId), isNull(watches.deletedAt))

export async function buildBackup(userId: number, now: Date): Promise<WatchdBackup> {
  const playRows = await withQuerySpan('select-backup-plays', () => db
    .select({
      kind: titles.kind,
      tmdbId: titles.tmdbId,
      titleName: titles.name,
      season: watches.season,
      number: watches.number,
      watchedAt: watches.watchedAt,
      minutesWatched: watches.minutesWatched,
      source: watches.source,
      plexHistoryId: watches.plexHistoryId,
      plexServerMachineId: watches.plexServerMachineId
    })
    .from(watches)
    .innerJoin(titles, eq(titles.id, watches.titleId))
    .where(liveWatchesOf(userId))
    .orderBy(asc(watches.watchedAt), asc(watches.id)))

  const titleSettings = await withQuerySpan('select-backup-settings', () => db
    .select({
      kind: titles.kind,
      tmdbId: titles.tmdbId,
      titleName: titles.name,
      typeOverride: userTitles.typeOverride,
      heldStatus: userTitles.heldStatus
    })
    .from(userTitles)
    .innerJoin(titles, eq(titles.id, userTitles.titleId))
    .where(eq(userTitles.userId, userId))
    .orderBy(asc(userTitles.id)))

  return {
    format: WATCHD_BACKUP_FORMAT,
    version: WATCHD_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    plays: playRows.map(row => ({ ...row, watchedAt: row.watchedAt.toISOString() })),
    titleSettings
  }
}

export const backupFilename = (now: Date) => `watchd-backup-${now.toISOString().slice(0, 10)}.json`

export async function backupCounts(userId: number): Promise<{ plays: number, titleSettings: number }> {
  const [[playTotal], [settingTotal]] = await Promise.all([
    withQuerySpan('count-backup-plays', () => db.select({ total: count() }).from(watches).where(liveWatchesOf(userId))),
    withQuerySpan('count-backup-settings', () => db.select({ total: count() }).from(userTitles).where(eq(userTitles.userId, userId)))
  ])
  return { plays: playTotal?.total ?? 0, titleSettings: settingTotal?.total ?? 0 }
}
