import { libraryTitlesIndex } from '~~/server/utils/search/meili'
import type { SearchCategory, SearchHit } from '~~/shared/types/search'

const CATEGORIES: readonly SearchCategory[] = ['all', 'movie', 'tv', 'anime']
const MAX_QUERY_LENGTH = 200
const MAX_HITS = 8

interface MatchPosition { indices?: number[] }

export default defineEventHandler(async (event): Promise<SearchHit[]> => {
  const { user } = await requireUserSession(event)
  const { q, category = 'all' } = getQuery(event)

  if (typeof category !== 'string' || !CATEGORIES.includes(category as SearchCategory)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown category' })
  }
  const text = typeof q === 'string' ? q.trim().slice(0, MAX_QUERY_LENGTH) : ''
  if (!text) return []

  const filter = category === 'all' ? `userId = ${user.id}` : `userId = ${user.id} AND category = "${category}"`

  try {
    const { hits } = await libraryTitlesIndex().search(text, { filter, limit: MAX_HITS, showMatchesPosition: true })
    return hits.map((hit) => {
      const matches = (hit._matchesPosition ?? {}) as Record<string, MatchPosition[] | undefined>
      return {
        titleId: String(hit.titleId),
        type: hit.category,
        name: hit.name,
        year: hit.year,
        posterPath: hit.posterPath,
        matchedAlias: matches.name ? null : matchedAlias(hit.originalName, hit.alternativeNames, matches)
      }
    })
  } catch (cause) {
    // The Nitro error hook already logs every 5xx, so the cause rides on the error instead of a second log line.
    throw createError({ statusCode: 503, statusMessage: 'Search is unavailable', cause })
  }
})

function matchedAlias(originalName: string | null, alternativeNames: string[], matches: Record<string, MatchPosition[] | undefined>): string | null {
  if (matches.originalName && originalName) return originalName
  const index = matches.alternativeNames?.[0]?.indices?.[0]
  return index === undefined ? null : alternativeNames[index] ?? null
}
