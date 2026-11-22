import { inngest } from '~~/server/utils/inngest/client'
import { consumeLimit, RATE_RULES } from '~~/server/utils/rateLimit/limit'
import { SEARCH_LIBRARY_CHANGED_EVENT } from '~~/server/utils/search/searchEvents'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await consumeLimit(event, RATE_RULES.searchRebuild, String(user.id))

  await inngest.send({ name: SEARCH_LIBRARY_CHANGED_EVENT, data: { userId: user.id } })
  return { ok: true }
})
