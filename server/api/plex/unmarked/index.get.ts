import { and, desc, eq, sql } from 'drizzle-orm'
import { plexUnmarked, titles, userTitles, watches } from '~~/server/db/schema'
import { loadPlexConnection } from '~~/server/utils/plex/connection'
import { PLEX_UNMARK_RETENTION_DAYS } from '~~/server/utils/plex/scan'
import { episodeCode } from '~~/shared/utils/library/derive'

const DAY_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const connection = await loadPlexConnection(user.id)
  if (!connection) return { items: [] }

  const rows = await withQuerySpan('select-plex-unmarked', () => db
    .select({
      id: plexUnmarked.id,
      titleName: titles.name,
      isAnime: titles.isAnime,
      typeOverride: userTitles.typeOverride,
      season: plexUnmarked.season,
      number: plexUnmarked.number,
      unmarkedAt: plexUnmarked.unmarkedAt,
      plays: sql<number>`(select count(*)::int from ${watches} where ${watches.userId} = ${user.id} and ${watches.deletedAt} is not null
        and ${watches.titleId} = ${plexUnmarked.titleId} and ${watches.season} is not distinct from ${plexUnmarked.season}
        and ${watches.number} is not distinct from ${plexUnmarked.number})`
    })
    .from(plexUnmarked)
    .innerJoin(titles, eq(titles.id, plexUnmarked.titleId))
    .leftJoin(userTitles, and(eq(userTitles.titleId, plexUnmarked.titleId), eq(userTitles.userId, user.id)))
    .where(eq(plexUnmarked.connectionId, connection.id))
    .orderBy(desc(plexUnmarked.unmarkedAt)))

  const now = Date.now()
  return {
    items: rows.map(row => ({
      id: row.id,
      titleName: row.titleName,
      ...(row.season !== null && row.number !== null && {
        episodeCode: episodeCode({ type: row.typeOverride ?? (row.isAnime ? 'anime' : 'tv') }, { season: row.season, number: row.number })
      }),
      plays: row.plays,
      unmarkedAt: row.unmarkedAt.toISOString(),
      daysLeft: Math.max(0, PLEX_UNMARK_RETENTION_DAYS - Math.floor((now - row.unmarkedAt.getTime()) / DAY_MS))
    }))
  }
})
