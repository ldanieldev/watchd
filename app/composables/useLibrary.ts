import type { Episode, LibraryData, MediaType, WatchEvent } from '~/utils/library/types'
import { continueWatching, isSpecial, pickUpNext, recentlyWatched, summarize, weekOf } from '~/utils/library/derive'
import { parseIsoDate } from '~/utils/library/dates'
import { todayIn, toZonedTimestamp, zonedTimeToUtc } from '~~/shared/utils/zonedTime'

const LIBRARY_STATE_KEY = 'library'
export const LIBRARY_DATA_KEY = 'library-data'

function emptyLibrary(): LibraryData {
  return { titles: [], episodes: [], watches: [] }
}

// Returns a flag and writes the payload into state, so SSR serializes the multi-MB library once rather than twice.
export async function loadLibrary(): Promise<void> {
  const stored = useState<LibraryData>(LIBRARY_STATE_KEY, emptyLibrary)
  const requestFetch = useRequestFetch()
  await useAsyncData(LIBRARY_DATA_KEY, async () => {
    stored.value = await requestFetch<LibraryData>('/api/library')
    return true
  })
}

function toPayload(watch: WatchEvent) {
  return {
    titleId: watch.titleId,
    ...(watch.episodeId ? { episodeId: watch.episodeId } : {}),
    watchedAt: new Date(watch.watchedAt).toISOString(),
    ...(watch.minutesWatched === undefined ? {} : { minutesWatched: watch.minutesWatched })
  }
}

const isSameWatch = (first: WatchEvent, second: WatchEvent) => first.titleId === second.titleId
  && first.episodeId === second.episodeId
  && first.watchedAt === second.watchedAt

// One chain for every save, so an undo can never reach the server before the save it undoes.
let saveQueue: Promise<unknown> = Promise.resolve()

export function whenLibrarySaved(): Promise<unknown> {
  return saveQueue
}

/**
 * The signed-in user's library. State stores watch times as UTC instants; `data` and every function here
 * speak wall-clock times in the viewer's zone (`YYYY-MM-DDTHH:mm:ss`), which is what the derive helpers expect.
 */
export function useLibrary() {
  const stored = useState<LibraryData>(LIBRARY_STATE_KEY, emptyLibrary)
  const timeZone = useLibraryTimeZone()
  const todayIso = useState('library-today', () => todayIn(timeZone.value))
  const today = computed(() => parseIsoDate(todayIso.value))
  const showApiError = useApiErrorToast()

  const toLocal = (watch: WatchEvent): WatchEvent => ({ ...watch, watchedAt: toZonedTimestamp(watch.watchedAt, timeZone.value) })
  const toStored = (watch: WatchEvent): WatchEvent => ({ ...watch, watchedAt: zonedTimeToUtc(watch.watchedAt, timeZone.value).toISOString() })

  const data = computed<LibraryData>(() => ({ ...stored.value, watches: stored.value.watches.map(toLocal) }))
  const summaries = computed(() => summarize(data.value, today.value))
  const upNext = computed(() => pickUpNext(summaries.value))
  const week = computed(() => weekOf(data.value, today.value))
  const inProgress = computed(() => continueWatching(summaries.value))
  const recent = computed(() => recentlyWatched(data.value))

  function storedMatching(isMatch: (localWatch: WatchEvent) => boolean): WatchEvent[] {
    return stored.value.watches.filter(watch => isMatch(toLocal(watch)))
  }

  function addLocally(watches: WatchEvent[]) {
    stored.value = { ...stored.value, watches: [...stored.value.watches, ...watches] }
  }

  function removeLocally(watches: WatchEvent[]) {
    stored.value = { ...stored.value, watches: stored.value.watches.filter(watch => !watches.some(removed => isSameWatch(removed, watch))) }
  }

  function persist(path: string, watches: WatchEvent[], revert: () => void, failureTitle: string) {
    if (!watches.length) return
    const body = { watches: watches.map(toPayload) }
    saveQueue = saveQueue.then(() => $fetch(path, { method: 'POST', body }).catch((error: unknown) => {
      revert()
      showApiError(error, failureTitle, 'The change was not saved. Try again.')
    }))
  }

  function appendWatches(watches: WatchEvent[]): WatchEvent[] {
    addLocally(watches)
    persist('/api/library/watches', watches, () => removeLocally(watches), 'Couldn\'t save watch')
    return watches.map(toLocal)
  }

  function deleteWatches(watches: WatchEvent[]): WatchEvent[] {
    removeLocally(watches)
    persist('/api/library/watches/delete', watches, () => addLocally(watches), 'Couldn\'t remove watch')
    return watches.map(toLocal)
  }

  function markWatched(titleId: string, episodeId?: string) {
    appendWatches([{ titleId, episodeId, watchedAt: new Date().toISOString() }])
  }

  function markEpisodes(episodes: Episode[]) {
    const watchedIds = new Set(stored.value.watches.map(watch => watch.episodeId))
    const watchedAt = new Date().toISOString()
    return appendWatches(episodes
      .filter(episode => episode.airDate <= todayIso.value && !watchedIds.has(episode.id))
      .map(episode => ({ titleId: episode.titleId, episodeId: episode.id, watchedAt })))
  }

  function markSeason(titleId: string, season: number) {
    return markEpisodes(stored.value.episodes.filter(episode => episode.titleId === titleId && episode.season === season))
  }

  function markThrough(titleId: string, episodeId: string) {
    const target = stored.value.episodes.find(episode => episode.id === episodeId)
    if (!target || isSpecial(target)) return []
    return markEpisodes(stored.value.episodes.filter(episode => episode.titleId === titleId
      && !isSpecial(episode)
      && (episode.season < target.season || (episode.season === target.season && episode.number <= target.number))))
  }

  function unmarkEpisode(episodeId: string) {
    return deleteWatches(stored.value.watches.filter(watch => watch.episodeId === episodeId))
  }

  function addMovieWatch(titleId: string, localWatchedAt?: string): WatchEvent {
    const watchedAt = localWatchedAt ? zonedTimeToUtc(localWatchedAt, timeZone.value).toISOString() : new Date().toISOString()
    return appendWatches([{ titleId, watchedAt }])[0]!
  }

  function removeWatch(titleId: string, localWatchedAt: string) {
    return deleteWatches(storedMatching(watch => watch.titleId === titleId && watch.watchedAt === localWatchedAt))
  }

  function discardWatches(localWatches: WatchEvent[]) {
    deleteWatches(storedMatching(watch => localWatches.some(discarded => isSameWatch(discarded, watch))))
  }

  function restoreWatches(localWatches: WatchEvent[]) {
    appendWatches(localWatches.map(toStored))
  }

  function setTitleType(titleId: string, type: MediaType) {
    stored.value = { ...stored.value, titles: stored.value.titles.map(title => (title.id === titleId ? { ...title, type } : title)) }
  }

  return { data, today, summaries, upNext, week, inProgress, recent, markWatched, markSeason, markThrough, unmarkEpisode, addMovieWatch, removeWatch, restoreWatches, discardWatches, setTitleType }
}
