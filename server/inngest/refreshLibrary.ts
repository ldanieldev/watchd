import { and, eq, isNull, notInArray, or } from 'drizzle-orm'
import { titles } from '../db/schema'
import { inngest } from '../utils/inngest/client'
import { queueEnrichment } from '../utils/import/writePlays'

const FINISHED_STATUSES = ['Ended', 'Canceled']

export const refreshLibrary = inngest.createFunction(
  { id: 'refresh-library', triggers: [{ cron: '0 10 * * *' }] },
  async ({ step }) => step.run('queue-airing-shows', async () => {
    const rows = await withQuerySpan('select-airing-titles', () => db
      .select({ id: titles.id })
      .from(titles)
      .where(and(
        eq(titles.kind, 'tv'),
        eq(titles.enrichmentState, 'ready'),
        or(isNull(titles.tmdbStatus), notInArray(titles.tmdbStatus, FINISHED_STATUSES))
      )))
    await queueEnrichment(rows.map(row => row.id))
    return { queued: rows.length }
  })
)
