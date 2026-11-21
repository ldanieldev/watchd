import { failedTitleIdsFor, queueEnrichment, resetFailedTitles } from '~~/server/utils/import/writePlays'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const titleIds = await failedTitleIdsFor(user.id)
  await resetFailedTitles(titleIds)
  await queueEnrichment(titleIds)
  return { queued: titleIds.length }
})
