import { count } from 'drizzle-orm'
import { titles } from '~~/server/db/schema'
import { inUserLibrary } from '~~/server/utils/library/libraryTitleCondition'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const rows = await withQuerySpan('select-enrichment-status', () => db
    .select({ state: titles.enrichmentState, count: count() })
    .from(titles)
    .where(inUserLibrary(titles.id, user.id))
    .groupBy(titles.enrichmentState))

  const counts = { pending: 0, ready: 0, failed: 0 }
  for (const row of rows) counts[row.state] = Number(row.count)
  return { total: counts.pending + counts.ready + counts.failed, ...counts }
})
