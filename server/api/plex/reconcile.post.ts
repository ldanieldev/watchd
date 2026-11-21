import { PLEX_LINK_EVENT } from '~~/server/utils/inngest/plexLinkEvent'
import type { PlexLinkEventData } from '~~/server/utils/inngest/plexLinkEvent'
import { assertPlexSyncEnabled, queuePlexEvent, requirePlexConnection } from '~~/server/utils/plex/routeSupport'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  assertPlexSyncEnabled()
  await requirePlexConnection(user.id)
  await queuePlexEvent(PLEX_LINK_EVENT, { userId: user.id, rerun: true } satisfies PlexLinkEventData, 'the reconcile')
  return { queued: true }
})
