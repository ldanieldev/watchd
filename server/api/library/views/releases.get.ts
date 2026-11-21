import { releasesView } from '~~/shared/utils/library/views'
import { readLibraryView } from '~~/server/utils/library/libraryView'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default defineEventHandler(async (event) => {
  const { from, to } = getQuery(event)
  if (typeof from !== 'string' || typeof to !== 'string' || !ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date range' })
  }
  const { library } = await readLibraryView(event)
  return releasesView(library, from, to)
})
