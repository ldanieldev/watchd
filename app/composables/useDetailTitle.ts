import { titleDetailFor } from '~/utils/library/details'
import { seasonPath, titlePath } from '~/utils/library/paths'

export function useDetailTitle(expectedType: 'episodic' | 'movie') {
  const route = useRoute()
  const { data, summaries } = useLibrary()

  const initialTitle = data.value.titles.find(candidate => candidate.id === route.params.id)
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
    navigateTo(keepsSeason ? seasonPath(initialTitle, Number(rawSeason)) : titlePath(initialTitle), { redirectCode: 301, replace: true })
  }

  const title = computed(() => data.value.titles.find(candidate => candidate.id === route.params.id) ?? initialTitle)
  const summary = computed(() => summaries.value.find(candidate => candidate.title.id === title.value.id)!)
  const detail = computed(() => titleDetailFor(title.value.id))

  const season = computed(() => (typeof rawSeason === 'string' ? Number(rawSeason) : undefined))
  return { title, summary, detail, season }
}
