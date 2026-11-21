import { PLEX_SCAN_EVENT } from '~~/server/utils/inngest/plexScanEvent'
import type { PlexScanEventData } from '~~/server/utils/inngest/plexScanEvent'
import { assertPlexSyncEnabled, queuePlexEvent, requirePlexConnection } from '~~/server/utils/plex/routeSupport'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  assertPlexSyncEnabled()
  await requirePlexConnection(user.id)
  await queuePlexEvent(PLEX_SCAN_EVENT, { userId: user.id } satisfies PlexScanEventData, 'the scan')
  return { queued: true }
})
