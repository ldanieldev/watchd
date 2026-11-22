import { and, eq } from 'drizzle-orm'
import { titles } from '~~/server/db/schema'
import { queueEnrichment } from '~~/server/utils/import/writePlays'
import { inUserLibrary } from '~~/server/utils/library/libraryTitleCondition'
import { consumeLimit, RATE_RULES } from '~~/server/utils/rateLimit/limit'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const titleId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(titleId) || titleId <= 0) throw createError({ statusCode: 400, statusMessage: 'Invalid title ID' })
  await consumeLimit(event, RATE_RULES.titleRefresh, String(user.id))

  const [title] = await withQuerySpan('select-library-title', () => db
    .selectDistinct({ id: titles.id })
    .from(titles)
    .where(and(eq(titles.id, titleId), inUserLibrary(titles.id, user.id))))
  if (!title) throw createError({ statusCode: 404, statusMessage: 'Title not found' })

  const hourBucket = Math.floor(Date.now() / 3_600_000)
  await queueEnrichment([titleId], { eventIdForTitle: id => `title-refresh-${id}-${hourBucket}` })
  return { queued: 1 }
})
