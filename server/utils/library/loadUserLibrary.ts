import { eq, inArray } from 'drizzle-orm'
import { episodes, titles, userTitles, watches } from '~~/server/db/schema'
import type { LibraryData } from '~~/shared/utils/library/types'
import { toLibraryData } from '~~/server/utils/library/toLibraryData'

/** Every title the user has watched with all of its episodes, plus every watch as a UTC instant. */
export async function loadUserLibrary(userId: number): Promise<LibraryData> {
  const watchedTitleIds = db.selectDistinct({ titleId: watches.titleId }).from(watches).where(eq(watches.userId, userId))

  const [titleRows, episodeRows, watchRows, settingsRows] = await Promise.all([
    withQuerySpan('select-library-titles', () => db
      .select({
        id: titles.id, kind: titles.kind, tmdbId: titles.tmdbId, name: titles.name, firstAired: titles.firstAired,
        posterPath: titles.posterPath, backdropPath: titles.backdropPath, runtimeMinutes: titles.runtimeMinutes, isAnime: titles.isAnime,
        genres: titles.genres, studios: titles.studios, network: titles.network, cast: titles.cast, crew: titles.crew
      })
      .from(titles)
      .where(inArray(titles.id, watchedTitleIds))),
    withQuerySpan('select-library-episodes', () => db
      .select({
        titleId: episodes.titleId, season: episodes.season, number: episodes.number, airDate: episodes.airDate,
        name: episodes.name, runtimeMinutes: episodes.runtimeMinutes
      })
      .from(episodes)
      .where(inArray(episodes.titleId, watchedTitleIds))),
    withQuerySpan('select-library-watches', () => db
      .select({ titleId: watches.titleId, season: watches.season, number: watches.number, watchedAt: watches.watchedAt, minutesWatched: watches.minutesWatched })
      .from(watches)
      .where(eq(watches.userId, userId))),
    withQuerySpan('select-library-settings', () => db
      .select({ titleId: userTitles.titleId, typeOverride: userTitles.typeOverride, heldStatus: userTitles.heldStatus })
      .from(userTitles)
      .where(eq(userTitles.userId, userId)))
  ])

  return toLibraryData({ titles: titleRows, episodes: episodeRows, watches: watchRows, userTitles: settingsRows })
}
