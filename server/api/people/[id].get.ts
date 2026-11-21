import { and, eq, inArray } from 'drizzle-orm'
import type { PersonDetail } from '~~/shared/types/library'
import { titles } from '~~/server/db/schema'
import { TmdbNotFoundError, tmdbGet } from '~~/server/utils/tmdb/client'
import { mapPerson, pickCredits, type RawPersonDetail } from '~~/server/utils/tmdb/mapPerson'

const fetchPerson = defineCachedFunction(
  async (personId: number): Promise<PersonDetail | null> => {
    try {
      return mapPerson(personId, await tmdbGet<RawPersonDetail>(`/person/${personId}`, { append_to_response: 'combined_credits' }))
    } catch (error) {
      if (error instanceof TmdbNotFoundError) return null
      throw error
    }
  },
  { name: 'tmdb-person', maxAge: 60 * 60 * 24 * 7, getKey: (personId: number) => String(personId) }
)

async function libraryCreditKeys(person: PersonDetail): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const kind of ['movie', 'tv'] as const) {
    const tmdbIds = person.credits.filter(credit => credit.mediaType === kind).map(credit => credit.tmdbId)
    if (!tmdbIds.length) continue
    const rows = await withQuerySpan('select-person-library-titles', () => db
      .select({ tmdbId: titles.tmdbId })
      .from(titles)
      .where(and(eq(titles.kind, kind), inArray(titles.tmdbId, tmdbIds))))
    for (const row of rows) keys.add(`${kind}-${row.tmdbId}`)
  }
  return keys
}

export default defineEventHandler(async (event): Promise<PersonDetail> => {
  await requireUserSession(event)

  const personId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(personId) || personId <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid person ID' })

  const person = await fetchPerson(personId)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'Person not found' })

  const inLibrary = await libraryCreditKeys(person)
  return { ...person, credits: pickCredits(person.credits, credit => inLibrary.has(`${credit.mediaType}-${credit.tmdbId}`)) }
})
