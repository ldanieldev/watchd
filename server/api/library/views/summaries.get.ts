import { summariesView } from '~~/shared/utils/library/views'
import { queryParam, readLibraryView } from '~~/server/utils/library/libraryView'

export default defineEventHandler(async (event) => {
  const type = queryParam(event, 'type', ['movie', 'tv', 'anime'] as const)
  const { library, today } = await readLibraryView(event)
  return summariesView(library, type, today)
})
