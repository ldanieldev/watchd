import { asc, eq } from 'drizzle-orm'
import type { EpisodeDetail, TitleDetail } from '~~/shared/types/library'
import { episodes, titles } from '~~/server/db/schema'

export default defineEventHandler(async (event): Promise<TitleDetail> => {
  await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid title ID' })

  const [title] = await withQuerySpan('select-title-detail', () => db.select().from(titles).where(eq(titles.id, id)))
  if (!title) throw createError({ statusCode: 404, statusMessage: 'Title not found' })

  const episodeRows = await withQuerySpan('select-title-episodes', () => db
    .select()
    .from(episodes)
    .where(eq(episodes.titleId, id))
    .orderBy(asc(episodes.season), asc(episodes.number)))

  const detail = title.detail ?? { overview: '', status: title.tmdbStatus ?? '', languages: [], seasons: [] }
  return {
    ...detail,
    titleId: String(title.id),
    tmdbId: title.tmdbId,
    genres: title.genres,
    network: title.network ?? undefined,
    studios: title.studios,
    runtimeMinutes: title.runtimeMinutes ?? undefined,
    cast: title.cast,
    crew: title.crew,
    episodes: episodeRows.map((row): EpisodeDetail => ({
      season: row.season,
      number: row.number,
      name: row.name ?? '',
      airDate: row.airDate ?? undefined,
      overview: row.overview ?? undefined,
      stillPath: row.stillPath ?? undefined,
      runtimeMinutes: row.runtimeMinutes ?? undefined
    }))
  }
})
