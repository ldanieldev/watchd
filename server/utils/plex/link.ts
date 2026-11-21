import { and, eq, exists, inArray, isNull, max, sql } from 'drizzle-orm'
import { episodes, plexConnections, plexItems, watches } from '../../db/schema'
import type { PlexReport } from '../../db/schema'
import { chunkForPostgresParameters, queueEnrichment as queueTitleEnrichment } from '../import/writePlays'
import { logger } from '../logger'
import { PlexError } from './client'
import type { PlexServer } from './client'
import { plexSyncMode } from './config'
import { loadPlexConnection, plexServerFor } from './connection'
import type { PlexConnectionRow } from './connection'
import { drizzleInboundStore, pullHistory } from './inbound'
import type { InboundStore } from './inbound'
import { drizzleItemMapStore, rebuildItemMap } from './itemMap'
import type { ItemMapStore } from './itemMap'
import { drizzlePlexOutboundStore, PLEX_PUSH_CHUNK_SIZE, sendPlexPush } from './outbound'
import type { PlexMediaOp } from './outbound'

const IMPORT_SOURCES = ['floppy', 'trakt'] as const

export interface PlexLinkStore {
  /** Unix seconds of the newest Floppy/Trakt play, soft-deleted ones included; null when the user has none. */
  latestImportedPlayAt(userId: number): Promise<number | null>
  titleIdsNeedingEnrichment(connectionId: number): Promise<number[]>
  /** One mark op per mapped movie/episode with a live watchd play, among `unwatchedRatingKeys` and not already pending. */
  markCandidates(userId: number, connectionId: number, unwatchedRatingKeys: Set<string>): Promise<PlexMediaOp[]>
  unmatchedCounts(connectionId: number): Promise<PlexReport['unmatched']>
  saveReport(connectionId: number, report: PlexReport): Promise<void>
  flagTokenInvalid(connectionId: number): Promise<void>
}

export const drizzlePlexLinkStore: PlexLinkStore = {
  async latestImportedPlayAt(userId) {
    const [row] = await withQuerySpan('select-latest-imported-play', () => db
      .select({ latest: max(watches.watchedAt) })
      .from(watches)
      .where(and(eq(watches.userId, userId), inArray(watches.source, [...IMPORT_SOURCES]))))
    return row?.latest ? Math.floor(new Date(row.latest).getTime() / 1000) : null
  },

  async titleIdsNeedingEnrichment(connectionId) {
    const rows = await withQuerySpan('select-plex-titles-needing-enrichment', () => db
      .selectDistinct({ titleId: plexItems.titleId })
      .from(plexItems)
      .innerJoin(episodes, eq(episodes.titleId, plexItems.titleId))
      .where(and(eq(plexItems.connectionId, connectionId), eq(plexItems.kind, 'show'), isNull(episodes.tmdbEpisodeId))))
    return rows.flatMap(row => row.titleId === null ? [] : [row.titleId])
  },

  async markCandidates(userId, connectionId, unwatchedRatingKeys) {
    const rows = await withQuerySpan('select-plex-mark-candidates', () => db
      .selectDistinct({ ratingKey: plexItems.ratingKey, titleId: plexItems.titleId, season: plexItems.season, number: plexItems.number })
      .from(plexItems)
      .where(and(
        eq(plexItems.connectionId, connectionId),
        eq(plexItems.outboundPending, false),
        isNull(plexItems.unmatchedReason),
        inArray(plexItems.kind, ['movie', 'episode']),
        exists(db
          .select({ one: sql`1` })
          .from(watches)
          .where(and(
            eq(watches.userId, userId),
            isNull(watches.deletedAt),
            eq(watches.titleId, plexItems.titleId),
            sql`${watches.season} is not distinct from ${plexItems.season}`,
            sql`${watches.number} is not distinct from ${plexItems.number}`
          )))
      )))
    const keys = new Map<string, PlexMediaOp>()
    for (const row of rows) {
      if (row.titleId === null || !unwatchedRatingKeys.has(row.ratingKey)) continue
      keys.set(`${row.titleId}:${row.season}:${row.number}`, { op: 'mark', titleId: row.titleId, season: row.season, number: row.number })
    }
    return [...keys.values()]
  },

  async unmatchedCounts(connectionId) {
    const rows = await withQuerySpan('select-plex-unmatched-counts', () => db
      .select({ reason: plexItems.unmatchedReason, count: sql<number>`count(*)::int` })
      .from(plexItems)
      .where(eq(plexItems.connectionId, connectionId))
      .groupBy(plexItems.unmatchedReason))
    const countOf = (reason: string) => rows.find(row => row.reason === reason)?.count ?? 0
    return { noTmdbGuid: countOf('no-tmdb-guid'), episodeNotInTmdb: countOf('episode-not-in-tmdb') }
  },

  async saveReport(connectionId, report) {
    await withQuerySpan('update-plex-last-report', () => db.update(plexConnections).set({ lastReport: report }).where(eq(plexConnections.id, connectionId)))
  },

  flagTokenInvalid: drizzlePlexOutboundStore.flagTokenInvalid
}

export type LinkConnection = Pick<PlexConnectionRow, 'id' | 'userId' | 'ownerAccountId' | 'serverMachineId' | 'sectionIds' | 'historyCursor' | 'lastPlayAt'>

export interface PlexLinkContext {
  connection: LinkConnection
  server: PlexServer
  store?: PlexLinkStore
  itemMapStore?: ItemMapStore
  inboundStore?: InboundStore
  queueEnrichment?: (titleIds: number[]) => Promise<void>
  sendPush?: (ops: PlexMediaOp[]) => Promise<boolean>
  isFinalAttempt?: boolean
  pushChunkSize?: number
}

type PulledCounts = PlexReport['pulled']
export type PlexLinkSkipped = { skipped: string }
export type PlexLinkTokenInvalid = { tokenInvalid: true }

const logOutcome = (connection: LinkConnection, outcome: string, counts: object = {}) =>
  logger.info({ userId: connection.userId, connectionId: connection.id, outcome, ...counts }, 'plex link finished')

export async function guardLinkStep<Result>(context: PlexLinkContext, run: () => Promise<Result>): Promise<Result | PlexLinkTokenInvalid> {
  const { connection, store = drizzlePlexLinkStore, isFinalAttempt = true } = context
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof PlexError && error.kind === 'unauthorized')) {
      if (isFinalAttempt) logOutcome(connection, error instanceof PlexError && error.kind === 'unreachable' ? 'unreachable' : 'failed')
      throw error
    }
    await store.flagTokenInvalid(connection.id)
    logger.warn({ userId: connection.userId, connectionId: connection.id, error: error.message }, 'plex link stopped: token rejected')
    logOutcome(connection, 'token-rejected')
    return { tokenInvalid: true }
  }
}

export async function linkRebuildItemMap(context: PlexLinkContext): Promise<{ unwatchedRatingKeys: string[] }> {
  const { connection, server, store = drizzlePlexLinkStore, itemMapStore = drizzleItemMapStore, queueEnrichment = queueTitleEnrichment } = context
  const { watchedStates } = await rebuildItemMap(connection, server, itemMapStore)
  const titleIds = await store.titleIdsNeedingEnrichment(connection.id)
  if (titleIds.length) await queueEnrichment(titleIds)
  return { unwatchedRatingKeys: watchedStates.filter(state => state.viewCount === 0).map(state => state.ratingKey) }
}

export async function linkPullHistory(context: PlexLinkContext, rerun: boolean): Promise<PulledCounts> {
  const { connection, server, store = drizzlePlexLinkStore, inboundStore = drizzleInboundStore } = context
  if (rerun) return pullHistory(connection, server, {}, inboundStore)
  const since = await store.latestImportedPlayAt(connection.userId)
  return pullHistory(connection, server, { since: since ?? 0 }, inboundStore)
}

// Counts only chunks that fail to queue here; failures inside the later plex-push runs are not visible to this run.
export async function linkPushMarks(context: PlexLinkContext, unwatchedRatingKeys: string[]): Promise<{ pushed: number, errors: number }> {
  const { connection, store = drizzlePlexLinkStore, pushChunkSize = PLEX_PUSH_CHUNK_SIZE } = context
  if (plexSyncMode() !== 'on') return { pushed: 0, errors: 0 }
  const sendPush = context.sendPush ?? (ops => sendPlexPush(connection, connection.userId, ops))
  const candidates = await store.markCandidates(connection.userId, connection.id, new Set(unwatchedRatingKeys))
  let pushed = 0
  let errors = 0
  for (const batch of chunkForPostgresParameters(candidates, pushChunkSize)) {
    try {
      if (await sendPush(batch)) pushed += batch.length
    } catch (err) {
      errors += batch.length
      logger.error({ err, userId: connection.userId, ops: batch.length }, 'plex link push chunk failed')
    }
  }
  return { pushed, errors }
}

export async function linkFinish(context: PlexLinkContext, results: { pulled: PulledCounts, pushed: number, errors: number }): Promise<PlexReport> {
  const { connection, store = drizzlePlexLinkStore } = context
  const report: PlexReport = { pulled: results.pulled, pushed: results.pushed, unmatched: await store.unmatchedCounts(connection.id), errors: results.errors, finishedAt: new Date().toISOString() }
  await store.saveReport(connection.id, report)
  logOutcome(connection, 'ok', { pulled: report.pulled, pushed: report.pushed, unmatched: report.unmatched, errors: report.errors })
  return report
}

export interface PlexLinkStepRunner {
  run<Result>(id: string, run: () => Promise<Result>): Promise<Result>
}

const loadLinkContext = async (userId: number): Promise<PlexLinkContext | null> => {
  const connection = await loadPlexConnection(userId)
  return connection ? { connection, server: plexServerFor(connection) } : null
}

/** The first link, or a re-run catch-up, as four retryable steps; each reloads the connection so a retry after a token or section change sees the current row. */
export async function runPlexLinkSteps({ userId, rerun, isFinalAttempt, step, loadContext = loadLinkContext }: {
  userId: number
  rerun: boolean
  isFinalAttempt: boolean
  step: PlexLinkStepRunner
  loadContext?: (userId: number) => Promise<PlexLinkContext | null>
}): Promise<PlexReport | PlexLinkSkipped | PlexLinkTokenInvalid> {
  if (plexSyncMode() === 'off') return { skipped: 'sync off' }
  const inStep = <Result>(id: string, run: (context: PlexLinkContext) => Promise<Result>) => step.run(id, async () => {
    const loaded = await loadContext(userId)
    if (!loaded) {
      logger.info({ userId, outcome: 'no-connection' }, 'plex link finished')
      return { skipped: 'no plex connection' }
    }
    const context = { ...loaded, isFinalAttempt }
    return guardLinkStep(context, () => run(context))
  })

  const rebuilt = await inStep('rebuild-item-map', linkRebuildItemMap)
  if ('skipped' in rebuilt || 'tokenInvalid' in rebuilt) return rebuilt
  const pulled = await inStep('pull-history', context => linkPullHistory(context, rerun))
  if ('skipped' in pulled || 'tokenInvalid' in pulled) return pulled
  const pushed = await inStep('push-marks', context => linkPushMarks(context, rebuilt.unwatchedRatingKeys))
  if ('skipped' in pushed || 'tokenInvalid' in pushed) return pushed
  return inStep('save-report', context => linkFinish(context, { pulled, ...pushed }))
}
