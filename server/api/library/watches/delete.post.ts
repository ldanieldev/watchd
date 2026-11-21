import { and, eq, isNull, or } from 'drizzle-orm'
import { watches } from '~~/server/db/schema'
import { readWatchKeys } from '~~/server/utils/library/watchBody'

const equalsOrNull = (column: typeof watches.season | typeof watches.number, value: number | null) => (value === null ? isNull(column) : eq(column, value))

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const keys = await readWatchKeys(event)

  const removed = await withQuerySpan('delete-watches', () => db
    .delete(watches)
    .where(and(
      eq(watches.userId, user.id),
      or(...keys.map(key => and(
        eq(watches.titleId, key.titleId),
        equalsOrNull(watches.season, key.season),
        equalsOrNull(watches.number, key.number),
        eq(watches.watchedMinute, key.watchedMinute)
      )))
    ))
    .returning({ id: watches.id }))
  return { removed: removed.length }
})
