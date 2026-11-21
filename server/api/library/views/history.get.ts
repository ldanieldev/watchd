import { historyView } from '~~/shared/utils/library/views'
import { queryParam, readLibraryView } from '~~/server/utils/library/libraryView'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export default defineEventHandler(async (event) => {
  const month = getQuery(event).month ?? 'latest'
  if (typeof month !== 'string' || (month !== 'latest' && !MONTH.test(month))) throw createError({ statusCode: 400, statusMessage: 'Invalid month' })
  const type = queryParam(event, 'type', ['all', 'movie', 'tv', 'anime'] as const, 'all')
  const { library, today } = await readLibraryView(event)
  return historyView(library, month, type, today)
})
