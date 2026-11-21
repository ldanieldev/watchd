import type { Episode, Group, LibraryData, RecentWatch, Release, Title, TitleStatus, TitleSummary, WatchEvent, WeekDay } from './types'
import { addDays, monthName, parseIsoDate, startOfWeekMonday, toIsoDate } from './dates'

function latestWatchedAt(watches: WatchEvent[]): string | undefined {
  return watches.reduce<string | undefined>((latest, watch) => (!latest || watch.watchedAt > latest ? watch.watchedAt : latest), undefined)
}

function byEpisodeOrder(first: Episode, second: Episode): number {
  return first.season - second.season || first.number - second.number
}

export function isSpecial(episode: Episode): boolean {
  return episode.season === 0
}

function summarizeMovie(title: Title, watches: WatchEvent[]): TitleSummary {
  const lastWatchedAt = latestWatchedAt(watches)
  const latest = watches.find(watch => watch.watchedAt === lastWatchedAt)
  const runtime = title.runtimeMinutes ?? 0
  const isPartial = latest?.minutesWatched !== undefined && latest.minutesWatched < runtime
  const derivedStatus: TitleStatus = !latest ? 'planned' : isPartial ? 'watching' : 'completed'
  const finishedCount = watches.filter(watch => watch.minutesWatched === undefined || watch.minutesWatched >= runtime).length

  return {
    title,
    status: title.heldStatus ?? derivedStatus,
    watchedCount: finishedCount > 0 ? 1 : 0,
    airedCount: 1,
    totalCount: 1,
    newCount: 0,
    progress: !latest ? 0 : isPartial && runtime > 0 ? latest.minutesWatched! / runtime : 1,
    timesWatched: finishedCount,
    lastWatchedAt,
    minutesLeft: isPartial ? runtime - latest.minutesWatched! : undefined
  }
}

function summarizeEpisodic(title: Title, episodes: Episode[], watches: WatchEvent[], todayIso: string): TitleSummary {
  const watchedIds = new Set(watches.map(watch => watch.episodeId))
  const ordered = episodes.filter(episode => !isSpecial(episode)).sort(byEpisodeOrder)
  const aired = ordered.filter(episode => episode.airDate <= todayIso)
  const watchedCount = ordered.filter(episode => watchedIds.has(episode.id)).length
  const unwatchedAired = aired.filter(episode => !watchedIds.has(episode.id))
  const regularEpisodeIds = new Set(ordered.map(episode => episode.id))
  const derivedStatus: TitleStatus = watchedCount === 0
    ? 'planned'
    : watchedCount === ordered.length ? 'completed' : 'watching'

  return {
    title,
    status: title.heldStatus ?? derivedStatus,
    watchedCount,
    airedCount: aired.length,
    totalCount: ordered.length,
    newCount: unwatchedAired.length,
    progress: ordered.length === 0 ? 0 : watchedCount / ordered.length,
    timesWatched: derivedStatus === 'completed' ? 1 : 0,
    lastWatchedAt: latestWatchedAt(watches.filter(watch => watch.episodeId !== undefined && regularEpisodeIds.has(watch.episodeId))),
    nextEpisode: unwatchedAired[0]
  }
}

export function summarize(data: LibraryData, now: Date): TitleSummary[] {
  const todayIso = toIsoDate(now)
  const watchesByTitle = Map.groupBy(data.watches, watch => watch.titleId)
  const episodesByTitle = Map.groupBy(data.episodes, episode => episode.titleId)
  return data.titles.map((title) => {
    const watches = watchesByTitle.get(title.id) ?? []
    if (title.type === 'movie') {
      return summarizeMovie(title, watches)
    }
    return summarizeEpisodic(title, episodesByTitle.get(title.id) ?? [], watches, todayIso)
  })
}

export function pickUpNext(summaries: TitleSummary[]): TitleSummary | undefined {
  return summaries
    .filter(summary => summary.title.type !== 'movie' && summary.newCount > 0 && summary.lastWatchedAt && !summary.title.heldStatus)
    .sort((first, second) => second.lastWatchedAt!.localeCompare(first.lastWatchedAt!))[0]
}

export function releasesBetween(data: LibraryData, from: string, to: string): Release[] {
  const titlesById = new Map(data.titles.map(title => [title.id, title]))
  const watchedEpisodeIds = new Set(data.watches.map(watch => watch.episodeId).filter(Boolean))
  const watchedTitleIds = new Set(data.watches.map(watch => watch.titleId))
  const inRange = (date: string) => date >= from && date <= to

  const episodeReleases = data.episodes
    .filter(episode => !isSpecial(episode) && inRange(episode.airDate) && titlesById.has(episode.titleId))
    .map(episode => ({ title: titlesById.get(episode.titleId)!, episode, date: episode.airDate, watched: watchedEpisodeIds.has(episode.id) }))
  const movieReleases = data.titles
    .filter(title => title.type === 'movie' && inRange(title.firstAired))
    .map(title => ({ title, date: title.firstAired, watched: watchedTitleIds.has(title.id) }))

  return [...episodeReleases, ...movieReleases]
    .sort((first, second) => first.date.localeCompare(second.date) || first.title.name.localeCompare(second.title.name))
}

export function weekOf(data: LibraryData, today: Date): WeekDay[] {
  const todayIso = toIsoDate(today)
  const days = Array.from({ length: 7 }, (_, offset) => toIsoDate(addDays(startOfWeekMonday(today), offset)))
  const releases = releasesBetween(data, days[0]!, days[6]!)
  return days.map(date => ({
    date,
    isToday: date === todayIso,
    isPast: date < todayIso,
    releases: releases.filter(release => release.date === date)
  }))
}

export function continueWatching(summaries: TitleSummary[]): TitleSummary[] {
  return summaries
    .filter(summary => summary.status === 'watching' && summary.lastWatchedAt)
    .sort((first, second) => second.lastWatchedAt!.localeCompare(first.lastWatchedAt!))
}

export function recentlyWatched(data: LibraryData, limit = 12): RecentWatch[] {
  const titlesById = new Map(data.titles.map(title => [title.id, title]))
  const episodesById = new Map(data.episodes.map(episode => [episode.id, episode]))
  const seenTitleIds = new Set<string>()
  return data.watches
    .filter((watch) => {
      const title = titlesById.get(watch.titleId)
      return title && (watch.minutesWatched === undefined || watch.minutesWatched >= (title.runtimeMinutes ?? 0))
    })
    .sort((first, second) => second.watchedAt.localeCompare(first.watchedAt))
    .filter((watch) => {
      if (seenTitleIds.has(watch.titleId)) return false
      seenTitleIds.add(watch.titleId)
      return true
    })
    .slice(0, limit)
    .map(watch => ({
      title: titlesById.get(watch.titleId)!,
      episode: watch.episodeId ? episodesById.get(watch.episodeId) : undefined,
      watchedAt: watch.watchedAt
    }))
}

function periodLabel(isoDate: string | undefined, now: Date): string {
  if (!isoDate) return 'Not started'
  const todayIso = toIsoDate(now)
  const day = isoDate.slice(0, 10)
  if (day > todayIso) return 'Upcoming'
  if (day >= toIsoDate(startOfWeekMonday(now))) return 'This week'
  const date = parseIsoDate(day)
  if (date.getFullYear() !== now.getFullYear()) return String(date.getFullYear())
  if (date.getMonth() === now.getMonth()) return `Earlier in ${monthName(date)}`
  return monthName(date)
}

function collectGroups<T>(items: T[], labelOf: (item: T) => string): Group<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const label = labelOf(item)
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return [...groups].map(([label, groupItems]) => ({ label, items: groupItems }))
}

export function groupByPeriod<T>(items: T[], dateOf: (item: T) => string | undefined, now: Date): Group<T>[] {
  const sorted = [...items].sort((first, second) => {
    const firstDate = dateOf(first)
    const secondDate = dateOf(second)
    if (!firstDate || !secondDate) return firstDate ? -1 : secondDate ? 1 : 0
    return secondDate.localeCompare(firstDate)
  })
  return collectGroups(sorted, item => periodLabel(dateOf(item), now))
}

export function groupByLetter<T>(items: T[], nameOf: (item: T) => string): Group<T>[] {
  const letterOf = (item: T) => {
    const first = nameOf(item).charAt(0).toUpperCase()
    return /[A-Z]/.test(first) ? first : '#'
  }
  const sorted = [...items].sort((first, second) => {
    const firstLetter = letterOf(first)
    const secondLetter = letterOf(second)
    if (firstLetter !== secondLetter) return firstLetter === '#' ? -1 : secondLetter === '#' ? 1 : firstLetter.localeCompare(secondLetter)
    return nameOf(first).localeCompare(nameOf(second))
  })
  return collectGroups(sorted, letterOf)
}

export function monthGrid(year: number, monthIndex: number): { date: string, inMonth: boolean }[][] {
  const lastOfMonth = new Date(year, monthIndex + 1, 0)
  const weeks: { date: string, inMonth: boolean }[][] = []
  for (let weekStart = startOfWeekMonday(new Date(year, monthIndex, 1)); weekStart <= lastOfMonth; weekStart = addDays(weekStart, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(weekStart, offset)
      return { date: toIsoDate(date), inMonth: date.getMonth() === monthIndex }
    }))
  }
  return weeks
}

export function episodeCode(title: Pick<Title, 'type'>, episode: Pick<Episode, 'season' | 'number'>): string {
  if (title.type === 'anime' && episode.season === 1) return `E${episode.number}`
  return `S${episode.season}E${episode.number}`
}
