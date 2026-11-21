import { countDistinct, eq } from 'drizzle-orm'
import { titles, watches } from '~~/server/db/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const rows = await withQuerySpan('select-enrichment-status', () => db
    .select({ state: titles.enrichmentState, count: countDistinct(titles.id) })
    .from(titles)
    .innerJoin(watches, eq(watches.titleId, titles.id))
    .where(eq(watches.userId, user.id))
    .groupBy(titles.enrichmentState))

  const counts = { pending: 0, ready: 0, failed: 0 }
  for (const row of rows) counts[row.state] = Number(row.count)
  return { total: counts.pending + counts.ready + counts.failed, ...counts }
})
