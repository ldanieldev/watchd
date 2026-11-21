import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { plexConnections, plexItems, watches } from '~~/server/db/schema'

export function inUserLibrary(titleIdColumn: AnyPgColumn, userId: number) {
  const watchedTitleIds = db.selectDistinct({ titleId: watches.titleId }).from(watches).where(and(eq(watches.userId, userId), isNull(watches.deletedAt)))
  const plexTitleIds = db.selectDistinct({ titleId: plexItems.titleId }).from(plexItems)
    .innerJoin(plexConnections, eq(plexConnections.id, plexItems.connectionId))
    .where(and(eq(plexConnections.userId, userId), isNotNull(plexItems.titleId)))
  return or(inArray(titleIdColumn, watchedTitleIds), inArray(titleIdColumn, plexTitleIds))
}
