import type { LibraryData } from '~/utils/library/types'
import { buildFixtures } from '~/utils/library/fixtures'
import { continueWatching, pickUpNext, recentlyWatched, summarize, weekOf } from '~/utils/library/derive'
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

  function markWatched(titleId: string, episodeId?: string) {
    const watchedAt = `${toIsoDate(new Date())}T${new Date().toTimeString().slice(0, 8)}`
    data.value = { ...data.value, watches: [...data.value.watches, { titleId, episodeId, watchedAt }] }
  }

  return { data, today, summaries, upNext, week, inProgress, recent, markWatched }
}
