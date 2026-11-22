import { titles } from '~~/server/db/schema'
import { queueEnrichment } from '~~/server/utils/import/writePlays'
import { inUserLibrary } from '~~/server/utils/library/libraryTitleCondition'
import { consumeLimit, RATE_RULES } from '~~/server/utils/rateLimit/limit'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  await consumeLimit(event, RATE_RULES.libraryRefresh, String(user.id))

  const rows = await withQuerySpan('select-library-title-ids', () => db
    .selectDistinct({ id: titles.id })
    .from(titles)
    .where(inUserLibrary(titles.id, user.id)))
  const titleIds = rows.map(row => row.id)
  if (titleIds.length > 0) {
    const hourBucket = Math.floor(Date.now() / 3_600_000)
    await queueEnrichment(titleIds, { eventIdForTitle: titleId => `library-refresh-${titleId}-${hourBucket}` })
  }
  return { queued: titleIds.length }
})
