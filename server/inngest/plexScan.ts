import { plexConnections } from '../db/schema'
import { inngest } from '../utils/inngest/client'
import { PLEX_SCAN_EVENT } from '../utils/inngest/plexScanEvent'
import type { PlexScanEventData } from '../utils/inngest/plexScanEvent'
import { plexSyncMode } from '../utils/plex/config'
import { loadPlexConnection, plexServerFor } from '../utils/plex/connection'
import { runPlexScan } from '../utils/plex/scan'

// Cron fan-out is a separate function: a cron event has no userId, so it can't share plex-scan's per-user concurrency key.
export const plexScanSchedule = inngest.createFunction(
  { id: 'plex-scan-schedule', triggers: [{ cron: '*/5 * * * *' }] },
  async ({ step }) => {
    if (plexSyncMode() === 'off') return { requested: 0 }
    const userIds = await step.run('load-plex-connections', async () => {
      const rows = await withQuerySpan('select-plex-scan-users', () => db.select({ userId: plexConnections.userId }).from(plexConnections))
      return rows.map(row => row.userId)
    })
    if (userIds.length) await step.sendEvent('request-plex-scans', userIds.map(userId => ({ name: PLEX_SCAN_EVENT, data: { userId } satisfies PlexScanEventData })))
    return { requested: userIds.length }
  }
)

export const plexScan = inngest.createFunction(
  {
    id: 'plex-scan',
    triggers: [{ event: PLEX_SCAN_EVENT }],
    concurrency: { key: 'event.data.userId', limit: 1 },
    // Few retries: the next 5-minute cron rescans anyway, so an offline Plex doesn't pile up runs.
    retries: 2
  },
  async ({ event, step }) => {
    if (plexSyncMode() === 'off') return { skipped: 'sync off' }
    const { userId } = event.data as PlexScanEventData
    return step.run('scan-plex', async () => {
      const connection = await loadPlexConnection(userId)
      if (!connection) return { skipped: 'no plex connection' }
      return runPlexScan({ connection, server: plexServerFor(connection) })
    })
  }
)
