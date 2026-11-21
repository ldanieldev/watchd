import { statsView } from '~~/shared/utils/library/views'
import { queryParam, readLibraryView } from '~~/server/utils/library/libraryView'

export default defineEventHandler(async (event) => {
  const range = queryParam(event, 'range', ['30d', '90d', '12m', 'all'] as const, '12m')
  const type = queryParam(event, 'type', ['all', 'movie', 'tv', 'anime'] as const, 'all')
  const { library, today } = await readLibraryView(event)
  return statsView(library, range, type, today)
})
