import { NonRetriableError } from 'inngest'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { episodes, titles, watches } from '../db/schema'
import { inngest } from '../utils/inngest/client'
import { TITLE_ENRICH_EVENT } from '../utils/import/writePlays'
import { TmdbNotFoundError, tmdbGet } from '../utils/tmdb/client'
import { absoluteEpisodeRemaps } from '../utils/tmdb/absoluteEpisodes'
import { mapMovie, mapTv, type MappedTitle, type RawMovie, type RawSeason, type RawTv } from '../utils/tmdb/mapTitle'

const EPISODE_CHUNK_SIZE = 500

async function fetchTitle(kind: 'movie' | 'tv', tmdbId: number): Promise<MappedTitle> {
  if (kind === 'tv') {
    const raw = await tmdbGet<RawTv>(`/tv/${tmdbId}`, { append_to_response: 'aggregate_credits,content_ratings' })
    const seasons: RawSeason[] = []
    for (const season of raw.seasons) seasons.push(await tmdbGet<RawSeason>(`/tv/${tmdbId}/season/${season.season_number}`))
    return mapTv(raw, seasons)
  }
  const raw = await tmdbGet<RawMovie>(`/movie/${tmdbId}`, { append_to_response: 'credits,release_dates' })
  const collection = raw.belongs_to_collection
    ? await tmdbGet<{ name: string, parts: { id: number }[] }>(`/collection/${raw.belongs_to_collection.id}`)
    : undefined
  return mapMovie(raw, collection && { name: collection.name, memberTmdbIds: collection.parts.map(part => part.id).sort((left, right) => left - right) })
}

async function writeTitle(titleId: number, mapped: MappedTitle): Promise<void> {
  const { episodes: mappedEpisodes, ...fields } = mapped
  await withQuerySpan('update-enriched-title', () => db.update(titles).set({
    ...fields,
    firstAired: fields.firstAired ?? null,
    posterPath: fields.posterPath ?? null,
    backdropPath: fields.backdropPath ?? null,
    runtimeMinutes: fields.runtimeMinutes ?? null,
    network: fields.network ?? null,
    enrichmentState: 'ready',
    enrichedAt: new Date(),
    enrichmentError: null
  }).where(eq(titles.id, titleId)))

  for (let start = 0; start < mappedEpisodes.length; start += EPISODE_CHUNK_SIZE) {
    const batch = mappedEpisodes.slice(start, start + EPISODE_CHUNK_SIZE).map(episode => ({
      titleId,
      season: episode.season,
      number: episode.number,
      tmdbEpisodeId: episode.tmdbEpisodeId,
      airDate: episode.airDate ?? null,
      name: episode.name,
      overview: episode.overview ?? null,
      stillPath: episode.stillPath ?? null,
      runtimeMinutes: episode.runtimeMinutes ?? null
    }))
    await withQuerySpan('upsert-episodes', () => db.insert(episodes).values(batch).onConflictDoUpdate({
      target: [episodes.titleId, episodes.season, episodes.number],
      set: {
        tmdbEpisodeId: sql`excluded.tmdb_episode_id`,
        airDate: sql`excluded.air_date`,
        name: sql`excluded.name`,
        overview: sql`excluded.overview`,
        stillPath: sql`excluded.still_path`,
        runtimeMinutes: sql`excluded.runtime_minutes`,
        updatedAt: new Date()
      }
    }))
  }
}

async function remapAbsoluteEpisodeWatches(titleId: number, mappedEpisodes: MappedTitle['episodes']): Promise<void> {
  const plays = await withQuerySpan('select-watched-episodes', () => db
    .selectDistinct({ season: watches.season, number: watches.number })
    .from(watches)
    .where(and(eq(watches.titleId, titleId), isNotNull(watches.season), isNotNull(watches.number))))
  const remaps = absoluteEpisodeRemaps(mappedEpisodes, plays as { season: number, number: number }[])
  for (const { from, to } of remaps) {
    // A watch already on the target episode at the same minute would break watches_dedup, so those are left behind and deleted as duplicates.
    await withQuerySpan('remap-absolute-episode-watches', () => db.execute(sql`
      update ${watches} w set season = ${to.season}, number = ${to.number}
      where w.title_id = ${titleId} and w.season = ${from.season} and w.number = ${from.number}
        and not exists (select 1 from ${watches} d where d.user_id = w.user_id and d.title_id = w.title_id
          and d.season = ${to.season} and d.number = ${to.number} and d.watched_minute = w.watched_minute)`))
    await withQuerySpan('delete-duplicate-remapped-watches', () => db.execute(sql`
      delete from ${watches} where title_id = ${titleId} and season = ${from.season} and number = ${from.number}`))
  }
}

async function markFailed(titleId: number, message: string): Promise<void> {
  await withQuerySpan('mark-title-failed', () => db.update(titles)
    .set({ enrichmentState: 'failed', enrichmentError: message.slice(0, 1000) })
    .where(eq(titles.id, titleId)))
}

export const enrichTitle = inngest.createFunction(
  {
    id: 'enrich-title',
    triggers: [{ event: TITLE_ENRICH_EVENT }],
    concurrency: { limit: 4 },
    throttle: { limit: 30, period: '10s' },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const titleId = Number((event.data.event.data as { titleId?: unknown }).titleId)
      if (Number.isInteger(titleId)) await markFailed(titleId, error.message)
    }
  },
  async ({ event, step }) => {
    const titleId = Number((event.data as { titleId?: unknown }).titleId)
    if (!Number.isInteger(titleId)) throw new NonRetriableError('event has no titleId')

    return step.run('fetch-and-store', async () => {
      const [title] = await withQuerySpan('select-title-to-enrich', () => db
        .select({ kind: titles.kind, tmdbId: titles.tmdbId })
        .from(titles)
        .where(eq(titles.id, titleId)))
      if (!title) throw new NonRetriableError(`title ${titleId} does not exist`)

      let mapped: MappedTitle
      try {
        mapped = await fetchTitle(title.kind, title.tmdbId)
      } catch (error) {
        if (error instanceof TmdbNotFoundError) {
          await markFailed(titleId, error.message)
          throw new NonRetriableError(error.message)
        }
        throw error
      }
      await writeTitle(titleId, mapped)
      if (title.kind === 'tv') await remapAbsoluteEpisodeWatches(titleId, mapped.episodes)
      return { titleId, episodes: mapped.episodes.length }
    })
  }
)
