import { and, eq, isNull } from 'drizzle-orm'
import { episodes, titles, userTitles, watches } from '~~/server/db/schema'
import type { LibraryData } from '~~/shared/utils/library/types'
import { inUserLibrary } from '~~/server/utils/library/libraryTitleCondition'
import { toLibraryData } from '~~/server/utils/library/toLibraryData'

/** Every title the user has watched or has in Plex, with all of its episodes, plus every watch as a UTC instant. */
export async function loadUserLibrary(userId: number): Promise<LibraryData> {
  const [titleRows, episodeRows, watchRows, settingsRows] = await Promise.all([
    withQuerySpan('select-library-titles', () => db
      .select({
        id: titles.id, kind: titles.kind, tmdbId: titles.tmdbId, name: titles.name, firstAired: titles.firstAired,
        posterPath: titles.posterPath, backdropPath: titles.backdropPath, runtimeMinutes: titles.runtimeMinutes, isAnime: titles.isAnime,
        genres: titles.genres, studios: titles.studios, network: titles.network, cast: titles.cast, crew: titles.crew
      })
      .from(titles)
      .where(inUserLibrary(titles.id, userId))),
    withQuerySpan('select-library-episodes', () => db
      .select({
        titleId: episodes.titleId, season: episodes.season, number: episodes.number, airDate: episodes.airDate,
        name: episodes.name, runtimeMinutes: episodes.runtimeMinutes
      })
      .from(episodes)
      .where(inUserLibrary(episodes.titleId, userId))),
    withQuerySpan('select-library-watches', () => db
      .select({ titleId: watches.titleId, season: watches.season, number: watches.number, watchedAt: watches.watchedAt, minutesWatched: watches.minutesWatched })
      .from(watches)
      .where(and(eq(watches.userId, userId), isNull(watches.deletedAt)))),
    withQuerySpan('select-library-settings', () => db
      .select({ titleId: userTitles.titleId, typeOverride: userTitles.typeOverride, heldStatus: userTitles.heldStatus })
      .from(userTitles)
      .where(eq(userTitles.userId, userId)))
  ])

  return toLibraryData({ titles: titleRows, episodes: episodeRows, watches: watchRows, userTitles: settingsRows })
}
