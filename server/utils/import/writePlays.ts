import { and, eq, inArray } from 'drizzle-orm'
import { titles, watches, type TitleKind, type WatchSource } from '../../db/schema'
import { inngest } from '../inngest/client'
import { watchedMinuteOf } from '../library/watchedMinute'
import type { ImportSummary } from '../../../shared/types/library'
import type { ImportedPlay, ParsedImport } from './types'

export const TITLE_ENRICH_EVENT = 'library/title.enrich'

const CHUNK_SIZE = 1000
const STALE_PENDING_MS = 10 * 60 * 1000

function chunks<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size))
  return result
}

const titleKey = (kind: TitleKind, tmdbId: number) => `${kind}-${tmdbId}`

function stubTitles(plays: ImportedPlay[]) {
  const byKey = new Map<string, typeof titles.$inferInsert>()
  for (const play of plays) {
    const key = titleKey(play.kind, play.tmdbId)
    const existing = byKey.get(key)
    byKey.set(key, {
      kind: play.kind,
      tmdbId: play.tmdbId,
      name: existing?.name ?? play.titleName,
      posterPath: existing?.posterPath ?? play.posterPath,
      firstAired: existing?.firstAired ?? play.firstAired,
      runtimeMinutes: existing?.runtimeMinutes ?? play.runtimeMinutes
    })
  }
  return [...byKey.values()]
}

async function titleIdsFor(stubs: typeof titles.$inferInsert[]) {
  const ids = new Map<string, number>()
  const stalePendingIds: number[] = []
  const staleBefore = Date.now() - STALE_PENDING_MS
  for (const kind of ['movie', 'tv'] as const) {
    const tmdbIds = stubs.filter(stub => stub.kind === kind).map(stub => stub.tmdbId)
    for (const batch of chunks(tmdbIds)) {
      const rows = await withQuerySpan('select-import-titles', () => db
        .select({ id: titles.id, tmdbId: titles.tmdbId, state: titles.enrichmentState, updatedAt: titles.updatedAt })
        .from(titles)
        .where(and(eq(titles.kind, kind), inArray(titles.tmdbId, batch))))
      for (const row of rows) {
        ids.set(titleKey(kind, row.tmdbId), row.id)
        if (row.state === 'pending' && row.updatedAt && row.updatedAt.getTime() < staleBefore) stalePendingIds.push(row.id)
      }
    }
  }
  return { ids, stalePendingIds }
}

export async function queueEnrichment(titleIds: number[]): Promise<void> {
  for (const batch of chunks(titleIds, 500)) {
    await inngest.send(batch.map(titleId => ({ name: TITLE_ENRICH_EVENT, data: { titleId } })))
  }
}

export async function importPlays(userId: number, parsed: ParsedImport, source: WatchSource): Promise<ImportSummary> {
  const stubs = stubTitles(parsed.plays)
  const createdTitleIds: number[] = []
  for (const batch of chunks(stubs)) {
    const created = await withQuerySpan('insert-import-titles', () => db
      .insert(titles)
      .values(batch)
      .onConflictDoNothing({ target: [titles.kind, titles.tmdbId] })
      .returning({ id: titles.id }))
    createdTitleIds.push(...created.map(row => row.id))
  }
  const { ids, stalePendingIds } = await titleIdsFor(stubs)

  const rows = parsed.plays.map(play => ({
    userId,
    titleId: ids.get(titleKey(play.kind, play.tmdbId))!,
    season: play.season ?? null,
    number: play.number ?? null,
    watchedAt: play.watchedAt,
    watchedMinute: watchedMinuteOf(play.watchedAt),
    source
  }))
  let added = 0
  for (const batch of chunks(rows)) {
    const inserted = await withQuerySpan('insert-import-watches', () => db.insert(watches).values(batch).onConflictDoNothing().returning({ id: watches.id }))
    added += inserted.length
  }

  const toEnrich = [...new Set([...createdTitleIds, ...stalePendingIds])]
  await queueEnrichment(toEnrich)

  return { added, duplicates: rows.length - added, skipped: parsed.skipped, titlesQueued: toEnrich.length }
}

export async function failedTitleIdsFor(userId: number): Promise<number[]> {
  const rows = await withQuerySpan('select-failed-titles', () => db
    .selectDistinct({ id: titles.id })
    .from(titles)
    .innerJoin(watches, eq(watches.titleId, titles.id))
    .where(and(eq(watches.userId, userId), eq(titles.enrichmentState, 'failed'))))
  return rows.map(row => row.id)
}

export async function resetFailedTitles(titleIds: number[]): Promise<void> {
  for (const batch of chunks(titleIds)) {
    await withQuerySpan('reset-failed-titles', () => db
      .update(titles)
      .set({ enrichmentState: 'pending', enrichmentError: null, enrichedAt: null })
      .where(and(inArray(titles.id, batch), eq(titles.enrichmentState, 'failed'))))
  }
}
