import { eq } from 'drizzle-orm'
import { plexConnections } from '~~/server/db/schema'
import { loadPlexConnection } from '~~/server/utils/plex/connection'
import { listenerRegistry } from '~~/server/utils/plex/listener'
import { restoreAllUnmarkedPlays } from '~~/server/utils/plex/scan'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  listenerRegistry.stopFor(user.id)
  const connection = await loadPlexConnection(user.id)
  if (!connection) return { success: true }
  await withQuerySpan('delete-plex-connection', () => db.transaction(async (tx) => {
    await restoreAllUnmarkedPlays(tx, user.id, connection.id)
    await tx.delete(plexConnections).where(eq(plexConnections.id, connection.id))
  }))
  return { success: true }
})
