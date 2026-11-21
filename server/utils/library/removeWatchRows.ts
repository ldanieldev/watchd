import { and, eq, isNull, or } from 'drizzle-orm'
import { watches } from '~~/server/db/schema'
import type { WatchKey } from './watchBody'

export type DeletedPlexHistory = Pick<WatchKey, 'titleId' | 'season' | 'number'> & { historyId: number, serverMachineId: string | null }

type WatchIdentity = Pick<WatchKey, 'titleId' | 'season' | 'number' | 'watchedMinute'>

export const equalsOrNull = (column: typeof watches.season | typeof watches.number, value: number | null) => (value === null ? isNull(column) : eq(column, value))

export async function removeWatchRows(userId: number, keys: WatchIdentity[]): Promise<{ removed: number, deletedKeys: Pick<WatchKey, 'titleId' | 'season' | 'number'>[], plexHistory: DeletedPlexHistory[] }> {
  const rows = await withQuerySpan('delete-watches', () => db
    .delete(watches)
    .where(and(
      eq(watches.userId, userId),
      isNull(watches.deletedAt),
      or(...keys.map(key => and(
        eq(watches.titleId, key.titleId),
        equalsOrNull(watches.season, key.season),
        equalsOrNull(watches.number, key.number),
        eq(watches.watchedMinute, key.watchedMinute)
      )))
    ))
    .returning({ id: watches.id, titleId: watches.titleId, season: watches.season, number: watches.number, plexHistoryId: watches.plexHistoryId, plexServerMachineId: watches.plexServerMachineId }))
  const plexHistory = rows.flatMap(row => row.plexHistoryId === null ? [] : [{ historyId: row.plexHistoryId, serverMachineId: row.plexServerMachineId, titleId: row.titleId, season: row.season, number: row.number }])
  const deletedKeys = [...new Map(rows.map(row => [`${row.titleId}-${row.season}-${row.number}`, { titleId: row.titleId, season: row.season, number: row.number }])).values()]
  return { removed: rows.length, deletedKeys, plexHistory }
}
