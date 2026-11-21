import { homeView } from '~~/shared/utils/library/views'
import { readLibraryView } from '~~/server/utils/library/libraryView'

export default defineEventHandler(async (event) => {
  const { library, today } = await readLibraryView(event)
  return homeView(library, today)
})
