import type { Episode, LibraryData, Title, WatchEvent } from './types'
import type { PersonDetail, SeasonDetail } from './details'
import { isSpecial } from './derive'

export type EpisodeWatchState = 'watched' | 'missing' | 'upcoming'

export interface EpisodeRow {
  episode: Episode
  state: EpisodeWatchState
  watchDates: string[]
}

export interface SeasonSummary {
  season: number
  isSpecials: boolean
  watchedCount: number
  airedCount: number
  totalCount: number
  upcomingCount: number
  missingCount: number
  complete: boolean
}

export interface EpisodeRange {
  season: number
  fromNumber: number
  toNumber: number
}

export interface TitleGaps {
  missingRanges: EpisodeRange[]
  notStartedSeasons: number[]
  nextUpcoming?: Episode
  caughtUp: boolean
}

export type CollectionMemberState = 'watched' | 'unwatched' | 'unreleased'

function byEpisodeOrder(first: Episode, second: Episode): number {
  return first.season - second.season || first.number - second.number
}

function newestFirst(first: string, second: string): number {
  return second.localeCompare(first)
}

function watchDatesByEpisodeId(data: LibraryData, titleId: string): Map<string, string[]> {
  const datesByEpisodeId = new Map<string, string[]>()
  for (const watch of data.watches) {
    if (watch.titleId !== titleId || !watch.episodeId) continue
    datesByEpisodeId.set(watch.episodeId, [...(datesByEpisodeId.get(watch.episodeId) ?? []), watch.watchedAt])
  }
  for (const dates of datesByEpisodeId.values()) dates.sort(newestFirst)
  return datesByEpisodeId
}

function rowsFor(episodes: Episode[], datesByEpisodeId: Map<string, string[]>, todayIso: string): EpisodeRow[] {
  return [...episodes].sort(byEpisodeOrder).map((episode) => {
    const watchDates = datesByEpisodeId.get(episode.id) ?? []
    const state: EpisodeWatchState = watchDates.length > 0 ? 'watched' : episode.airDate > todayIso ? 'upcoming' : 'missing'
    return { episode, state, watchDates }
  })
}

export function seasonName(season: number, seasonDetails?: SeasonDetail[]): string {
  return seasonDetails?.find(detail => detail.season === season)?.name ?? (season === 0 ? 'Specials' : `Season ${season}`)
}

export function seasonEpisodeRows(data: LibraryData, titleId: string, season: number, todayIso: string): EpisodeRow[] {
  const episodes = data.episodes.filter(episode => episode.titleId === titleId && episode.season === season)
  return rowsFor(episodes, watchDatesByEpisodeId(data, titleId), todayIso)
}

export function seasonSummaries(data: LibraryData, titleId: string, todayIso: string): SeasonSummary[] {
  const datesByEpisodeId = watchDatesByEpisodeId(data, titleId)
  const rows = rowsFor(data.episodes.filter(episode => episode.titleId === titleId), datesByEpisodeId, todayIso)
  const rowsBySeason = Map.groupBy(rows, row => row.episode.season)
  return [...rowsBySeason.entries()]
    .sort(([first], [second]) => (first === 0 ? 1 : second === 0 ? -1 : first - second))
    .map(([season, seasonRows]) => {
      const watchedCount = seasonRows.filter(row => row.state === 'watched').length
      const upcomingCount = seasonRows.filter(row => row.state === 'upcoming').length
      const missingCount = seasonRows.filter(row => row.state === 'missing').length
      return {
        season,
        isSpecials: season === 0,
        watchedCount,
        airedCount: seasonRows.filter(row => row.episode.airDate <= todayIso).length,
        totalCount: seasonRows.length,
        upcomingCount,
        missingCount,
        complete: missingCount === 0 && upcomingCount === 0
      }
    })
}

function collapseIntoRanges(season: number, missingNumbers: number[]): EpisodeRange[] {
  const ranges: EpisodeRange[] = []
  for (const number of missingNumbers) {
    const last = ranges.at(-1)
    if (last && number === last.toNumber + 1) last.toNumber = number
    else ranges.push({ season, fromNumber: number, toNumber: number })
  }
  return ranges
}

export function titleGaps(data: LibraryData, titleId: string, todayIso: string): TitleGaps {
  const regularEpisodes = data.episodes.filter(episode => episode.titleId === titleId && !isSpecial(episode))
  const rows = rowsFor(regularEpisodes, watchDatesByEpisodeId(data, titleId), todayIso)
  const rowsBySeason = [...Map.groupBy(rows, row => row.episode.season).entries()].sort(([first], [second]) => first - second)

  const missingRanges: EpisodeRange[] = []
  const notStartedSeasons: number[] = []
  let sawWatchedSeason = false
  const nextUpcoming = rows.find(row => row.state === 'upcoming')?.episode

  if (!rows.some(row => row.state === 'watched')) {
    return { missingRanges: [], notStartedSeasons: [], nextUpcoming, caughtUp: false }
  }

  for (const [season, seasonRows] of rowsBySeason) {
    const watchedCount = seasonRows.filter(row => row.state === 'watched').length
    const missingRows = seasonRows.filter(row => row.state === 'missing')
    if (watchedCount === 0 && missingRows.length > 0 && sawWatchedSeason) {
      notStartedSeasons.push(season)
    } else {
      missingRanges.push(...collapseIntoRanges(season, missingRows.map(row => row.episode.number)))
    }
    if (watchedCount > 0) sawWatchedSeason = true
  }

  return {
    missingRanges,
    notStartedSeasons,
    nextUpcoming,
    caughtUp: missingRanges.length === 0 && notStartedSeasons.length === 0
  }
}

export function movieWatches(data: LibraryData, titleId: string): WatchEvent[] {
  return data.watches
    .filter(watch => watch.titleId === titleId)
    .sort((first, second) => newestFirst(first.watchedAt, second.watchedAt))
}

export function collectionMembers(data: LibraryData, memberTmdbIds: number[], todayIso: string): { title: Title, state: CollectionMemberState }[] {
  const watchedTitleIds = new Set(data.watches.map(watch => watch.titleId))
  return memberTmdbIds
    .map(tmdbId => data.titles.find(title => title.tmdbId === tmdbId))
    .filter((title): title is Title => title !== undefined)
    .sort((first, second) => first.firstAired.localeCompare(second.firstAired))
    .map((title) => {
      const state: CollectionMemberState = watchedTitleIds.has(title.id) ? 'watched' : title.firstAired > todayIso ? 'unreleased' : 'unwatched'
      return { title, state }
    })
}

export function watchedTitlesForPerson(data: LibraryData, person: PersonDetail): Title[] {
  const watchedTitleIds = new Set(data.watches.map(watch => watch.titleId))
  return data.titles.filter((title) => {
    if (title.tmdbId === undefined || !watchedTitleIds.has(title.id)) return false
    const mediaType = title.type === 'movie' ? 'movie' : 'tv'
    return person.credits.some(credit => credit.tmdbId === title.tmdbId && credit.mediaType === mediaType)
  })
}
