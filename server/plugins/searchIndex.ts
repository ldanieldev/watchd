import { logger } from '../utils/logger'
import { ensureLibraryTitlesIndex, isIndexNotFound, libraryTitlesIndex } from '../utils/search/meili'
import { queueSearchReindexForAllUsers } from '../utils/search/searchEvents'

export async function checkSearchIndexOnStartup(): Promise<void> {
  try {
    const { numberOfDocuments } = await libraryTitlesIndex().getStats().catch((error: unknown) => {
      if (isIndexNotFound(error)) return { numberOfDocuments: 0 }
      throw error
    })
    if (numberOfDocuments > 0) return
    const queued = await queueSearchReindexForAllUsers()
    logger.info({ queued }, 'search index is empty; queued a rebuild for every user')
  } catch (error) {
    logger.warn({ err: error }, 'search index startup check failed')
  }
}

export default defineNitroPlugin(() => {
  if (import.meta.prerender || process.env.NUXT_E2E === '1') return
  void ensureLibraryTitlesIndex()
    .then(checkSearchIndexOnStartup)
    .catch(error => logger.warn({ err: error }, 'search index setup failed'))
})
