import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { plexConnections } from '~~/server/db/schema'
import { PLEX_LINK_EVENT } from '~~/server/utils/inngest/plexLinkEvent'
import type { PlexLinkEventData } from '~~/server/utils/inngest/plexLinkEvent'
import { PLEX_SCAN_EVENT } from '~~/server/utils/inngest/plexScanEvent'
import type { PlexScanEventData } from '~~/server/utils/inngest/plexScanEvent'
import { plexServerFor } from '~~/server/utils/plex/connection'
import { listenerRegistry } from '~~/server/utils/plex/listener'
import { assertPlexSyncEnabled, queuePlexEvent, requirePlexConnection, sectionsOf, videoSections } from '~~/server/utils/plex/routeSupport'

const bodySchema = z.object({ sectionIds: z.array(z.string().regex(/^\d+$/)).max(100) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  assertPlexSyncEnabled()
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Validation Error', data: z.flattenError(parsed.error) })
  const connection = await requirePlexConnection(user.id)

  const known = new Set(videoSections(await sectionsOf(plexServerFor(connection))).map(section => String(section.id)))
  const sectionIds = [...new Set(parsed.data.sectionIds)]
  if (sectionIds.some(id => !known.has(id))) throw createError({ statusCode: 400, statusMessage: 'Unknown library' })

  await withQuerySpan('update-plex-sections', () => db
    .update(plexConnections)
    .set({ sectionIds, updatedAt: new Date() })
    .where(eq(plexConnections.id, connection.id)))
  await listenerRegistry.startFor(user.id)

  const hasAddedSection = sectionIds.some(id => !connection.sectionIds.includes(id))
  if (hasAddedSection) await queuePlexEvent(PLEX_LINK_EVENT, { userId: user.id, rerun: false } satisfies PlexLinkEventData, 'the library import')
  else await queuePlexEvent(PLEX_SCAN_EVENT, { userId: user.id } satisfies PlexScanEventData, 'the scan')
  return { sectionIds }
})
