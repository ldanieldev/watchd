import { NonRetriableError } from 'inngest'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { plexConnections, plexItems, watches } from '../../db/schema'
import { chunkForPostgresParameters } from '../import/writePlays'
import { inngest } from '../inngest/client'
import { logger } from '../logger'
import { PlexError } from './client'
import type { PlexServer } from './client'
import { plexSyncMode } from './config'
import { equalsOrNull } from '../library/removeWatchRows'
import type { DeletedPlexHistory } from '../library/removeWatchRows'
import { loadPlexConnection } from './connection'
import type { PlexConnectionRow } from './connection'

export const PLEX_PUSH_EVENT = 'plex/push'
export const PLEX_PUSH_CHUNK_SIZE = 500

export type PlexMediaOp = { op: 'mark' | 'unmark', titleId: number, season: number | null, number: number | null }
export type PlexPushOp = PlexMediaOp | { op: 'delete-history', historyId: number }

export interface PlexPushEventData {
  userId: number
  ops: PlexPushOp[]
}

export interface PlexOutboundStore {
  /** One entry per op, in order; empty for delete-history and for items Plex does not have. */
  ratingKeysFor(connectionId: number, ops: PlexPushOp[]): Promise<string[][]>
  setPending(connectionId: number, ratingKeys: string[], isPending: boolean): Promise<void>
  clearExpectedViewCounts(connectionId: number, ratingKeys: string[]): Promise<void>
  setExpectedViewCount(connectionId: number, ratingKey: string, viewCount: number): Promise<void>
  flagTokenInvalid(connectionId: number): Promise<void>
}

const playKeyOf = (key: Pick<PlexMediaOp, 'titleId' | 'season' | 'number'>) => `${key.titleId}-${key.season}-${key.number}`
const isMediaOp = (op: PlexPushOp): op is PlexMediaOp => op.op !== 'delete-history'

export const drizzlePlexOutboundStore: PlexOutboundStore = {
  async ratingKeysFor(connectionId, ops) {
    const titleIds = [...new Set(ops.filter(isMediaOp).map(op => op.titleId))]
    if (!titleIds.length) return ops.map(() => [])
    const items = await withQuerySpan('select-plex-outbound-items', () => db
      .select({ ratingKey: plexItems.ratingKey, kind: plexItems.kind, titleId: plexItems.titleId, season: plexItems.season, number: plexItems.number })
      .from(plexItems)
      .where(and(eq(plexItems.connectionId, connectionId), inArray(plexItems.titleId, titleIds), inArray(plexItems.kind, ['movie', 'episode']))))
    return ops.map(op => !isMediaOp(op)
      ? []
      : items
          .filter(item => item.titleId === op.titleId && (op.season === null
            ? item.kind === 'movie'
            : item.kind === 'episode' && item.season === op.season && item.number === op.number))
          .map(item => item.ratingKey))
  },

  async setPending(connectionId, ratingKeys, isPending) {
    if (!ratingKeys.length) return
    await withQuerySpan('update-plex-outbound-pending', () => db
      .update(plexItems)
      .set({ outboundPending: isPending })
      .where(and(eq(plexItems.connectionId, connectionId), inArray(plexItems.ratingKey, ratingKeys))))
  },

  async clearExpectedViewCounts(connectionId, ratingKeys) {
    if (!ratingKeys.length) return
    await withQuerySpan('clear-plex-expected-view-counts', () => db
      .update(plexItems)
      .set({ expectedViewCount: null })
      .where(and(eq(plexItems.connectionId, connectionId), inArray(plexItems.ratingKey, ratingKeys))))
  },

  async setExpectedViewCount(connectionId, ratingKey, viewCount) {
    await withQuerySpan('update-plex-expected-view-count', () => db
      .update(plexItems)
      .set({ expectedViewCount: viewCount })
      .where(and(eq(plexItems.connectionId, connectionId), eq(plexItems.ratingKey, ratingKey))))
  },

  async flagTokenInvalid(connectionId) {
    await withQuerySpan('update-plex-token-invalid', () => db
      .update(plexConnections)
      .set({ tokenInvalid: true })
      .where(eq(plexConnections.id, connectionId)))
  }
}

export async function runPlexPush({ server, store = drizzlePlexOutboundStore, connectionId, ops }: {
  server: Pick<PlexServer, 'scrobble' | 'unscrobble' | 'deleteHistory'>
  store?: PlexOutboundStore
  connectionId: number
  ops: PlexPushOp[]
}): Promise<{ pushed: number }> {
  const ratingKeysPerOp = await store.ratingKeysFor(connectionId, ops)
  const recordsExpectedState = plexSyncMode() === 'on'
  let pushed = 0
  try {
    for (const [index, op] of ops.entries()) {
      if (op.op === 'delete-history') {
        try {
          await server.deleteHistory(op.historyId)
          pushed++
        } catch (error) {
          // A retry after a partial run finds the entry already gone.
          if (!(error instanceof PlexError && error.kind === 'http' && error.status === 404)) throw error
        }
        continue
      }
      for (const ratingKey of ratingKeysPerOp[index]!) {
        if (recordsExpectedState) await store.setExpectedViewCount(connectionId, ratingKey, op.op === 'mark' ? 1 : 0)
        await (op.op === 'mark' ? server.scrobble(ratingKey) : server.unscrobble(ratingKey))
        pushed++
      }
    }
  } catch (error) {
    if (error instanceof PlexError && error.kind === 'unauthorized') {
      await store.flagTokenInvalid(connectionId)
      throw new NonRetriableError(error.message)
    }
    throw error
  }
  await store.setPending(connectionId, ratingKeysPerOp.flat(), false)
  return { pushed }
}

export async function abandonPlexPush({ store = drizzlePlexOutboundStore, connectionId, userId, ops, error }: {
  store?: PlexOutboundStore
  connectionId: number
  userId: number
  ops: PlexPushOp[]
  error: Error
}): Promise<void> {
  const ratingKeys = (await store.ratingKeysFor(connectionId, ops)).flat()
  await store.setPending(connectionId, ratingKeys, false)
  await store.clearExpectedViewCounts(connectionId, ratingKeys)
  logger.error({ userId, ops: ops.length, error: error.message }, 'plex push gave up')
}

export async function sendPlexPush(connection: Pick<PlexConnectionRow, 'id'>, userId: number, ops: PlexPushOp[]): Promise<boolean> {
  const ratingKeys = (await drizzlePlexOutboundStore.ratingKeysFor(connection.id, ops)).flat()
  if (!ratingKeys.length && !ops.some(op => op.op === 'delete-history')) return false
  await drizzlePlexOutboundStore.setPending(connection.id, ratingKeys, true)
  try {
    await inngest.send({ name: PLEX_PUSH_EVENT, data: { userId, ops } satisfies PlexPushEventData })
    return true
  } catch (error) {
    await drizzlePlexOutboundStore.setPending(connection.id, ratingKeys, false)
    throw error
  }
}

function packPushGroups(groups: PlexPushOp[][]): PlexPushOp[][] {
  const chunks: PlexPushOp[][] = []
  for (const group of groups.filter(group => group.length > 1)) {
    const last = chunks.at(-1)
    if (last && last.length + group.length <= PLEX_PUSH_CHUNK_SIZE) last.push(...group)
    else chunks.push([...group])
  }
  for (const [op] of groups.filter(group => group.length === 1)) {
    const withRoom = chunks.find(chunk => chunk.length < PLEX_PUSH_CHUNK_SIZE)
    if (withRoom) withRoom.push(op!)
    else chunks.push([op!])
  }
  return chunks
}

// A group never splits across events, so a key's history delete always travels with the follow-up that stops the scan reading it as a Plex unmark.
export async function sendPlexPushInChunks(connection: Pick<PlexConnectionRow, 'id'>, userId: number, groups: PlexPushOp[][]): Promise<void> {
  for (const chunk of packPushGroups(groups)) await sendPlexPush(connection, userId, chunk)
}

export async function queuePlexPush(userId: number, ops: PlexPushOp[]): Promise<void> {
  if (!ops.length) return
  try {
    if (plexSyncMode() === 'off') return
    const connection = await loadPlexConnection(userId)
    if (connection) await sendPlexPushInChunks(connection, userId, ops.map(op => [op]))
  } catch (error) {
    logger.warn({ userId, error: error instanceof Error ? error.message : 'unknown' }, 'could not queue plex push')
  }
}

export async function queuePlexPushAfterDelete(
  userId: number,
  deletedKeys: Pick<PlexMediaOp, 'titleId' | 'season' | 'number'>[],
  plexHistory: DeletedPlexHistory[]
): Promise<void> {
  try {
    if (plexSyncMode() === 'off') return
    const connection = await loadPlexConnection(userId)
    if (!connection) return
    const deletedHistory = plexHistory.filter(entry => entry.serverMachineId === connection.serverMachineId)
    const groupsByKey = new Map<string, PlexPushOp[]>()
    const groupOf = (key: string) => groupsByKey.get(key) ?? groupsByKey.set(key, []).get(key)!
    for (const entry of deletedHistory) groupOf(playKeyOf(entry)).push({ op: 'delete-history', historyId: entry.historyId })
    for (const op of await followUpMediaOps(userId, deletedKeys, deletedHistory)) groupOf(playKeyOf(op)).push(op)
    await sendPlexPushInChunks(connection, userId, [...groupsByKey.values()])
  } catch (error) {
    logger.warn({ userId, error: error instanceof Error ? error.message : 'unknown' }, 'could not queue plex push')
  }
}

// Plex may drop viewCount to 0 when a history entry is deleted (unprobed); re-marking a key that keeps a play makes that drop watchd's own pending change, not a Plex unmark.
async function followUpMediaOps(userId: number, deletedKeys: Pick<PlexMediaOp, 'titleId' | 'season' | 'number'>[], deletedHistory: DeletedPlexHistory[]): Promise<PlexMediaOp[]> {
  const unique = [...new Map(deletedKeys.map(key => [playKeyOf(key), key])).values()]
  const keysWithDeletedHistory = new Set(deletedHistory.map(playKeyOf))
  const remainingKeys = new Set<string>()
  for (const batch of chunkForPostgresParameters(unique)) {
    const remaining = await withQuerySpan('select-remaining-watches', () => db
      .select({ titleId: watches.titleId, season: watches.season, number: watches.number })
      .from(watches)
      .where(and(
        eq(watches.userId, userId),
        isNull(watches.deletedAt),
        or(...batch.map(key => and(eq(watches.titleId, key.titleId), equalsOrNull(watches.season, key.season), equalsOrNull(watches.number, key.number))))
      )))
    for (const row of remaining) remainingKeys.add(playKeyOf(row))
  }
  return unique.flatMap((key): PlexMediaOp[] => {
    if (!remainingKeys.has(playKeyOf(key))) return [{ op: 'unmark', titleId: key.titleId, season: key.season, number: key.number }]
    return keysWithDeletedHistory.has(playKeyOf(key)) ? [{ op: 'mark', titleId: key.titleId, season: key.season, number: key.number }] : []
  })
}
