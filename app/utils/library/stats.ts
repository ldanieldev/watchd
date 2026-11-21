import type { Episode, LibraryData, MediaType, Title, TitleStatus, TitleSummary, TypeFilter, WatchEvent } from './types'
import type { CreditPerson } from '~~/shared/types/library'
import { addDays, parseIsoDate, toIsoDate } from './dates'
import { minutesForWatch } from './watchTime'

export type StatsRange = '30d' | '90d' | '12m' | 'all'

export interface StatsWindow {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export interface StatWatch {
  watch: WatchEvent
  title: Title
  episode?: Episode
  minutes: number
  date: string
  hour: number
  weekday: number
}

const DAYS_PER_YEAR = 365.25
const DAY_MS = 86_400_000

function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS) + 1
}

function windowStart(range: StatsRange, today: Date, data: LibraryData): string {
  if (range === '30d') return toIsoDate(addDays(today, -29))
  if (range === '90d') return toIsoDate(addDays(today, -89))
  if (range === '12m') return toIsoDate(new Date(today.getFullYear(), today.getMonth() - 11, 1))
  const earliest = data.watches.reduce<string | undefined>((oldest, watch) => (!oldest || watch.watchedAt < oldest ? watch.watchedAt : oldest), undefined)
  return earliest ? earliest.slice(0, 10) : toIsoDate(today)
}

export function statsWindow(range: StatsRange, today: Date, data: LibraryData): StatsWindow {
  const from = windowStart(range, today, data)
  const to = toIsoDate(today)
  const length = daysBetweenInclusive(from, to)
  const previousTo = toIsoDate(addDays(parseIsoDate(from), -1))
  return { from, to, previousFrom: toIsoDate(addDays(parseIsoDate(from), -length)), previousTo }
}

export function statWatches(data: LibraryData, type: TypeFilter, from: string, to: string): StatWatch[] {
  const titlesById = new Map(data.titles.map(title => [title.id, title]))
  const episodesById = new Map(data.episodes.map(episode => [episode.id, episode]))
  return data.watches.flatMap((watch) => {
    const title = titlesById.get(watch.titleId)
    const date = watch.watchedAt.slice(0, 10)
    if (!title || (type !== 'all' && title.type !== type) || date < from || date > to) return []
    const episode = watch.episodeId ? episodesById.get(watch.episodeId) : undefined
    return [{
      watch,
      title,
      episode,
      minutes: minutesForWatch(watch, title, episode),
      date,
      hour: Number(watch.watchedAt.slice(11, 13)),
      weekday: (parseIsoDate(date).getDay() + 6) % 7
    }]
  })
}

function sumMinutes(watches: StatWatch[]): number {
  return watches.reduce((sum, watch) => sum + watch.minutes, 0)
}

export function totals(watches: StatWatch[]): { minutes: number, plays: number, titles: number } {
  return { minutes: sumMinutes(watches), plays: watches.length, titles: new Set(watches.map(watch => watch.title.id)).size }
}

export function minutesByType(watches: StatWatch[]): Record<MediaType, number> {
  const byType: Record<MediaType, number> = { tv: 0, anime: 0, movie: 0 }
  for (const watch of watches) byType[watch.title.type] += watch.minutes
  return byType
}

export function minutesByMonth(watches: StatWatch[], window: StatsWindow): { month: string, minutes: number }[] {
  const buckets = new Map<string, number>()
  const start = parseIsoDate(window.from)
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); toIsoDate(cursor) <= window.to; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    buckets.set(toIsoDate(cursor).slice(0, 7), 0)
  }
  for (const watch of watches) {
    const month = watch.date.slice(0, 7)
    if (buckets.has(month)) buckets.set(month, buckets.get(month)! + watch.minutes)
  }
  return [...buckets].map(([month, minutes]) => ({ month, minutes }))
}

export function minutesByWeekday(watches: StatWatch[]): number[] {
  const byWeekday = Array.from({ length: 7 }, () => 0)
  for (const watch of watches) byWeekday[watch.weekday]! += watch.minutes
  return byWeekday
}

export function minutesByHour(watches: StatWatch[]): number[] {
  const byHour = Array.from({ length: 24 }, () => 0)
  for (const watch of watches) byHour[watch.hour]! += watch.minutes
  return byHour
}

export function rhythm(watches: StatWatch[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const watch of watches) grid[watch.weekday]![watch.hour]! += watch.minutes
  return grid
}

export function dailyMinutes(watches: StatWatch[], window: StatsWindow): { date: string, minutes: number }[] {
  const byDate = new Map<string, number>()
  for (let cursor = parseIsoDate(window.from); toIsoDate(cursor) <= window.to; cursor = addDays(cursor, 1)) byDate.set(toIsoDate(cursor), 0)
  for (const watch of watches) {
    if (byDate.has(watch.date)) byDate.set(watch.date, byDate.get(watch.date)! + watch.minutes)
  }
  return [...byDate].map(([date, minutes]) => ({ date, minutes }))
}

export function streaks(watches: StatWatch[], today: Date): { current: number, longest: number } {
  const dates = new Set(watches.map(watch => watch.date))
  let cursor = dates.has(toIsoDate(today)) ? today : addDays(today, -1)
  let current = 0
  while (dates.has(toIsoDate(cursor))) {
    current++
    cursor = addDays(cursor, -1)
  }
  let longest = 0
  for (const date of dates) {
    if (dates.has(toIsoDate(addDays(parseIsoDate(date), -1)))) continue
    let run = 1
    while (dates.has(toIsoDate(addDays(parseIsoDate(date), run)))) run++
    longest = Math.max(longest, run)
  }
  return { current, longest }
}

export function mostActiveWeekday(watches: StatWatch[]): { weekday: number, share: number } | undefined {
  const total = sumMinutes(watches)
  if (!total) return undefined
  const byWeekday = minutesByWeekday(watches)
  const weekday = byWeekday.indexOf(Math.max(...byWeekday))
  return { weekday, share: byWeekday[weekday]! / total }
}

export function changePercent(current: number, previous: number): number | undefined {
  return previous ? ((current - previous) / previous) * 100 : undefined
}

export function averages(watches: StatWatch[], window: StatsWindow): { perYear: number, perMonth: number, perDay: number, playsPerDay: number } {
  const days = daysBetweenInclusive(window.from, window.to)
  const perDay = sumMinutes(watches) / days
  return { perYear: perDay * DAYS_PER_YEAR, perMonth: perDay * DAYS_PER_YEAR / 12, perDay, playsPerDay: watches.length / days }
}

export function highlights(data: LibraryData, watches: StatWatch[], today: Date): { first?: StatWatch, last?: StatWatch, todayInHistory?: StatWatch } {
  const byTime = [...watches].sort((first, second) => first.watch.watchedAt.localeCompare(second.watch.watchedAt))
  const todayIso = toIsoDate(today)
  const pastOnThisDay = statWatches(data, 'all', '0000-01-01', todayIso)
    .filter(watch => watch.date.slice(5) === todayIso.slice(5) && watch.date < todayIso.slice(0, 4))
    .sort((first, second) => second.watch.watchedAt.localeCompare(first.watch.watchedAt))
  const found: { first?: StatWatch, last?: StatWatch, todayInHistory?: StatWatch } = {}
  if (byTime.length) {
    found.first = byTime[0]
    found.last = byTime.at(-1)
  }
  if (pastOnThisDay.length) found.todayInHistory = pastOnThisDay[0]
  return found
}

export type CreditRole = 'actor' | 'director' | 'writer'

export interface Ranked<T> {
  item: T
  value: number
}

const WRITER_ROLES = new Set(['Screenplay', 'Writer', 'Novel', 'Creator'])
const STATUSES: TitleStatus[] = ['watching', 'completed', 'planned', 'paused', 'dropped']

function emptyStatusCounts(): Record<TitleStatus, number> {
  return Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<TitleStatus, number>
}

export function statusCounts(summaries: TitleSummary[], type: TypeFilter): Record<TitleStatus, number> {
  const counts = emptyStatusCounts()
  for (const summary of summaries) {
    if (type === 'all' || summary.title.type === type) counts[summary.status]++
  }
  return counts
}

export function statusByType(summaries: TitleSummary[]): Record<MediaType, Record<TitleStatus, number>> {
  return { tv: statusCounts(summaries, 'tv'), anime: statusCounts(summaries, 'anime'), movie: statusCounts(summaries, 'movie') }
}

export function completedOfStarted(summaries: TitleSummary[], type: TypeFilter): { completed: number, started: number } {
  const counts = statusCounts(summaries, type)
  return { completed: counts.completed, started: summaries.filter(summary => (type === 'all' || summary.title.type === type) && summary.status !== 'planned').length }
}

interface Tally<T> {
  item: T
  plays: number
  minutes: number
  titleIds: Set<string>
}

function tallyBy<T>(watches: StatWatch[], keysOf: (watch: StatWatch) => { key: string, item: T }[]): Tally<T>[] {
  const tallies = new Map<string, Tally<T>>()
  for (const watch of watches) {
    const seen = new Set<string>()
    for (const { key, item } of keysOf(watch)) {
      if (seen.has(key)) continue
      seen.add(key)
      const tally = tallies.get(key) ?? { item, plays: 0, minutes: 0, titleIds: new Set<string>() }
      tally.plays++
      tally.minutes += watch.minutes
      tally.titleIds.add(watch.title.id)
      tallies.set(key, tally)
    }
  }
  return [...tallies.values()]
}

function rank<T>(tallies: Tally<T>[], metric: 'plays' | 'titles' | 'minutes', labelOf: (item: T) => string, limit: number): Ranked<T>[] {
  const valueOf = (tally: Tally<T>) => (metric === 'titles' ? tally.titleIds.size : tally[metric])
  return tallies
    .map(tally => ({ item: tally.item, value: valueOf(tally) }))
    .sort((first, second) => second.value - first.value || labelOf(first.item).localeCompare(labelOf(second.item)))
    .slice(0, limit)
}

function creditsFor(watch: StatWatch, role: CreditRole): CreditPerson[] {
  const { cast = [], crew = [] } = watch.title
  if (role === 'actor') return cast
  return crew.filter(person => (role === 'director' ? person.role === 'Director' : WRITER_ROLES.has(person.role)))
}

function personKeys(people: CreditPerson[]): { key: string, item: CreditPerson }[] {
  return people.map(person => ({ key: String(person.personId), item: person }))
}

export function roleLeaders(watches: StatWatch[], role: CreditRole, metric: 'plays' | 'titles', limit = 5): Ranked<CreditPerson>[] {
  return rank(tallyBy(watches, watch => personKeys(creditsFor(watch, role))), metric, person => person.name, limit)
}

export function featuredPerson(watches: StatWatch[]): { person: CreditPerson, titles: Title[], movies: number, shows: number, playShare: number } | undefined {
  const tallies = tallyBy(watches, (watch) => {
    return personKeys([...(watch.title.cast ?? []), ...(watch.title.crew ?? [])])
  })
  const top = tallies.sort((first, second) => second.titleIds.size - first.titleIds.size || second.plays - first.plays || first.item.name.localeCompare(second.item.name))[0]
  if (!top) return undefined
  const titles = [...new Map(watches.filter(watch => top.titleIds.has(watch.title.id)).map(watch => [watch.title.id, watch.title])).values()]
  const movies = titles.filter(title => title.type === 'movie').length
  return { person: top.item, titles, movies, shows: titles.length - movies, playShare: top.plays / watches.length }
}

function nameKeys(names: string[]): { key: string, item: string }[] {
  return names.map(name => ({ key: name, item: name }))
}

export function studioLeaders(watches: StatWatch[], metric: 'plays' | 'titles', limit = 5): Ranked<string>[] {
  return rank(tallyBy(watches, (watch) => {
    const { network, studios = [] } = watch.title
    return nameKeys([...(network ? [network] : []), ...studios])
  }), metric, name => name, limit)
}

export function genreLeaders(watches: StatWatch[], metric: 'minutes' | 'plays', limit = 5): Ranked<string>[] {
  return rank(tallyBy(watches, watch => nameKeys(watch.title.genres ?? [])), metric, name => name, limit)
}

export function eraLeaders(watches: StatWatch[], metric: 'minutes' | 'plays', limit = 5): Ranked<string>[] {
  return rank(tallyBy(watches, watch => nameKeys([`${watch.title.firstAired.slice(0, 3)}0s`])), metric, name => name, limit)
}

export function mostPlayed(watches: StatWatch[], type: MediaType, limit = 5): { title: Title, minutes: number, plays: number }[] {
  return tallyBy(watches.filter(watch => watch.title.type === type), watch => [{ key: watch.title.id, item: watch.title }])
    .map(tally => ({ title: tally.item, minutes: tally.minutes, plays: tally.plays }))
    .sort((first, second) => second.minutes - first.minutes || first.title.name.localeCompare(second.title.name))
    .slice(0, limit)
}
