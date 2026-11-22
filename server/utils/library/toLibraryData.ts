import type { CreditPerson } from '../../../shared/types/library'
import type { Episode, LibraryData, Title, WatchEvent } from '~~/shared/utils/library/types'
import type { TitleKind } from '../../db/schema/library'
import { effectiveTitleType } from './effectiveTitleType'

export interface LibraryRows {
  titles: {
    id: number
    kind: TitleKind
    tmdbId: number
    name: string
    firstAired: string | null
    posterPath: string | null
    backdropPath: string | null
    runtimeMinutes: number | null
    isAnime: boolean
    genres: string[]
    studios: string[]
    network: string | null
    cast: CreditPerson[]
    crew: CreditPerson[]
  }[]
  episodes: { titleId: number, season: number, number: number, airDate: string | null, name: string | null, runtimeMinutes: number | null }[]
  watches: { titleId: number, season: number | null, number: number | null, watchedAt: Date, minutesWatched: number | null }[]
  userTitles: { titleId: number, typeOverride: 'tv' | 'anime' | null, heldStatus: 'paused' | 'dropped' | null }[]
}

export function episodeIdOf(titleId: number | string, season: number, number: number): string {
  return `${titleId}-${season}-${number}`
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)) as T
}

export function toLibraryData(rows: LibraryRows): LibraryData {
  const settingsByTitle = new Map(rows.userTitles.map(settings => [settings.titleId, settings]))

  const titles: Title[] = rows.titles.map((row) => {
    const settings = settingsByTitle.get(row.id)
    return compact({
      id: String(row.id),
      type: effectiveTitleType(row.kind, row.isAnime, settings?.typeOverride),
      name: row.name,
      tmdbId: row.tmdbId,
      firstAired: row.firstAired ?? '',
      posterPath: row.posterPath ?? '',
      backdropPath: row.backdropPath,
      runtimeMinutes: row.runtimeMinutes,
      heldStatus: settings?.heldStatus,
      genres: row.genres,
      studios: row.studios,
      network: row.network,
      cast: row.cast,
      crew: row.crew
    }) as Title
  })

  const episodes: Episode[] = rows.episodes.map(row => compact({
    id: episodeIdOf(row.titleId, row.season, row.number),
    titleId: String(row.titleId),
    season: row.season,
    number: row.number,
    airDate: row.airDate ?? '',
    name: row.name,
    runtimeMinutes: row.runtimeMinutes
  }) as Episode)

  const knownEpisodeIds = new Set(episodes.map(episode => episode.id))
  const stubs = new Map<string, Episode>()
  const watches: WatchEvent[] = rows.watches.map((row) => {
    const watchedAt = row.watchedAt.toISOString()
    const event: WatchEvent = { titleId: String(row.titleId), watchedAt }
    if (row.season !== null && row.number !== null) {
      const episodeId = episodeIdOf(row.titleId, row.season, row.number)
      event.episodeId = episodeId
      const airDate = watchedAt.slice(0, 10)
      const stub = stubs.get(episodeId)
      if (!knownEpisodeIds.has(episodeId) && (!stub || airDate < stub.airDate)) {
        stubs.set(episodeId, { id: episodeId, titleId: String(row.titleId), season: row.season, number: row.number, airDate })
      }
    }
    if (row.minutesWatched !== null) event.minutesWatched = row.minutesWatched
    return event
  })

  return { titles, episodes: [...episodes, ...stubs.values()], watches }
}
