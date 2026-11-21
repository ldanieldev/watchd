import { and, eq, inArray } from 'drizzle-orm'
import { plexConnections, plexItems, plexUnresolvedHistory, watches } from '../../db/schema'
import type { PlexItemKind } from '../../db/schema'
import { chunkForPostgresParameters } from '../import/writePlays'
import { watchedMinuteOf } from '../library/watchedMinute'
import { logger } from '../logger'
import type { PlexServer } from './client'
import type { PlexHistoryEntry } from './types'

export const INBOUND_DEDUPE_WINDOW_MS = 5 * 60 * 1000

export interface InboundPlay {
  titleId: number
  season: number | null
  number: number | null
  watchedAt: Date
}

export interface StoredInboundPlay extends InboundPlay {
  plexHistoryId: number | null
}

type PlexPlay = InboundPlay & { plexHistoryId: number }

export interface InboundItem {
  kind: PlexItemKind
  titleId: number | null
  season: number | null
  number: number | null
}

export type UnresolvedHistoryEntry = Pick<PlexHistoryEntry, 'historyId' | 'ratingKey' | 'viewedAt'> & { sectionId: string | null }

export interface InboundStore {
  mappedItems(connectionId: number, ratingKeys: string[]): Promise<Map<string, InboundItem>>
  unresolvedEntries(connectionId: number): Promise<UnresolvedHistoryEntry[]>
  /** Includes soft-deleted plays, whose history ids must not be imported again. */
  storedHistoryIds(userId: number, serverMachineId: string, historyIds: number[]): Promise<Set<number>>
  /** Includes soft-deleted plays, so a pull never re-creates a play the user deleted. */
  existingPlays(userId: number, titleIds: number[]): Promise<StoredInboundPlay[]>
  /** Returns the history ids of the rows actually inserted. */
  insertPlays(userId: number, serverMachineId: string, plays: PlexPlay[]): Promise<number[]>
  saveUnresolved(connectionId: number, entries: UnresolvedHistoryEntry[]): Promise<void>
  removeUnresolved(connectionId: number, historyIds: number[]): Promise<void>
  saveProgress(connectionId: number, update: { historyCursor: number | null, lastPlayAt?: Date }): Promise<void>
}

type InboundConnection = Pick<typeof plexConnections.$inferSelect, 'id' | 'userId' | 'ownerAccountId' | 'serverMachineId' | 'sectionIds' | 'historyCursor' | 'lastPlayAt'>

export const drizzleInboundStore: InboundStore = {
  async mappedItems(connectionId, ratingKeys) {
    const items = new Map<string, InboundItem>()
    for (const batch of chunkForPostgresParameters(ratingKeys)) {
      const rows = await withQuerySpan('select-plex-inbound-items', () => db
        .select({ ratingKey: plexItems.ratingKey, kind: plexItems.kind, titleId: plexItems.titleId, season: plexItems.season, number: plexItems.number })
        .from(plexItems)
        .where(and(eq(plexItems.connectionId, connectionId), inArray(plexItems.ratingKey, batch))))
      for (const { ratingKey, ...item } of rows) items.set(ratingKey, item)
    }
    return items
  },

  unresolvedEntries(connectionId) {
    return withQuerySpan('select-plex-unresolved', () => db
      .select({ historyId: plexUnresolvedHistory.historyId, ratingKey: plexUnresolvedHistory.ratingKey, viewedAt: plexUnresolvedHistory.viewedAt, sectionId: plexUnresolvedHistory.sectionId })
      .from(plexUnresolvedHistory)
      .where(eq(plexUnresolvedHistory.connectionId, connectionId)))
  },

  async storedHistoryIds(userId, serverMachineId, historyIds) {
    const stored = new Set<number>()
    for (const batch of chunkForPostgresParameters(historyIds)) {
      const rows = await withQuerySpan('select-plex-stored-history', () => db
        .select({ plexHistoryId: watches.plexHistoryId })
        .from(watches)
        .where(and(eq(watches.userId, userId), eq(watches.plexServerMachineId, serverMachineId), inArray(watches.plexHistoryId, batch))))
      for (const row of rows) if (row.plexHistoryId !== null) stored.add(row.plexHistoryId)
    }
    return stored
  },

  async existingPlays(userId, titleIds) {
    const plays: StoredInboundPlay[] = []
    for (const batch of chunkForPostgresParameters(titleIds)) {
      plays.push(...await withQuerySpan('select-plex-dedupe-watches', () => db
        .select({ titleId: watches.titleId, season: watches.season, number: watches.number, watchedAt: watches.watchedAt, plexHistoryId: watches.plexHistoryId })
        .from(watches)
        .where(and(eq(watches.userId, userId), inArray(watches.titleId, batch)))))
    }
    return plays
  },

  async insertPlays(userId, serverMachineId, plays) {
    const insertedHistoryIds: number[] = []
    for (const batch of chunkForPostgresParameters(plays)) {
      const rows = await withQuerySpan('insert-plex-watches', () => db
        .insert(watches)
        .values(batch.map(play => ({ userId, ...play, plexServerMachineId: serverMachineId, watchedMinute: watchedMinuteOf(play.watchedAt), source: 'plex' as const })))
        .onConflictDoNothing()
        .returning({ plexHistoryId: watches.plexHistoryId }))
      for (const row of rows) if (row.plexHistoryId !== null) insertedHistoryIds.push(row.plexHistoryId)
    }
    return insertedHistoryIds
  },

  async saveUnresolved(connectionId, entries) {
    for (const batch of chunkForPostgresParameters(entries)) {
      await withQuerySpan('insert-plex-unresolved', () => db
        .insert(plexUnresolvedHistory)
        .values(batch.map(entry => ({ connectionId, ...entry })))
        .onConflictDoNothing())
    }
  },

  async removeUnresolved(connectionId, historyIds) {
    for (const batch of chunkForPostgresParameters(historyIds)) {
      await withQuerySpan('delete-plex-unresolved', () => db
        .delete(plexUnresolvedHistory)
        .where(and(eq(plexUnresolvedHistory.connectionId, connectionId), inArray(plexUnresolvedHistory.historyId, batch))))
    }
  },

  async saveProgress(connectionId, update) {
    await withQuerySpan('update-plex-progress', () => db.update(plexConnections).set(update).where(eq(plexConnections.id, connectionId)))
  }
}

export const playKey = (play: Pick<InboundPlay, 'titleId' | 'season' | 'number'>) => `${play.titleId}:${play.season}:${play.number}`

/** Candidates with no play of the same movie/episode within `windowMs`, checked against `existing` and the candidates already kept. */
export function dedupeInbound<Candidate extends InboundPlay>(candidates: Candidate[], existing: InboundPlay[], windowMs = INBOUND_DEDUPE_WINDOW_MS): Candidate[] {
  const timesByKey = new Map<string, number[]>()
  const remember = (play: InboundPlay) => timesByKey.set(playKey(play), [...(timesByKey.get(playKey(play)) ?? []), play.watchedAt.getTime()])
  for (const play of existing) remember(play)
  const kept: Candidate[] = []
  for (const candidate of candidates) {
    const time = candidate.watchedAt.getTime()
    if (timesByKey.get(playKey(candidate))?.some(other => Math.abs(other - time) <= windowMs)) continue
    kept.push(candidate)
    remember(candidate)
  }
  return kept
}

function maxOrNull(values: (number | null | undefined)[]): number | null {
  let max: number | null = null
  for (const value of values) if (value !== null && value !== undefined && (max === null || value > max)) max = value
  return max
}

function playFor(entry: UnresolvedHistoryEntry, item: InboundItem | undefined): PlexPlay | undefined {
  if (!item || item.titleId === null || item.kind === 'show') return undefined
  if (item.kind === 'episode' && (item.season === null || item.number === null)) return undefined
  return { titleId: item.titleId, season: item.season, number: item.number, watchedAt: new Date(entry.viewedAt * 1000), plexHistoryId: entry.historyId }
}

/**
 * Imports the owner's Plex history after `since ?? connection.historyCursor` (unix s), plus earlier entries still unresolved.
 * Entries whose item isn't mapped to a movie or TMDB episode yet are kept as unresolved and retried on every pull.
 * `newHistoryRatingKeys`, when given, collects the rating keys of entries not stored before this pull (refetched cursor-second entries excluded).
 */
export async function pullHistory(
  connection: InboundConnection,
  server: PlexServer,
  { since, newHistoryRatingKeys }: { since?: number, newHistoryRatingKeys?: Set<string> } = {},
  store: InboundStore = drizzleInboundStore
): Promise<{ added: number, duplicates: number, unresolved: number }> {
  const readFrom = since ?? connection.historyCursor ?? undefined
  // Plex's viewedAt> is strict, so read from a second earlier and skip stored history ids rather than lose entries sharing the cursor's second.
  const fetched = await server.history({
    accountId: connection.ownerAccountId,
    sectionIds: connection.sectionIds.map(Number),
    viewedAfter: readFrom === undefined || readFrom <= 0 ? undefined : readFrom - 1
  })
  const chosenSectionIds = new Set(connection.sectionIds)
  const storedUnresolved = await store.unresolvedEntries(connection.id)
  // Rows stored before section_id existed have no section to check, so they are retried rather than dropped.
  const retried = storedUnresolved.filter(entry => entry.sectionId === null || chosenSectionIds.has(entry.sectionId))
  const unchosenHistoryIds = storedUnresolved.filter(entry => !retried.includes(entry)).map(entry => entry.historyId)

  const entriesByHistoryId = new Map<number, UnresolvedHistoryEntry>()
  for (const entry of retried) entriesByHistoryId.set(entry.historyId, entry)
  for (const { historyId, ratingKey, viewedAt, sectionId } of fetched) entriesByHistoryId.set(historyId, { historyId, ratingKey, viewedAt, sectionId: String(sectionId) })
  const entries = [...entriesByHistoryId.values()].sort((left, right) => left.viewedAt - right.viewedAt)
  const alreadyStored = await store.storedHistoryIds(connection.userId, connection.serverMachineId, entries.map(entry => entry.historyId))
  const pending = entries.filter(entry => !alreadyStored.has(entry.historyId))
  for (const entry of pending) newHistoryRatingKeys?.add(entry.ratingKey)

  const items = await store.mappedItems(connection.id, [...new Set(pending.map(entry => entry.ratingKey))])
  const candidates: PlexPlay[] = []
  const unresolved: UnresolvedHistoryEntry[] = []
  for (const entry of pending) {
    const play = playFor(entry, items.get(entry.ratingKey))
    if (play) candidates.push(play)
    else unresolved.push(entry)
  }

  const existing = candidates.length ? await store.existingPlays(connection.userId, [...new Set(candidates.map(play => play.titleId))]) : []
  const kept = dedupeInbound(candidates, existing)
  const insertedHistoryIds = new Set(kept.length ? await store.insertPlays(connection.userId, connection.serverMachineId, kept) : [])
  const added = kept.filter(play => insertedHistoryIds.has(play.plexHistoryId))
  for (const play of added) logger.info({ userId: connection.userId, ...play }, 'plex play imported')

  const retriedHistoryIds = new Set(retried.map(entry => entry.historyId))
  const unresolvedHistoryIds = new Set(unresolved.map(entry => entry.historyId))
  await store.saveUnresolved(connection.id, unresolved.filter(entry => !retriedHistoryIds.has(entry.historyId)))
  await store.removeUnresolved(connection.id, [...[...retriedHistoryIds].filter(historyId => !unresolvedHistoryIds.has(historyId)), ...unchosenHistoryIds])

  const historyCursor = maxOrNull([connection.historyCursor, since, ...fetched.map(entry => entry.viewedAt)])
  const newestAdded = added.reduce<Date | undefined>((latest, play) => (!latest || play.watchedAt > latest ? play.watchedAt : latest), undefined)
  const lastPlayAt = newestAdded && (!connection.lastPlayAt || newestAdded > connection.lastPlayAt) ? newestAdded : undefined
  if (historyCursor !== null || lastPlayAt) await store.saveProgress(connection.id, { historyCursor, ...(lastPlayAt && { lastPlayAt }) })

  return { added: added.length, duplicates: candidates.length - added.length, unresolved: unresolved.length }
}
