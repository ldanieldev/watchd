import { and, eq, isNull } from 'drizzle-orm'
import { plexConnections, plexItems, users, watches } from '../../db/schema'
import { inngest } from '../inngest/client'
import { logger } from '../logger'

export const SEARCH_LIBRARY_CHANGED_EVENT = 'search/library.changed'

export async function queueSearchReindex(userIds: number[]): Promise<void> {
  const distinctUserIds = [...new Set(userIds)]
  if (!distinctUserIds.length) return
  try {
    await inngest.send(distinctUserIds.map(userId => ({ name: SEARCH_LIBRARY_CHANGED_EVENT, data: { userId } })))
  } catch (error) {
    logger.warn({ err: error, userIds: distinctUserIds }, 'failed to queue search reindex; the nightly rebuild will catch up')
  }
}

export async function queueSearchReindexForTitle(titleId: number): Promise<void> {
  try {
    const [watchers, plexOwners] = await Promise.all([
      withQuerySpan('select-title-watchers', () => db.select({ userId: watches.userId }).from(watches)
        .where(and(eq(watches.titleId, titleId), isNull(watches.deletedAt)))),
      withQuerySpan('select-title-plex-owners', () => db.select({ userId: plexConnections.userId }).from(plexItems)
        .innerJoin(plexConnections, eq(plexConnections.id, plexItems.connectionId))
        .where(eq(plexItems.titleId, titleId)))
    ])
    await queueSearchReindex([...watchers, ...plexOwners].map(row => row.userId))
  } catch (error) {
    logger.warn({ err: error, titleId }, 'failed to queue search reindex for a title; the nightly rebuild will catch up')
  }
}

export async function queueSearchReindexForAllUsers(): Promise<number> {
  const rows = await withQuerySpan('select-all-user-ids', () => db.select({ id: users.id }).from(users))
  await queueSearchReindex(rows.map(row => row.id))
  return rows.length
}
