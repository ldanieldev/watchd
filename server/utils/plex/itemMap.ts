import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { episodes, plexItems } from '../../db/schema'
import type { PlexItemKind, PlexUnmatchedReason, plexConnections } from '../../db/schema'
import { chunkForPostgresParameters, ensureTitles, queueEnrichment, titleKey } from '../import/writePlays'
import type { TitleStub } from '../import/writePlays'
import { logger } from '../logger'
import type { PlexServer } from './client'
import { resolveEpisode, tmdbIdFromGuids } from './match'
import type { TmdbEpisodeRef } from './match'
import type { PlexItem } from './types'

const LISTED_TYPES_BY_SECTION_TYPE: Record<string, readonly (1 | 2 | 4)[]> = { movie: [1], show: [2, 4] }
const TITLE_NAME_MAX_LENGTH = 500

export interface PlexItemMapping {
  ratingKey: string
  kind: PlexItemKind
  sectionId: string
  parentRatingKey: string | null
  name?: string | null
  titleId: number | null
  season: number | null
  number: number | null
  unmatchedReason: PlexUnmatchedReason | null
  viewCount: number
  lastViewedAt: number | null
}

export interface PlexWatchedState {
  ratingKey: string
  viewCount: number
  lastViewedAt: number | null
}

const MAPPING_FIELDS = ['kind', 'name', 'sectionId', 'parentRatingKey', 'titleId', 'season', 'number', 'unmatchedReason'] as const

export interface ItemMapStore {
  ensureTitles(stubs: TitleStub[]): Promise<{ titleIdsByKey: Map<string, number>, createdCount: number }>
  episodesOfTitles(titleIds: number[]): Promise<Map<number, TmdbEpisodeRef[]>>
  existingItems(connectionId: number): Promise<PlexItemMapping[]>
  /** New rows take Plex's viewCount/lastViewedAt; existing rows keep theirs, which belong to the watched-state poll. */
  upsertItems(connectionId: number, items: PlexItemMapping[]): Promise<void>
  deleteItems(connectionId: number, ratingKeys: string[]): Promise<void>
}

type ItemMapConnection = Pick<typeof plexConnections.$inferSelect, 'id' | 'sectionIds'>

interface ListedItem {
  sectionId: string
  item: PlexItem
}

const excluded = (column: AnyPgColumn) => sql.raw(`excluded.${column.name}`)

export const drizzleItemMapStore: ItemMapStore = {
  async ensureTitles(stubs) {
    const { titleIdsByKey, createdTitleIds, titleIdsToEnrich } = await ensureTitles(stubs)
    await queueEnrichment(titleIdsToEnrich)
    return { titleIdsByKey, createdCount: createdTitleIds.length }
  },

  async episodesOfTitles(titleIds) {
    const byTitleId = new Map<number, TmdbEpisodeRef[]>()
    for (const batch of chunkForPostgresParameters(titleIds)) {
      const rows = await withQuerySpan('select-plex-map-episodes', () => db
        .select({ titleId: episodes.titleId, season: episodes.season, number: episodes.number, tmdbEpisodeId: episodes.tmdbEpisodeId })
        .from(episodes)
        .where(inArray(episodes.titleId, batch)))
      for (const { titleId, ...episode } of rows) byTitleId.set(titleId, [...(byTitleId.get(titleId) ?? []), episode])
    }
    return byTitleId
  },

  existingItems(connectionId) {
    return withQuerySpan('select-plex-items', () => db
      .select({
        ratingKey: plexItems.ratingKey, kind: plexItems.kind, sectionId: plexItems.sectionId, parentRatingKey: plexItems.parentRatingKey, name: plexItems.name,
        titleId: plexItems.titleId, season: plexItems.season, number: plexItems.number, unmatchedReason: plexItems.unmatchedReason,
        viewCount: plexItems.viewCount, lastViewedAt: plexItems.lastViewedAt
      })
      .from(plexItems)
      .where(eq(plexItems.connectionId, connectionId)))
  },

  async upsertItems(connectionId, items) {
    await withQuerySpan('upsert-plex-items', () => db
      .insert(plexItems)
      .values(items.map(item => ({ connectionId, ...item })))
      .onConflictDoUpdate({
        target: [plexItems.connectionId, plexItems.ratingKey],
        set: {
          kind: excluded(plexItems.kind),
          sectionId: excluded(plexItems.sectionId),
          parentRatingKey: excluded(plexItems.parentRatingKey),
          name: excluded(plexItems.name),
          titleId: excluded(plexItems.titleId),
          season: excluded(plexItems.season),
          number: excluded(plexItems.number),
          unmatchedReason: excluded(plexItems.unmatchedReason),
          updatedAt: new Date()
        }
      }))
  },

  async deleteItems(connectionId, ratingKeys) {
    for (const batch of chunkForPostgresParameters(ratingKeys)) {
      await withQuerySpan('delete-plex-items', () => db
        .delete(plexItems)
        .where(and(eq(plexItems.connectionId, connectionId), inArray(plexItems.ratingKey, batch))))
    }
  }
}

async function listChosenSections(connection: ItemMapConnection, server: PlexServer): Promise<ListedItem[]> {
  const chosenSections = (await server.sections()).filter(section => connection.sectionIds.includes(String(section.id)))
  const listed: ListedItem[] = []
  for (const section of chosenSections) {
    for (const type of LISTED_TYPES_BY_SECTION_TYPE[section.type] ?? []) {
      for (const item of await server.listItems(section.id, type)) listed.push({ sectionId: String(section.id), item })
    }
  }
  return listed
}

function titleStubsFor(listed: ListedItem[]): TitleStub[] {
  const stubsByKey = new Map<string, TitleStub>()
  for (const { item } of listed) {
    if (item.kind === 'episode') continue
    const tmdbId = tmdbIdFromGuids(item.guids)
    if (tmdbId === undefined) continue
    const kind = item.kind === 'movie' ? 'movie' : 'tv'
    stubsByKey.set(titleKey(kind, tmdbId), { kind, tmdbId, name: item.title.slice(0, TITLE_NAME_MAX_LENGTH) })
  }
  return [...stubsByKey.values()]
}

function titleIdOf(item: PlexItem, titleIdsByKey: Map<string, number>): number | undefined {
  const tmdbId = tmdbIdFromGuids(item.guids)
  if (tmdbId === undefined) return undefined
  const titleId = titleIdsByKey.get(titleKey(item.kind === 'movie' ? 'movie' : 'tv', tmdbId))
  if (titleId === undefined) throw new Error(`no title row for tmdb id ${tmdbId}`)
  return titleId
}

function mappingFor(
  connectionId: number,
  { sectionId, item }: ListedItem,
  titleIdsByKey: Map<string, number>,
  showTitleIdByRatingKey: Map<string, number | null>,
  episodesByTitleId: Map<number, TmdbEpisodeRef[]>
): PlexItemMapping {
  const base = { ratingKey: item.ratingKey, kind: item.kind, sectionId, name: item.title.slice(0, TITLE_NAME_MAX_LENGTH), viewCount: item.viewCount, lastViewedAt: item.lastViewedAt ?? null }
  if (item.kind !== 'episode') {
    const titleId = titleIdOf(item, titleIdsByKey)
    return { ...base, parentRatingKey: null, titleId: titleId ?? null, season: null, number: null, unmatchedReason: titleId === undefined ? 'no-tmdb-guid' : null }
  }
  const parentRatingKey = item.grandparentRatingKey ?? null
  const showTitleId = parentRatingKey === null ? undefined : showTitleIdByRatingKey.get(parentRatingKey)
  if (showTitleId === undefined) logger.debug({ connectionId, ratingKey: item.ratingKey, grandparentRatingKey: item.grandparentRatingKey }, 'plex episode show not in listing')
  if (showTitleId === undefined || showTitleId === null) return { ...base, parentRatingKey, titleId: null, season: null, number: null, unmatchedReason: 'no-tmdb-guid' }
  const resolution = resolveEpisode(item, episodesByTitleId.get(showTitleId) ?? [])
  if ('unmatched' in resolution) return { ...base, parentRatingKey, titleId: showTitleId, season: null, number: null, unmatchedReason: resolution.unmatched }
  return { ...base, parentRatingKey, titleId: showTitleId, season: resolution.season, number: resolution.number, unmatchedReason: null }
}

const mappingChanged = (existing: PlexItemMapping | undefined, mapping: PlexItemMapping) =>
  !existing || MAPPING_FIELDS.some(field => existing[field] !== mapping[field])

async function saveMappings(connectionId: number, mappings: PlexItemMapping[], store: ItemMapStore): Promise<Set<string>> {
  const failedRatingKeys = new Set<string>()
  for (const batch of chunkForPostgresParameters(mappings)) {
    try {
      await store.upsertItems(connectionId, batch)
    } catch {
      for (const mapping of batch) {
        try {
          await store.upsertItems(connectionId, [mapping])
        } catch (err) {
          failedRatingKeys.add(mapping.ratingKey)
          logger.error({ err, connectionId, ratingKey: mapping.ratingKey }, 'plex item map row failed')
        }
      }
    }
  }
  return failedRatingKeys
}

/**
 * Rebuilds the connection's item map from its chosen Plex sections. A Plex read failure throws before anything is written; a bad item is logged and keeps its previous row.
 * `watchedStates` is Plex's fresh view state of every listed item; stored rows keep the previous poll's, so the poll can compare them.
 */
export async function rebuildItemMap(
  connection: ItemMapConnection,
  server: PlexServer,
  store: ItemMapStore = drizzleItemMapStore
): Promise<{ items: number, unmatched: number, newTitles: number, watchedStates: PlexWatchedState[] }> {
  const listed = await listChosenSections(connection, server)
  const { titleIdsByKey, createdCount } = await store.ensureTitles(titleStubsFor(listed))

  const showTitleIdByRatingKey = new Map<string, number | null>()
  for (const { item } of listed) {
    if (item.kind !== 'show') continue
    const tmdbId = tmdbIdFromGuids(item.guids)
    const titleId = tmdbId === undefined ? undefined : titleIdsByKey.get(titleKey('tv', tmdbId))
    showTitleIdByRatingKey.set(item.ratingKey, titleId ?? null)
  }
  const episodesByTitleId = await store.episodesOfTitles([...new Set([...showTitleIdByRatingKey.values()].filter(titleId => titleId !== null))])

  const mappings: PlexItemMapping[] = []
  const failedRatingKeys = new Set<string>()
  for (const listedItem of listed) {
    try {
      mappings.push(mappingFor(connection.id, listedItem, titleIdsByKey, showTitleIdByRatingKey, episodesByTitleId))
    } catch (err) {
      failedRatingKeys.add(listedItem.item.ratingKey)
      logger.error({ err, connectionId: connection.id, ratingKey: listedItem.item.ratingKey }, 'plex item map row failed')
    }
  }

  const existingByRatingKey = new Map((await store.existingItems(connection.id)).map(row => [row.ratingKey, row]))
  const changed = mappings.filter(mapping => mappingChanged(existingByRatingKey.get(mapping.ratingKey), mapping))
  for (const ratingKey of await saveMappings(connection.id, changed, store)) failedRatingKeys.add(ratingKey)

  const listedRatingKeys = new Set(listed.map(({ item }) => item.ratingKey))
  const removedRatingKeys = [...existingByRatingKey.keys()].filter(ratingKey => !listedRatingKeys.has(ratingKey))
  await store.deleteItems(connection.id, removedRatingKeys)

  const saved = mappings.filter(mapping => !failedRatingKeys.has(mapping.ratingKey))
  const summary = { items: saved.length, unmatched: saved.filter(mapping => mapping.unmatchedReason !== null).length, newTitles: createdCount }
  logger.info({ connectionId: connection.id, ...summary, removed: removedRatingKeys.length, failed: failedRatingKeys.size }, 'plex item map rebuilt')
  const watchedStates = listed.map(({ item }) => ({ ratingKey: item.ratingKey, viewCount: item.viewCount, lastViewedAt: item.lastViewedAt ?? null }))
  return { ...summary, watchedStates }
}
