import { plexConnections } from '../db/schema'
import { logger } from '../utils/logger'
import { plexClientIdentifier, plexSyncMode } from '../utils/plex/config'
import { listenerRegistry } from '../utils/plex/listener'

export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender || process.env.NUXT_E2E === '1' || plexSyncMode() === 'off') return
  if (!plexClientIdentifier()) {
    logger.error('NUXT_PLEX_CLIENT_IDENTIFIER is required while NUXT_PLEX_SYNC_MODE is not off; the Plex listener is not started')
    return
  }
  let closed = false
  nitroApp.hooks.hook('close', () => {
    closed = true
    listenerRegistry.stopAll()
  })

  void (async () => {
    try {
      const rows = await withQuerySpan('select-plex-listener-users', () => db.select({ userId: plexConnections.userId }).from(plexConnections))
      for (const { userId } of rows) if (!closed) await listenerRegistry.startFor(userId)
    } catch (error) {
      logger.error({ err: error }, 'plex listener failed to start')
    }
  })()
})
