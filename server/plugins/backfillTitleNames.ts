import { and, eq, isNull } from 'drizzle-orm'
import { titles } from '../db/schema'
import { logger } from '../utils/logger'
import { queueEnrichment } from '~~/server/utils/import/writePlays'

export async function backfillTitleNames(): Promise<number> {
  const rows = await withQuerySpan('select-titles-without-names', () => db
    .select({ id: titles.id })
    .from(titles)
    .where(and(eq(titles.enrichmentState, 'ready'), isNull(titles.alternativeNames))))
  if (!rows.length) return 0
  // Inngest ignores a repeated event id for 24h (docs: guides/handling-idempotency), so a restart mid-backfill does not enqueue each title twice.
  await queueEnrichment(rows.map(row => row.id), { eventIdForTitle: titleId => `backfill-names-${titleId}` })
  logger.info({ queued: rows.length }, 'queued enrichment for titles without alternative names')
  return rows.length
}

export default defineNitroPlugin(() => {
  if (import.meta.prerender || process.env.NUXT_E2E === '1') return
  void backfillTitleNames().catch(error => logger.error({ err: error }, 'title name backfill failed'))
})
