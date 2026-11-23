export type PlexSyncMode = 'off' | 'read-only' | 'on'

export interface PlexConnection {
  uri: string
  local: boolean
  relay: boolean
}

export interface PlexServerResource {
  machineId: string
  name: string
  owned: boolean
  accessToken: string
  connections: PlexConnection[]
}

export interface PlexPin {
  id: number
  code: string
  authUrl(forwardUrl: string): string
}

export interface PlexUser {
  id: number
  username: string
  title: string
  homeAdmin: boolean
}

export interface PlexHomeProfile {
  id: number
  title: string
  isAdmin: boolean
  hasPin: boolean
}

export interface PlexAccount {
  id: number
  name: string
}

export interface PlexSection {
  id: number
  type: string
  title: string
  agent: string
}

export type PlexItemKind = 'movie' | 'show' | 'episode'

export interface PlexItem {
  ratingKey: string
  kind: PlexItemKind
  title: string
  parentRatingKey?: string
  grandparentRatingKey?: string
  guids: string[]
  parentIndex?: number
  index?: number
  viewCount: number
  lastViewedAt?: number
}

export interface PlexHistoryEntry {
  historyId: number
  ratingKey: string
  viewedAt: number
  accountId: number
  sectionId: number
}

export interface PlexSession {
  sessionKey: string
  ratingKey: string
  userId?: number
  userTitle?: string
  state: string
  viewOffset: number
}

export interface PlexHistoryQuery {
  accountId: number
  sectionIds: number[]
  viewedAfter?: number
}
