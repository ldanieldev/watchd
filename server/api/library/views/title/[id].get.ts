import { eq } from 'drizzle-orm'
import type { LibraryData } from '~~/shared/utils/library/types'
import { titleSlice } from '~~/shared/utils/library/views'
import { titles } from '~~/server/db/schema'
import { loadUserLibrary } from '~~/server/utils/library/loadUserLibrary'

export default defineEventHandler(async (event): Promise<LibraryData> => {
  const { user } = await requireUserSession(event)

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid title ID' })

  const [library, [title]] = await Promise.all([
    loadUserLibrary(user.id),
    withQuerySpan('select-title-collection', () => db.select({ detail: titles.detail }).from(titles).where(eq(titles.id, id)))
  ])
  const slice = titleSlice(library, String(id), title?.detail?.collection?.memberTmdbIds ?? [])
  if (!slice) throw createError({ statusCode: 404, statusMessage: 'Title not found' })
  return slice
})
