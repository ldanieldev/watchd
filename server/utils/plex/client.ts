import { logger } from '../logger'
import { plexClientIdentifier, plexSyncMode } from './config'
import type {
  PlexAccount, PlexHistoryEntry, PlexHistoryQuery, PlexItem, PlexItemKind, PlexPin, PlexSection,
  PlexServerResource, PlexSession, PlexUser
} from './types'

const PLEX_PRODUCT = 'watchd'
const PLEX_TV_URL = 'https://plex.tv'
const PLEX_AUTH_URL = 'https://app.plex.tv/auth'
const REQUEST_TIMEOUT_MS = 60_000
const PAGE_SIZE = 1000
const CONNECTION_TIMEOUT_MS = 4000
export const PLEX_DISPLAY_READ_TIMEOUT_MS = 4000
const MEDIA_LIBRARY_IDENTIFIER = 'com.plexapp.plugins.library'
const ITEM_KINDS: readonly PlexItemKind[] = ['movie', 'show', 'episode']
const HISTORY_ID_PATTERN = /\/status\/sessions\/history\/(\d+)$/

let plexTvBaseUrl = PLEX_TV_URL

export function setPlexTvBaseUrl(baseUrl: string | undefined) {
  plexTvBaseUrl = baseUrl ?? PLEX_TV_URL
}

export class PlexError extends Error {
  readonly status?: number
  readonly kind: 'unauthorized' | 'unreachable' | 'http'

  constructor(kind: PlexError['kind'], message: string, status?: number) {
    super(message)
    this.name = 'PlexError'
    this.kind = kind
    this.status = status
  }
}

interface RequestOptions {
  token?: string
  query?: Record<string, string>
  headers?: Record<string, string>
  timeoutMs?: number
}

// Messages name method and path only, so a caller that logs an error never records the query string.
async function plexRequest(baseUrl: string, method: string, path: string, options: RequestOptions = {}): Promise<Response> {
  const query = options.query ? `?${new URLSearchParams(options.query)}` : ''
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Client-Identifier': plexClientIdentifier(),
    ...options.headers
  }
  if (options.token) headers['X-Plex-Token'] = options.token

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}${query}`, { method, headers, signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS) })
  } catch {
    throw new PlexError('unreachable', `${method} ${path} could not connect`)
  }
  if (response.status === 401) throw new PlexError('unauthorized', `${method} ${path} returned 401`, 401)
  if (!response.ok) throw new PlexError('http', `${method} ${path} returned ${response.status}`, response.status)
  return response
}

async function plexJson<Body>(baseUrl: string, method: string, path: string, options?: RequestOptions): Promise<Body> {
  const response = await plexRequest(baseUrl, method, path, options)
  try {
    return await response.json() as Body
  } catch {
    throw new PlexError('http', `${method} ${path} returned a body that is not JSON`, response.status)
  }
}

export async function createPin(): Promise<PlexPin> {
  const pin = await plexJson<{ id: number, code: string }>(plexTvBaseUrl, 'POST', '/api/v2/pins', { query: { strong: 'true' } })
  return {
    id: pin.id,
    code: pin.code,
    authUrl: forwardUrl => `${PLEX_AUTH_URL}#?clientID=${encodeURIComponent(plexClientIdentifier())}`
      + `&code=${encodeURIComponent(pin.code)}&context[device][product]=${PLEX_PRODUCT}&forwardUrl=${encodeURIComponent(forwardUrl)}`
  }
}

export async function checkPin(id: number, code: string): Promise<string | null> {
  const pin = await plexJson<{ authToken: string | null }>(plexTvBaseUrl, 'GET', `/api/v2/pins/${id}`, { query: { code } })
  return pin.authToken ?? null
}

export async function getPlexUser(token: string): Promise<PlexUser> {
  const user = await plexJson<{ username: string, homeAdmin: boolean }>(plexTvBaseUrl, 'GET', '/api/v2/user', { token })
  return { username: user.username, homeAdmin: Boolean(user.homeAdmin) }
}

interface RawResource {
  name: string
  clientIdentifier: string
  provides: string
  owned: boolean
  accessToken: string
  connections?: { uri: string, local: boolean, relay: boolean }[]
}

export async function listOwnedServers(token: string): Promise<PlexServerResource[]> {
  const resources = await plexJson<RawResource[]>(plexTvBaseUrl, 'GET', '/api/v2/resources', {
    token,
    query: { includeHttps: '1', includeRelay: '1' }
  })
  return resources
    .filter(resource => resource.owned && resource.provides.split(',').includes('server'))
    .map(resource => ({
      machineId: resource.clientIdentifier,
      name: resource.name,
      accessToken: resource.accessToken,
      connections: (resource.connections ?? []).map(({ uri, local, relay }) => ({ uri, local, relay }))
    }))
}

export async function pickConnection(resource: PlexServerResource, override?: string, timeoutMs = CONNECTION_TIMEOUT_MS): Promise<string> {
  const tiers = override
    ? [[override]]
    : [
        resource.connections.filter(connection => connection.local),
        resource.connections.filter(connection => !connection.local && !connection.relay),
        resource.connections.filter(connection => !connection.local && connection.relay)
      ].map(tier => tier.map(connection => connection.uri))
  for (const candidates of tiers.filter(tier => tier.length)) {
    const probes = candidates.map(async (uri) => {
      const response = await plexRequest(uri, 'GET', '/identity', { timeoutMs })
      await response.body?.cancel()
      return uri
    })
    const answered = await Promise.any(probes).catch(() => null)
    if (answered) return answered
  }
  throw new PlexError('unreachable', `no connection to ${resource.name} answered /identity`)
}

interface RawMetadata {
  ratingKey?: string
  type?: string
  title?: string
  historyKey?: string
  viewedAt?: number
  accountID?: number
  librarySectionID?: string | number
  parentRatingKey?: string
  grandparentRatingKey?: string
  parentIndex?: number
  index?: number
  viewCount?: number
  lastViewedAt?: number
  sessionKey?: string
  viewOffset?: number
  Guid?: { id: string }[]
  User?: { id?: string | number, title?: string }
  Player?: { state?: string }
}

interface RawContainer<Entry> {
  MediaContainer: { totalSize?: number, size?: number, Metadata?: Entry[], Directory?: Entry[], Account?: Entry[] }
}

export class PlexServer {
  private readonly url: string
  private readonly token: string

  constructor({ url, token }: { url: string, token: string }) {
    this.url = url
    this.token = token
  }

  private get<Entry>(path: string, query?: Record<string, string>, timeoutMs?: number) {
    return plexJson<RawContainer<Entry>>(this.url, 'GET', path, { token: this.token, query, timeoutMs })
  }

  private async getAllPages(path: string, query: Record<string, string>): Promise<RawMetadata[]> {
    const entries: RawMetadata[] = []
    for (let start = 0; ; start += PAGE_SIZE) {
      const { MediaContainer: container } = await plexJson<RawContainer<RawMetadata>>(this.url, 'GET', path, {
        token: this.token,
        query,
        headers: { 'X-Plex-Container-Start': String(start), 'X-Plex-Container-Size': String(PAGE_SIZE) }
      })
      const page = container.Metadata ?? []
      entries.push(...page)
      if (page.length === 0 || start + page.length >= (container.totalSize ?? container.size ?? 0)) return entries
    }
  }

  async accounts(): Promise<PlexAccount[]> {
    const { MediaContainer: container } = await this.get<PlexAccount>('/accounts')
    return (container.Account ?? []).map(({ id, name }) => ({ id: Number(id), name }))
  }

  async sections({ timeoutMs }: { timeoutMs?: number } = {}): Promise<PlexSection[]> {
    const { MediaContainer: container } = await this.get<{ key: string, type: string, title: string, agent: string }>('/library/sections', undefined, timeoutMs)
    return (container.Directory ?? []).map(({ key, type, title, agent }) => ({ id: Number(key), type, title, agent }))
  }

  async listItems(sectionId: number, type: 1 | 4 | 2): Promise<PlexItem[]> {
    const entries = await this.getAllPages(`/library/sections/${sectionId}/all`, { type: String(type), includeGuids: '1' })
    return entries.flatMap((entry) => {
      if (entry.ratingKey === undefined || !ITEM_KINDS.includes(entry.type as PlexItemKind)) return []
      return [{
        ratingKey: String(entry.ratingKey),
        kind: entry.type as PlexItemKind,
        title: entry.title ?? '',
        ...(entry.parentRatingKey !== undefined && { parentRatingKey: String(entry.parentRatingKey) }),
        ...(entry.grandparentRatingKey !== undefined && { grandparentRatingKey: String(entry.grandparentRatingKey) }),
        guids: (entry.Guid ?? []).map(guid => guid.id),
        ...(entry.parentIndex !== undefined && { parentIndex: entry.parentIndex }),
        ...(entry.index !== undefined && { index: entry.index }),
        viewCount: entry.viewCount ?? 0,
        ...(entry.lastViewedAt !== undefined && { lastViewedAt: entry.lastViewedAt })
      }]
    })
  }

  async history({ accountId, sectionIds, viewedAfter }: PlexHistoryQuery): Promise<PlexHistoryEntry[]> {
    const merged: PlexHistoryEntry[] = []
    for (const sectionId of sectionIds) {
      const query: Record<string, string> = { sort: 'viewedAt:asc', accountID: String(accountId), librarySectionID: String(sectionId) }
      if (viewedAfter !== undefined) query['viewedAt>'] = String(viewedAfter)
      for (const entry of await this.getAllPages('/status/sessions/history/all', query)) {
        const historyId = Number(entry.historyKey?.match(HISTORY_ID_PATTERN)?.[1])
        if (!Number.isInteger(historyId) || entry.ratingKey === undefined || entry.viewedAt === undefined) continue
        if (Number(entry.accountID) !== accountId) continue
        merged.push({ historyId, ratingKey: String(entry.ratingKey), viewedAt: entry.viewedAt, accountId: Number(entry.accountID), sectionId })
      }
    }
    return merged.sort((left, right) => left.viewedAt - right.viewedAt)
  }

  async sessions(): Promise<PlexSession[]> {
    const { MediaContainer: container } = await this.get<RawMetadata>('/status/sessions')
    return (container.Metadata ?? []).flatMap((entry) => {
      if (entry.sessionKey === undefined || entry.ratingKey === undefined) return []
      return [{
        sessionKey: String(entry.sessionKey),
        ratingKey: String(entry.ratingKey),
        ...(entry.User?.id !== undefined && { userId: Number(entry.User.id) }),
        ...(entry.User?.title !== undefined && { userTitle: entry.User.title }),
        state: entry.Player?.state ?? 'unknown',
        viewOffset: entry.viewOffset ?? 0
      }]
    })
  }

  async scrobble(ratingKey: string): Promise<void> {
    await this.markPlayedState('scrobble', ratingKey)
  }

  async unscrobble(ratingKey: string): Promise<void> {
    await this.markPlayedState('unscrobble', ratingKey)
  }

  async deleteHistory(historyId: number): Promise<void> {
    if (!this.writesAllowed({ action: 'deleteHistory', historyId })) return
    const response = await plexRequest(this.url, 'DELETE', `/status/sessions/history/${historyId}`, { token: this.token })
    await response.body?.cancel()
  }

  private async markPlayedState(action: 'scrobble' | 'unscrobble', ratingKey: string) {
    if (!this.writesAllowed({ action, ratingKey })) return
    const response = await plexRequest(this.url, 'GET', `/:/${action}`, {
      token: this.token,
      query: { key: ratingKey, identifier: MEDIA_LIBRARY_IDENTIFIER }
    })
    await response.body?.cancel()
  }

  private writesAllowed(skipped: Record<string, unknown>) {
    const mode = plexSyncMode()
    if (mode === 'read-only') logger.info(skipped, 'plex write skipped (read-only)')
    return mode === 'on'
  }
}
