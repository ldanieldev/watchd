import { logger } from '../logger'
import type { PlexSyncMode } from './types'

const SYNC_MODES: readonly PlexSyncMode[] = ['off', 'read-only', 'on']
let hasWarnedAboutInvalidMode = false

export function plexSyncMode(): PlexSyncMode {
  if (process.env.NUXT_E2E === '1') return 'off'
  const configured = useRuntimeConfig().plex?.syncMode as string | undefined
  if (!configured) return 'off'
  if ((SYNC_MODES as readonly string[]).includes(configured)) return configured as PlexSyncMode
  if (!hasWarnedAboutInvalidMode) {
    hasWarnedAboutInvalidMode = true
    logger.warn({ configured }, 'NUXT_PLEX_SYNC_MODE is not off, read-only or on; treating as off')
  }
  return 'off'
}

export function plexClientIdentifier(): string {
  return useRuntimeConfig().plex?.clientIdentifier as string ?? ''
}
