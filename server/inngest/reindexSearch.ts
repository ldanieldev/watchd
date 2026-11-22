import { inngest } from '../utils/inngest/client'
import { ensureLibraryTitlesIndex } from '../utils/search/meili'
import { reindexUserSearch } from '../utils/search/reindexUserSearch'
import { SEARCH_LIBRARY_CHANGED_EVENT, queueSearchReindexForAllUsers } from '../utils/search/searchEvents'

export const reindexUserSearchFunction = inngest.createFunction(
  {
    id: 'reindex-user-search',
    debounce: { key: 'event.data.userId', period: '5s', timeout: '1m' },
    concurrency: { key: 'event.data.userId', limit: 1 },
    triggers: [{ event: SEARCH_LIBRARY_CHANGED_EVENT }]
  },
  async ({ event, step }) => step.run('reindex-user', async () => {
    await ensureLibraryTitlesIndex()
    return reindexUserSearch(event.data.userId as number)
  })
)

export const reindexAllSearchFunction = inngest.createFunction(
  { id: 'reindex-all-search', triggers: [{ cron: '30 3 * * *' }] },
  async ({ step }) => step.run('queue-all-users', async () => ({ queued: await queueSearchReindexForAllUsers() }))
)
