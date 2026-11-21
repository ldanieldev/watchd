import { and, isNotNull, lt, notInArray } from 'drizzle-orm'
import { plexUnmarked, watches } from '../db/schema'
import { inngest } from '../utils/inngest/client'
import { logger } from '../utils/logger'
import { plexSyncMode } from '../utils/plex/config'
import { loadPlexConnection } from '../utils/plex/connection'
import { sendPlexPushInChunks } from '../utils/plex/outbound'
import { PLEX_UNMARK_RETENTION_DAYS } from '../utils/plex/scan'

const DAY_MS = 24 * 60 * 60 * 1000

const isExpiredSoftDelete = (cutoff: Date) => and(isNotNull(watches.deletedAt), lt(watches.deletedAt, cutoff))

// Plex keeps history on unmark, so a purged play whose history id is forgotten would come back on a later full pull; its entry goes first.
async function queueHistoryDeletesForExpiredPlays(cutoff: Date): Promise<{ userIds: number[], connectionIds: number[] }> {
  const expired = await withQuerySpan('select-expired-plex-history', () => db
    .select({ userId: watches.userId, plexHistoryId: watches.plexHistoryId, plexServerMachineId: watches.plexServerMachineId })
    .from(watches)
    .where(and(isExpiredSoftDelete(cutoff), isNotNull(watches.plexHistoryId))))
  const playsByUserId = Map.groupBy(expired, play => play.userId)
  const unqueued = { userIds: [] as number[], connectionIds: [] as number[] }
  for (const [userId, plays] of playsByUserId) {
    const connection = await loadPlexConnection(userId)
    if (!connection) continue
    const groups = plays.flatMap(play => play.plexServerMachineId === connection.serverMachineId && play.plexHistoryId !== null
      ? [[{ op: 'delete-history' as const, historyId: play.plexHistoryId }]]
      : [])
    try {
      if (groups.length) await sendPlexPushInChunks(connection, userId, groups)
    } catch (error) {
      unqueued.userIds.push(userId)
      unqueued.connectionIds.push(connection.id)
      logger.warn({ userId, error: error instanceof Error ? error.message : 'unknown' }, 'plex history deletes for purged plays could not be queued; purge retried tomorrow')
    }
  }
  return unqueued
}

export const plexPurgeUnmarked = inngest.createFunction(
  { id: 'plex-purge-unmarked', triggers: [{ cron: '0 4 * * *' }] },
  async ({ step }) => step.run('purge-unmarked-plays', async () => {
    if (plexSyncMode() === 'off') return { skipped: 'sync off' }
    const cutoff = new Date(Date.now() - PLEX_UNMARK_RETENTION_DAYS * DAY_MS)
    const unqueued = plexSyncMode() === 'on' ? await queueHistoryDeletesForExpiredPlays(cutoff) : { userIds: [], connectionIds: [] }
    const purgedPlays = await withQuerySpan('delete-expired-soft-deleted-watches', () => db
      .delete(watches)
      .where(and(isExpiredSoftDelete(cutoff), unqueued.userIds.length ? notInArray(watches.userId, unqueued.userIds) : undefined))
      .returning({ id: watches.id }))
    const purgedUnmarked = await withQuerySpan('delete-expired-plex-unmarked', () => db
      .delete(plexUnmarked)
      .where(and(lt(plexUnmarked.unmarkedAt, cutoff), unqueued.connectionIds.length ? notInArray(plexUnmarked.connectionId, unqueued.connectionIds) : undefined))
      .returning({ id: plexUnmarked.id }))
    const summary = { plays: purgedPlays.length, unmarked: purgedUnmarked.length }
    logger.info(summary, 'plex unmarked plays purged')
    return summary
  })
)
