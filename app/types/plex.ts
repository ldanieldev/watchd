import type { InternalApi } from 'nitropack/types'

export type PlexStatus = InternalApi['/api/plex/status']['get']
export type PlexConnectedStatus = Extract<PlexStatus, { connected: true }>
export type PlexSyncModeSetting = PlexStatus['mode']
export type PlexPinCheck = InternalApi['/api/plex/pin/:id']['get']
export type PlexUnmarkedItem = InternalApi['/api/plex/unmarked']['get']['items'][number]
export type PlexUnmatched = InternalApi['/api/plex/unmatched']['get']
export type PlexJob = 'scan' | 'reconcile'
