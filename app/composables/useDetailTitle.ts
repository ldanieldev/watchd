import type { TitleDetail } from '~~/shared/types/library'
import type { LibraryData } from '~~/shared/utils/library/types'
import { seasonPath, titlePath } from '~/utils/library/paths'

export async function useDetailTitle(expectedType: 'episodic' | 'movie') {
  const nuxtApp = useNuxtApp()
  const route = useRoute()
  const titleId = String(route.params.id)

  const sliceRequest = useFetch<LibraryData>(`/api/library/views/title/${titleId}`, { key: `title-library-${titleId}`, default: emptyLibrary })
  const detailRequest = useFetch<TitleDetail>(`/api/library/titles/${titleId}`, { key: `title-detail-${titleId}` })
  const library = createLibraryStore(sliceRequest.data)
  // provide() needs the component instance and navigateTo() the Nuxt context, and a nested composable loses both at its first await.
  provideLibrary(library)
  await Promise.all([sliceRequest, detailRequest])
  const sliceStatus = sliceRequest.error.value?.statusCode
  if (sliceStatus && sliceStatus !== 400 && sliceStatus !== 404) throw createError({ statusCode: sliceStatus, statusMessage: 'Couldn\'t load this title' })

  const { data, summaries } = library
  const initialTitle = data.value.titles.find(candidate => candidate.id === titleId)
  if (!initialTitle) throw createError({ statusCode: 404, statusMessage: 'Title not found' })

  const rawSeason = route.params.season
  const isExpectedType = expectedType === 'movie' ? initialTitle.type === 'movie' : initialTitle.type !== 'movie'
  const isCanonicalSection = route.path === titlePath(initialTitle) || route.path.startsWith(`${titlePath(initialTitle)}/`)
  if (isExpectedType && typeof rawSeason === 'string') {
    const isValidSeason = /^\d+$/.test(rawSeason) && data.value.episodes.some(episode => episode.titleId === initialTitle.id && episode.season === Number(rawSeason))
    if (!isValidSeason) throw createError({ statusCode: 404, statusMessage: 'Season not found' })
  }

  const isCanonical = isExpectedType && isCanonicalSection
  if (!isCanonical) {
    const keepsSeason = isExpectedType && typeof rawSeason === 'string'
    nuxtApp.runWithContext(() => navigateTo(keepsSeason ? seasonPath(initialTitle, Number(rawSeason)) : titlePath(initialTitle), { redirectCode: 301, replace: true }))
  }

  const title = computed(() => data.value.titles.find(candidate => candidate.id === titleId) ?? initialTitle)
  const summary = computed(() => summaries.value.find(candidate => candidate.title.id === title.value.id)!)
  const detail = computed(() => detailRequest.data.value ?? undefined)

  const season = computed(() => (typeof rawSeason === 'string' ? Number(rawSeason) : undefined))
  return { title, summary, detail, season }
}
