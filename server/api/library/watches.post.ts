import { inArray } from 'drizzle-orm'
import { titles, watches } from '~~/server/db/schema'
import { readWatchKeys } from '~~/server/utils/library/watchBody'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const keys = await readWatchKeys(event)

  const titleIds = [...new Set(keys.map(key => key.titleId))]
  const known = await withQuerySpan('select-watch-titles', () => db.select({ id: titles.id }).from(titles).where(inArray(titles.id, titleIds)))
  if (known.length !== titleIds.length) throw createError({ statusCode: 400, statusMessage: 'Unknown title' })

  const inserted = await withQuerySpan('insert-watches', () => db
    .insert(watches)
    .values(keys.map(key => ({ ...key, userId: user.id, source: 'watchd' as const })))
    .onConflictDoNothing()
    .returning({ id: watches.id }))
  return { added: inserted.length }
})
