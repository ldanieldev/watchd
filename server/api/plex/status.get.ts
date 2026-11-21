import { logger } from '~~/server/utils/logger'
import { PLEX_DISPLAY_READ_TIMEOUT_MS } from '~~/server/utils/plex/client'
import { plexSyncMode } from '~~/server/utils/plex/config'
import { loadPlexConnection, plexServerFor } from '~~/server/utils/plex/connection'
import { listenerRegistry } from '~~/server/utils/plex/listener'
import { videoSections } from '~~/server/utils/plex/routeSupport'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const mode = plexSyncMode()
  const connection = await loadPlexConnection(user.id)
  if (!connection) return { connected: false as const, mode }

  let sections: { id: string, title: string, type: 'movie' | 'show', checked: boolean }[] = []
  let sectionsAvailable = true
  try {
    sections = videoSections(await plexServerFor(connection).sections({ timeoutMs: PLEX_DISPLAY_READ_TIMEOUT_MS })).map(section => ({
      id: String(section.id),
      title: section.title,
      type: section.type as 'movie' | 'show',
      checked: connection.sectionIds.includes(String(section.id))
    }))
  } catch (error) {
    sectionsAvailable = false
    logger.debug({ userId: user.id, error: error instanceof Error ? error.message : 'unknown' }, 'plex status could not list libraries')
  }

  return {
    connected: true as const,
    serverName: connection.serverName,
    mode,
    listener: listenerRegistry.statusFor(user.id) ?? null,
    lastPlayAt: connection.lastPlayAt?.toISOString() ?? null,
    lastScanAt: connection.lastScanAt?.toISOString() ?? null,
    tokenInvalid: connection.tokenInvalid,
    sectionsAvailable,
    sections,
    report: connection.lastReport
  }
})
