import { and, eq, exists, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { plexConnections, plexItems, plexUnmarked, watches } from '../../db/schema'
import { chunkForPostgresParameters } from '../import/writePlays'
import { equalsOrNull } from '../library/removeWatchRows'
import { watchedMinuteOf } from '../library/watchedMinute'
import { logger } from '../logger'
import { PlexError } from './client'
import type { PlexServer } from './client'
import type { PlexConnectionRow } from './connection'
import { dedupeInbound, drizzleInboundStore, playKey, pullHistory } from './inbound'
import type { InboundPlay, InboundStore } from './inbound'
import { drizzleItemMapStore, rebuildItemMap } from './itemMap'
import type { ItemMapStore, PlexItemMapping, PlexWatchedState } from './itemMap'
import { drizzlePlexOutboundStore } from './outbound'
import { expectationsToClear, watchedTransitions } from './transitions'
import type { WatchedStateRow } from './transitions'

export type PlexScanItemState = PlexItemMapping & { expectedViewCount: number | null, outboundPending: boolean }
export const PLEX_UNMARK_RETENTION_DAYS = 30
// Look back past lastScanAt to catch a listener play committed after that scan's lookup; safe because an unmark soft-deletes all earlier live plays.
const LISTENER_PLAY_LOOKBACK_MS = 5 * 60 * 1000

export type PlayKey = Pick<InboundPlay, 'titleId' | 'season' | 'number'>
export type UnmarkedItem = PlayKey & { ratingKey: string }

export interface PlexScanStore {
  itemStates(connectionId: number): Promise<PlexScanItemState[]>
  /** Play keys (see `playKey`) among `keys` that have soft-deleted plays. */
  softDeletedKeys(userId: number, keys: PlayKey[]): Promise<Set<string>>
  /** Play keys among `keys` with a live Plex play from this server watched after `since`: history the listener imported between polls. */
  keysWithPlexPlaysSince(userId: number, serverMachineId: string, keys: PlayKey[], since: Date): Promise<Set<string>>
  /** Soft-deletes the user's live plays of the item and records it as unmarked; returns the number of plays. */
  softDeletePlays(userId: number, connectionId: number, item: UnmarkedItem, at: Date): Promise<number>
  /** Brings back the item's soft-deleted plays and drops its unmarked row; returns the number of plays. */
  restorePlays(userId: number, connectionId: number, item: UnmarkedItem): Promise<number>
  existingPlays(userId: number, titleIds: number[]): Promise<InboundPlay[]>
  insertMarkedPlays(userId: number, plays: InboundPlay[]): Promise<number>
  saveWatchedStates(connectionId: number, states: PlexWatchedState[]): Promise<void>
  /** Clears only expectations still holding the value read, so one set by a newer push survives. */
  clearExpectedViewCounts(connectionId: number, expectations: { ratingKey: string, expectedViewCount: number }[]): Promise<void>
  finishScan(connectionId: number, scannedAt: Date): Promise<void>
  flagTokenInvalid(connectionId: number): Promise<void>
}

export interface PlexScanSummary {
  pulled: { added: number, duplicates: number, unresolved: number }
  softDeletedPlays: number
  restoredPlays: number
  createdPlays: number
  skippedPending: number
  errors: number
}

type ScanConnection = Pick<PlexConnectionRow, 'id' | 'userId' | 'ownerAccountId' | 'serverMachineId' | 'sectionIds' | 'historyCursor' | 'lastPlayAt' | 'lastScanAt'>

const matchesPlayKey = (userId: number, key: PlayKey) => and(
  eq(watches.userId, userId),
  eq(watches.titleId, key.titleId),
  equalsOrNull(watches.season, key.season),
  equalsOrNull(watches.number, key.number)
)

export const drizzlePlexScanStore: PlexScanStore = {
  itemStates(connectionId) {
    return withQuerySpan('select-plex-scan-items', () => db
      .select({
        ratingKey: plexItems.ratingKey, kind: plexItems.kind, sectionId: plexItems.sectionId, parentRatingKey: plexItems.parentRatingKey,
        titleId: plexItems.titleId, season: plexItems.season, number: plexItems.number, unmatchedReason: plexItems.unmatchedReason,
        viewCount: plexItems.viewCount, lastViewedAt: plexItems.lastViewedAt, expectedViewCount: plexItems.expectedViewCount, outboundPending: plexItems.outboundPending
      })
      .from(plexItems)
      .where(eq(plexItems.connectionId, connectionId)))
  },

  async softDeletedKeys(userId, keys) {
    const wanted = new Set(keys.map(playKey))
    const found = new Set<string>()
    for (const batch of chunkForPostgresParameters([...new Set(keys.map(key => key.titleId))])) {
      const rows = await withQuerySpan('select-plex-soft-deleted', () => db
        .selectDistinct({ titleId: watches.titleId, season: watches.season, number: watches.number })
        .from(watches)
        .where(and(eq(watches.userId, userId), isNotNull(watches.deletedAt), inArray(watches.titleId, batch))))
      for (const row of rows) if (wanted.has(playKey(row))) found.add(playKey(row))
    }
    return found
  },

  async keysWithPlexPlaysSince(userId, serverMachineId, keys, since) {
    const wanted = new Set(keys.map(playKey))
    const found = new Set<string>()
    for (const batch of chunkForPostgresParameters([...new Set(keys.map(key => key.titleId))])) {
      const rows = await withQuerySpan('select-plex-plays-since-scan', () => db
        .selectDistinct({ titleId: watches.titleId, season: watches.season, number: watches.number })
        .from(watches)
        .where(and(
          eq(watches.userId, userId),
          isNull(watches.deletedAt),
          eq(watches.source, 'plex'),
          eq(watches.plexServerMachineId, serverMachineId),
          gt(watches.watchedAt, since),
          inArray(watches.titleId, batch)
        )))
      for (const row of rows) if (wanted.has(playKey(row))) found.add(playKey(row))
    }
    return found
  },

  softDeletePlays(userId, connectionId, item, at) {
    return withQuerySpan('soft-delete-plex-unmarked', () => db.transaction(async (tx) => {
      const rows = await tx
        .update(watches)
        .set({ deletedAt: at })
        .where(and(matchesPlayKey(userId, item), isNull(watches.deletedAt)))
        .returning({ id: watches.id })
      if (!rows.length) return 0
      const unmarked = { titleId: item.titleId, season: item.season, number: item.number, unmarkedAt: at }
      await tx
        .insert(plexUnmarked)
        .values({ connectionId, ratingKey: item.ratingKey, ...unmarked })
        .onConflictDoUpdate({ target: [plexUnmarked.connectionId, plexUnmarked.ratingKey], set: { ...unmarked, updatedAt: new Date() } })
      return rows.length
    }))
  },

  restorePlays(userId, connectionId, item) {
    return withQuerySpan('restore-plex-unmarked', () => db.transaction(async (tx) => {
      const rows = await tx
        .update(watches)
        .set({ deletedAt: null })
        .where(and(matchesPlayKey(userId, item), isNotNull(watches.deletedAt)))
        .returning({ id: watches.id })
      await tx.delete(plexUnmarked).where(and(eq(plexUnmarked.connectionId, connectionId), eq(plexUnmarked.ratingKey, item.ratingKey)))
      return rows.length
    }))
  },

  existingPlays: drizzleInboundStore.existingPlays,

  async insertMarkedPlays(userId, plays) {
    let inserted = 0
    for (const batch of chunkForPostgresParameters(plays)) {
      const rows = await withQuerySpan('insert-plex-marked-watches', () => db
        .insert(watches)
        .values(batch.map(play => ({ userId, ...play, watchedMinute: watchedMinuteOf(play.watchedAt), source: 'plex' as const })))
        .onConflictDoNothing()
        .returning({ id: watches.id }))
      inserted += rows.length
    }
    return inserted
  },

  async saveWatchedStates(connectionId, states) {
    for (const { ratingKey, viewCount, lastViewedAt } of states) {
      await withQuerySpan('update-plex-watched-state', () => db
        .update(plexItems)
        .set({ viewCount, lastViewedAt })
        .where(and(eq(plexItems.connectionId, connectionId), eq(plexItems.ratingKey, ratingKey))))
    }
  },

  async clearExpectedViewCounts(connectionId, expectations) {
    const ratingKeysByValue = new Map<number, string[]>()
    for (const { ratingKey, expectedViewCount } of expectations) ratingKeysByValue.set(expectedViewCount, [...(ratingKeysByValue.get(expectedViewCount) ?? []), ratingKey])
    for (const [expectedViewCount, ratingKeys] of ratingKeysByValue) {
      for (const batch of chunkForPostgresParameters(ratingKeys)) {
        await withQuerySpan('clear-plex-scan-expectations', () => db
          .update(plexItems)
          .set({ expectedViewCount: null })
          .where(and(
            eq(plexItems.connectionId, connectionId),
            inArray(plexItems.ratingKey, batch),
            eq(plexItems.expectedViewCount, expectedViewCount),
            eq(plexItems.outboundPending, false)
          )))
      }
    }
  },

  async finishScan(connectionId, scannedAt) {
    await withQuerySpan('update-plex-scan-finished', () => db
      .update(plexConnections)
      .set({ lastScanAt: scannedAt, tokenInvalid: false })
      .where(eq(plexConnections.id, connectionId)))
  },

  flagTokenInvalid: drizzlePlexOutboundStore.flagTokenInvalid
}

/** Brings back every play soft-deleted for one of the connection's Plex unmarks; call it before the connection (and its unmarked rows) is deleted. */
export function restoreAllUnmarkedPlays(executor: Pick<typeof db, 'update'>, userId: number, connectionId: number) {
  return executor
    .update(watches)
    .set({ deletedAt: null })
    .where(and(
      eq(watches.userId, userId),
      isNotNull(watches.deletedAt),
      exists(db
        .select({ one: sql`1` })
        .from(plexUnmarked)
        .where(and(
          eq(plexUnmarked.connectionId, connectionId),
          eq(plexUnmarked.titleId, watches.titleId),
          sql`${plexUnmarked.season} is not distinct from ${watches.season}`,
          sql`${plexUnmarked.number} is not distinct from ${watches.number}`
        )))
    ))
}

const isPlayable = (item: PlexScanItemState) => item.titleId !== null && item.unmatchedReason === null
  && (item.kind === 'movie' || (item.kind === 'episode' && item.season !== null && item.number !== null))

const unmarkedItemOf = (item: PlexScanItemState): UnmarkedItem => ({ ratingKey: item.ratingKey, titleId: item.titleId!, season: item.season, number: item.number })

async function scanWatchedState(connection: ScanConnection, server: PlexServer, stores: { scanStore: PlexScanStore, itemMapStore: ItemMapStore, inboundStore: InboundStore }): Promise<PlexScanSummary> {
  const { scanStore } = stores
  const scannedAt = new Date()
  const statesBeforeListing = new Map((await scanStore.itemStates(connection.id)).map(item => [item.ratingKey, item]))
  const { watchedStates } = await rebuildItemMap(connection, server, stores.itemMapStore)
  const newHistoryRatingKeys = new Set<string>()
  const pulled = await pullHistory(connection, server, { newHistoryRatingKeys }, stores.inboundStore)
  const storedByRatingKey = new Map((await scanStore.itemStates(connection.id)).map(item => [item.ratingKey, item]))

  const settled: { fresh: PlexWatchedState, stored: PlexScanItemState }[] = []
  let skippedPending = 0
  for (const fresh of watchedStates) {
    const stored = storedByRatingKey.get(fresh.ratingKey)
    if (!stored) continue
    const before = statesBeforeListing.get(fresh.ratingKey)
    // A push that ran while Plex was being read leaves this listing ambiguous; the next poll judges it.
    const pushedDuringRead = before !== undefined && (before.outboundPending || before.expectedViewCount !== stored.expectedViewCount)
    if (stored.outboundPending || pushedDuringRead) {
      skippedPending++
      continue
    }
    settled.push({ fresh, stored })
  }

  const newlyWatched = settled.filter(({ fresh, stored }) => isPlayable(stored) && stored.viewCount === 0 && fresh.viewCount > 0)
  const newlyWatchedKeys = newlyWatched.map(({ stored }) => unmarkedItemOf(stored))
  const softDeletedKeys = newlyWatched.length ? await scanStore.softDeletedKeys(connection.userId, newlyWatchedKeys) : new Set<string>()
  const playedSinceLastScanKeys = newlyWatched.length && connection.lastScanAt
    ? await scanStore.keysWithPlexPlaysSince(connection.userId, connection.serverMachineId, newlyWatchedKeys, new Date(connection.lastScanAt.getTime() - LISTENER_PLAY_LOOKBACK_MS))
    : new Set<string>()
  const rows: WatchedStateRow[] = settled.map(({ fresh, stored }) => ({
    ratingKey: fresh.ratingKey,
    previousViewCount: stored.viewCount,
    viewCount: fresh.viewCount,
    lastViewedAt: fresh.lastViewedAt,
    expectedViewCount: stored.expectedViewCount,
    outboundPending: false,
    hasSoftDeleted: isPlayable(stored) && softDeletedKeys.has(playKey(unmarkedItemOf(stored))),
    hasNewHistory: newHistoryRatingKeys.has(fresh.ratingKey) || (isPlayable(stored) && playedSinceLastScanKeys.has(playKey(unmarkedItemOf(stored))))
  }))
  const playableRatingKeys = new Set(settled.filter(({ stored }) => isPlayable(stored)).map(({ stored }) => stored.ratingKey))
  const transitions = watchedTransitions(rows.filter(row => playableRatingKeys.has(row.ratingKey)))

  const freshViewCounts = new Map(watchedStates.map(state => [state.ratingKey, state.viewCount]))
  const watchedPlayKeys = new Set([...storedByRatingKey.values()]
    .filter(stored => isPlayable(stored) && (freshViewCounts.get(stored.ratingKey) ?? stored.viewCount) > 0)
    .map(stored => playKey(unmarkedItemOf(stored))))

  const counts = { softDeletedPlays: 0, restoredPlays: 0, createdPlays: 0, errors: 0 }
  const failedRatingKeys = new Set<string>()
  const createdCandidates: (InboundPlay & { ratingKey: string })[] = []
  for (const transition of transitions) {
    const item = unmarkedItemOf(storedByRatingKey.get(transition.ratingKey)!)
    if (transition.action === 'create-play') {
      createdCandidates.push({ ratingKey: item.ratingKey, titleId: item.titleId, season: item.season, number: item.number, watchedAt: transition.at === undefined ? scannedAt : new Date(transition.at * 1000) })
      continue
    }
    if (transition.action === 'soft-delete' && watchedPlayKeys.has(playKey(item))) continue
    try {
      if (transition.action === 'soft-delete') counts.softDeletedPlays += await scanStore.softDeletePlays(connection.userId, connection.id, item, scannedAt)
      else counts.restoredPlays += await scanStore.restorePlays(connection.userId, connection.id, item)
    } catch (err) {
      failedRatingKeys.add(item.ratingKey)
      counts.errors++
      logger.error({ err, userId: connection.userId, ratingKey: item.ratingKey, action: transition.action }, 'plex watched-state change failed')
    }
  }
  if (createdCandidates.length) {
    try {
      const existing = await scanStore.existingPlays(connection.userId, [...new Set(createdCandidates.map(play => play.titleId))])
      const kept = dedupeInbound(createdCandidates, existing).map(({ ratingKey: _ratingKey, ...play }) => play)
      counts.createdPlays = kept.length ? await scanStore.insertMarkedPlays(connection.userId, kept) : 0
      for (const play of kept) logger.info({ userId: connection.userId, ...play }, 'plex play imported')
    } catch (err) {
      for (const play of createdCandidates) failedRatingKeys.add(play.ratingKey)
      counts.errors++
      logger.error({ err, userId: connection.userId, plays: createdCandidates.length }, 'plex marked plays failed')
    }
  }

  const changedStates = settled
    .filter(({ fresh, stored }) => !failedRatingKeys.has(fresh.ratingKey) && (fresh.viewCount !== stored.viewCount || fresh.lastViewedAt !== stored.lastViewedAt))
    .map(({ fresh }) => fresh)
  await scanStore.saveWatchedStates(connection.id, changedStates)
  await scanStore.clearExpectedViewCounts(connection.id, expectationsToClear(rows))
  await scanStore.finishScan(connection.id, scannedAt)

  const summary = { pulled, ...counts, skippedPending }
  logger.info({ userId: connection.userId, connectionId: connection.id, outcome: 'ok', ...summary }, 'plex scan finished')
  return summary
}

/** One watched-state poll: item map, history pull, then Plex mark/unmark transitions. A rejected token flags the connection and ends the run without a retry. */
export async function runPlexScan({ connection, server, scanStore = drizzlePlexScanStore, itemMapStore = drizzleItemMapStore, inboundStore = drizzleInboundStore }: {
  connection: ScanConnection
  server: PlexServer
  scanStore?: PlexScanStore
  itemMapStore?: ItemMapStore
  inboundStore?: InboundStore
}): Promise<PlexScanSummary | { tokenInvalid: true }> {
  try {
    return await scanWatchedState(connection, server, { scanStore, itemMapStore, inboundStore })
  } catch (error) {
    const scanned = { userId: connection.userId, connectionId: connection.id }
    if (!(error instanceof PlexError && error.kind === 'unauthorized')) {
      logger.info({ ...scanned, outcome: error instanceof PlexError && error.kind === 'unreachable' ? 'unreachable' : 'failed' }, 'plex scan finished')
      throw error
    }
    await scanStore.flagTokenInvalid(connection.id)
    logger.warn({ ...scanned, error: error.message }, 'plex scan stopped: token rejected')
    logger.info({ ...scanned, outcome: 'token-rejected' }, 'plex scan finished')
    return { tokenInvalid: true }
  }
}
