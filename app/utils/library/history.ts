import type { HistoryDay, HistoryEntry, LibraryData, TypeFilter } from './types'
import { minutesForWatch } from './watchTime'

function monthPrefix(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function matchingEntries(data: LibraryData, type: TypeFilter): HistoryEntry[] {
  const titlesById = new Map(data.titles.map(title => [title.id, title]))
  const episodesById = new Map(data.episodes.map(episode => [episode.id, episode]))
  return data.watches.flatMap((watch) => {
    const title = titlesById.get(watch.titleId)
    if (!title || (type !== 'all' && title.type !== type)) return []
    const episode = watch.episodeId ? episodesById.get(watch.episodeId) : undefined
    const runtime = title.runtimeMinutes
    const isPartial = watch.minutesWatched !== undefined && runtime !== undefined && watch.minutesWatched < runtime
    return [{
      title,
      episode,
      watchedAt: watch.watchedAt,
      minutes: minutesForWatch(watch, title, episode),
      progress: isPartial ? watch.minutesWatched! / runtime : undefined
    }]
  })
}

export function historyMonth(data: LibraryData, year: number, monthIndex: number, type: TypeFilter): HistoryDay[] {
  const prefix = monthPrefix(year, monthIndex)
  const days = new Map<string, HistoryEntry[]>()
  const entries = matchingEntries(data, type)
    .filter(entry => entry.watchedAt.startsWith(prefix))
    .sort((first, second) => second.watchedAt.localeCompare(first.watchedAt))
  for (const entry of entries) {
    const date = entry.watchedAt.slice(0, 10)
    days.set(date, [...(days.get(date) ?? []), entry])
  }
  return [...days].map(([date, dayEntries]) => ({
    date,
    entries: dayEntries,
    totalMinutes: dayEntries.reduce((sum, entry) => sum + entry.minutes, 0)
  }))
}

export function latestMonthWithWatches(data: LibraryData, type: TypeFilter): { year: number, monthIndex: number } | undefined {
  const latest = matchingEntries(data, type).reduce<string | undefined>((newest, entry) => (!newest || entry.watchedAt > newest ? entry.watchedAt : newest), undefined)
  return latest ? { year: Number(latest.slice(0, 4)), monthIndex: Number(latest.slice(5, 7)) - 1 } : undefined
}
