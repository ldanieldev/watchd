import type { CreditPerson, PersonDetail } from '../../types/library'
import type { HistoryDay, LibraryData, MediaType, RecentWatch, Release, Title, TitleStatus, TitleSummary, TypeFilter, WeekDay } from './types'
import type { CreditRole, Ranked, StatsRange, StatWatch } from './stats'
import { toZonedTimestamp } from '../zonedTime'
import { continueWatching, pickUpNext, recentlyWatched, releasesBetween, summarize, weekOf } from './derive'
import { historyMonth, latestMonthWithWatches } from './history'
import {
  averages, completedOfStarted, dailyMinutes, eraLeaders, featuredPerson, genreLeaders, highlights, minutesByHour, minutesByMonth,
  minutesByType, minutesByWeekday, mostActiveWeekday, mostPlayed, rhythm, roleLeaders, statsWindow, statusByType, statusCounts,
  statWatches, streaks, studioLeaders, totals
} from './stats'
import { toIsoDate } from './dates'

export function slimTitle(title: Title): Title {
  const { cast: _cast, crew: _crew, genres: _genres, studios: _studios, network: _network, ...slim } = title
  return slim
}

const slimSummary = (summary: TitleSummary): TitleSummary => ({ ...summary, title: slimTitle(summary.title) })
const slimRelease = (release: Release): Release => ({ ...release, title: slimTitle(release.title) })
const slimStatWatch = (watch: StatWatch): StatWatch => ({ ...watch, title: slimTitle(watch.title) })

/** The library with watch times as wall-clock strings in `timeZone`, the form every derive helper expects. */
export function inViewerZone(library: LibraryData, timeZone: string): LibraryData {
  return { ...library, watches: library.watches.map(watch => ({ ...watch, watchedAt: toZonedTimestamp(watch.watchedAt, timeZone) })) }
}

export interface HomeView {
  upNext?: TitleSummary
  week: WeekDay[]
  inProgress: TitleSummary[]
  recent: RecentWatch[]
}

export function homeView(library: LibraryData, today: Date): HomeView {
  const summaries = summarize(library, today)
  const upNext = pickUpNext(summaries)
  return {
    upNext: upNext && slimSummary(upNext),
    week: weekOf(library, today).map(day => ({ ...day, releases: day.releases.map(slimRelease) })),
    inProgress: continueWatching(summaries).map(slimSummary),
    recent: recentlyWatched(library).map(entry => ({ ...entry, title: slimTitle(entry.title) }))
  }
}

export function summariesView(library: LibraryData, type: MediaType, today: Date): TitleSummary[] {
  return summarize({ ...library, titles: library.titles.filter(title => title.type === type) }, today).map(slimSummary)
}

export function releasesView(library: LibraryData, from: string, to: string): Release[] {
  return releasesBetween(library, from, to).map(slimRelease)
}

export interface HistoryView {
  month: string
  latest?: string
  days: HistoryDay[]
}

const monthKey = (year: number, monthIndex: number) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`

export function historyView(library: LibraryData, month: string, type: TypeFilter, today: Date): HistoryView {
  const latestMonth = latestMonthWithWatches(library, type)
  const latest = latestMonth && monthKey(latestMonth.year, latestMonth.monthIndex)
  const shown = month === 'latest' ? latest ?? toIsoDate(today).slice(0, 7) : month
  const days = historyMonth(library, Number(shown.slice(0, 4)), Number(shown.slice(5, 7)) - 1, type)
    .map(day => ({ ...day, entries: day.entries.map(entry => ({ ...entry, title: slimTitle(entry.title) })) }))
  return { month: shown, latest, days }
}

type ByMetric<Metric extends string, T> = Record<Metric, Ranked<T>[]>

export interface StatsView {
  window: ReturnType<typeof statsWindow>
  total: ReturnType<typeof totals>
  previousTotal: ReturnType<typeof totals>
  highlights: { first?: StatWatch, last?: StatWatch, todayInHistory?: StatWatch }
  streak: ReturnType<typeof streaks>
  busiest: ReturnType<typeof mostActiveWeekday>
  completion: ReturnType<typeof completedOfStarted>
  average: ReturnType<typeof averages>
  featured: ReturnType<typeof featuredPerson>
  minutesByType: Record<MediaType, number>
  months: ReturnType<typeof minutesByMonth>
  weekdays: number[]
  hours: number[]
  rhythm: number[][]
  daily: ReturnType<typeof dailyMinutes>
  genres: ByMetric<'minutes' | 'plays', string>
  eras: ByMetric<'minutes' | 'plays', string>
  top: Record<MediaType, ReturnType<typeof mostPlayed>>
  people: Record<CreditRole, ByMetric<'plays' | 'titles', CreditPerson>>
  studios: ByMetric<'plays' | 'titles', string>
  statusCounts: Record<TitleStatus, number>
  statusByType: Record<MediaType, Record<TitleStatus, number>>
}

const PEOPLE_PER_SHELF = 8
const GENRE_BARS = 6

export function statsView(library: LibraryData, range: StatsRange, type: TypeFilter, today: Date): StatsView {
  const window = statsWindow(range, today, library)
  const watches = statWatches(library, type, window.from, window.to)
  const summaries = summarize(library, today)
  const found = highlights(library, watches, today)
  const featured = featuredPerson(watches)
  const people = (role: CreditRole) => ({
    plays: roleLeaders(watches, role, 'plays', PEOPLE_PER_SHELF),
    titles: roleLeaders(watches, role, 'titles', PEOPLE_PER_SHELF)
  })
  const top = (mediaType: MediaType) => mostPlayed(watches, mediaType).map(row => ({ ...row, title: slimTitle(row.title) }))

  return {
    window,
    total: totals(watches),
    previousTotal: totals(statWatches(library, type, window.previousFrom, window.previousTo)),
    highlights: {
      first: found.first && slimStatWatch(found.first),
      last: found.last && slimStatWatch(found.last),
      todayInHistory: found.todayInHistory && slimStatWatch(found.todayInHistory)
    },
    streak: streaks(watches, today),
    busiest: mostActiveWeekday(watches),
    completion: completedOfStarted(summaries, type),
    average: averages(watches, window),
    featured: featured && { ...featured, titles: featured.titles.map(slimTitle) },
    minutesByType: minutesByType(watches),
    months: minutesByMonth(watches, window),
    weekdays: minutesByWeekday(watches),
    hours: minutesByHour(watches),
    rhythm: rhythm(watches),
    daily: dailyMinutes(watches, window),
    genres: { minutes: genreLeaders(watches, 'minutes', GENRE_BARS), plays: genreLeaders(watches, 'plays', GENRE_BARS) },
    eras: { minutes: eraLeaders(watches, 'minutes', Number.POSITIVE_INFINITY), plays: eraLeaders(watches, 'plays', Number.POSITIVE_INFINITY) },
    top: { tv: top('tv'), anime: top('anime'), movie: top('movie') },
    people: { actor: people('actor'), director: people('director'), writer: people('writer') },
    studios: { plays: studioLeaders(watches, 'plays'), titles: studioLeaders(watches, 'titles') },
    statusCounts: statusCounts(summaries, type),
    statusByType: statusByType(summaries)
  }
}

/** One title's slice of the library for its detail page; a movie also carries its collection's other library movies. */
export function titleSlice(library: LibraryData, titleId: string, collectionTmdbIds: number[]): LibraryData | undefined {
  const title = library.titles.find(candidate => candidate.id === titleId)
  if (!title) return undefined
  const members = title.type === 'movie'
    ? library.titles.filter(candidate => candidate.type === 'movie' && candidate.id !== titleId && candidate.tmdbId !== undefined && collectionTmdbIds.includes(candidate.tmdbId))
    : []
  const titleIds = new Set([titleId, ...members.map(member => member.id)])
  return {
    titles: [title, ...members.map(slimTitle)],
    episodes: library.episodes.filter(episode => episode.titleId === titleId),
    watches: library.watches.filter(watch => titleIds.has(watch.titleId))
  }
}

export function personLibraryTitles(library: LibraryData, person: PersonDetail): Title[] {
  const creditKeys = new Set(person.credits.map(credit => `${credit.mediaType}-${credit.tmdbId}`))
  return library.titles
    .filter(title => title.tmdbId !== undefined && creditKeys.has(`${title.type === 'movie' ? 'movie' : 'tv'}-${title.tmdbId}`))
    .map(slimTitle)
}
