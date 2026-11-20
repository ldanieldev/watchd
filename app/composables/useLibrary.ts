import type { Episode, LibraryData, WatchEvent } from '~/utils/library/types'
import { buildFixtures } from '~/utils/library/fixtures'
import { continueWatching, isSpecial, pickUpNext, recentlyWatched, summarize, weekOf } from '~/utils/library/derive'
import { parseIsoDate, toIsoDate } from '~/utils/library/dates'

export function useLibrary() {
  const todayIso = useState('library-today', () => toIsoDate(new Date()))
  const today = parseIsoDate(todayIso.value)
  const data = useState<LibraryData>('library', () => buildFixtures(today))

  const summaries = computed(() => summarize(data.value, today))
  const upNext = computed(() => pickUpNext(summaries.value))
  const week = computed(() => weekOf(data.value, today))
  const inProgress = computed(() => continueWatching(summaries.value))
  const recent = computed(() => recentlyWatched(data.value))

  function localTimestampNow() {
    return `${toIsoDate(new Date())}T${new Date().toTimeString().slice(0, 8)}`
  }

  function appendWatches(watches: WatchEvent[]) {
    data.value = { ...data.value, watches: [...data.value.watches, ...watches] }
  }

  function markWatched(titleId: string, episodeId?: string) {
    appendWatches([{ titleId, episodeId, watchedAt: localTimestampNow() }])
  }

  function markEpisodes(episodes: Episode[]) {
    const watchedIds = new Set(data.value.watches.map(watch => watch.episodeId))
    const watchedAt = localTimestampNow()
    const additions = episodes
      .filter(episode => episode.airDate <= todayIso.value && !watchedIds.has(episode.id))
      .map(episode => ({ titleId: episode.titleId, episodeId: episode.id, watchedAt }))
    appendWatches(additions)
    return additions
  }

  function markSeason(titleId: string, season: number) {
    return markEpisodes(data.value.episodes.filter(episode => episode.titleId === titleId && episode.season === season))
  }

  function markThrough(titleId: string, episodeId: string) {
    const target = data.value.episodes.find(episode => episode.id === episodeId)
    if (!target || isSpecial(target)) return []
    return markEpisodes(data.value.episodes.filter(episode => episode.titleId === titleId
      && !isSpecial(episode)
      && (episode.season < target.season || (episode.season === target.season && episode.number <= target.number))))
  }

  function unmarkEpisode(episodeId: string) {
    const removed = data.value.watches.filter(watch => watch.episodeId === episodeId)
    data.value = { ...data.value, watches: data.value.watches.filter(watch => watch.episodeId !== episodeId) }
    return removed
  }

  function addMovieWatch(titleId: string, watchedAt = localTimestampNow()) {
    appendWatches([{ titleId, watchedAt }])
  }

  function removeWatch(titleId: string, watchedAt: string) {
    const isRemoved = (watch: WatchEvent) => watch.titleId === titleId && watch.watchedAt === watchedAt
    const removed = data.value.watches.filter(isRemoved)
    data.value = { ...data.value, watches: data.value.watches.filter(watch => !isRemoved(watch)) }
    return removed
  }

  function discardWatches(watches: WatchEvent[]) {
    const isDiscarded = (watch: WatchEvent) => watches.some(discarded => discarded.titleId === watch.titleId
      && discarded.episodeId === watch.episodeId
      && discarded.watchedAt === watch.watchedAt)
    data.value = { ...data.value, watches: data.value.watches.filter(watch => !isDiscarded(watch)) }
  }

  function restoreWatches(watches: WatchEvent[]) {
    appendWatches(watches)
  }

  return { data, today, summaries, upNext, week, inProgress, recent, markWatched, markSeason, markThrough, unmarkEpisode, addMovieWatch, removeWatch, restoreWatches, discardWatches }
}
