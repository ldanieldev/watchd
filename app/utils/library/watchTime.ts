import type { Episode, MediaType, Title, WatchEvent } from './types'
import { episodeDetailFor, titleDetailFor } from './details'

export const DEFAULT_RUNTIME_MINUTES: Record<MediaType, number> = { tv: 45, anime: 24, movie: 120 }

export function minutesForWatch(watch: WatchEvent, title: Title, episode?: Episode): number {
  if (watch.minutesWatched !== undefined) return watch.minutesWatched
  const episodeRuntime = episode ? episodeDetailFor(title.id, episode.season, episode.number)?.runtimeMinutes : undefined
  return episodeRuntime ?? title.runtimeMinutes ?? titleDetailFor(title.id)?.runtimeMinutes ?? DEFAULT_RUNTIME_MINUTES[title.type]
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)
  if (!hours) return `${remainder} min`
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`
}
