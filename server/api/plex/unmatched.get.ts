import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { plexItems, plexUnresolvedHistory } from '~~/server/db/schema'
import { logger } from '~~/server/utils/logger'
import { PLEX_DISPLAY_READ_TIMEOUT_MS } from '~~/server/utils/plex/client'
import { loadPlexConnection, plexServerFor } from '~~/server/utils/plex/connection'

const displayName = (row: { kind: string, name: string | null, showName: string | null, ratingKey: string }) => {
  const ownName = row.name ?? `Plex item ${row.ratingKey}`
  return row.kind === 'episode' && row.showName ? `${row.showName} — ${ownName}` : ownName
}

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const connection = await loadPlexConnection(user.id)
  if (!connection) return { items: [], unresolvedHistory: 0 }

  const show = alias(plexItems, 'plex_show')
  const rows = await withQuerySpan('select-plex-unmatched', () => db
    .select({
      ratingKey: plexItems.ratingKey, kind: plexItems.kind, name: plexItems.name, showName: show.name,
      sectionId: plexItems.sectionId, reason: plexItems.unmatchedReason
    })
    .from(plexItems)
    .leftJoin(show, and(eq(show.connectionId, plexItems.connectionId), eq(show.ratingKey, plexItems.parentRatingKey)))
    .where(and(eq(plexItems.connectionId, connection.id), isNotNull(plexItems.unmatchedReason)))
    .orderBy(plexItems.name))
  const [unresolved] = await withQuerySpan('count-plex-unresolved-history', () => db
    .select({ count: sql<number>`count(*)::int` })
    .from(plexUnresolvedHistory)
    .where(eq(plexUnresolvedHistory.connectionId, connection.id)))

  const libraryTitles = new Map<string, string>()
  try {
    for (const section of await plexServerFor(connection).sections({ timeoutMs: PLEX_DISPLAY_READ_TIMEOUT_MS })) libraryTitles.set(String(section.id), section.title)
  } catch (error) {
    logger.warn({ userId: user.id, error: error instanceof Error ? error.message : 'unknown' }, 'plex unmatched could not list libraries')
  }

  return {
    items: rows.map(row => ({
      name: displayName(row),
      library: libraryTitles.get(row.sectionId) ?? `Library ${row.sectionId}`,
      reason: row.reason
    })),
    unresolvedHistory: unresolved?.count ?? 0
  }
})
