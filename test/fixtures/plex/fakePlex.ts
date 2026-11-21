import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'

export interface FakePlexItem {
  sectionId: number
  ratingKey: string
  type: 'movie' | 'show' | 'episode'
  title: string
  guids: string[]
  parentRatingKey?: string
  grandparentRatingKey?: string
  parentIndex?: number
  index?: number
  viewCount?: number
  lastViewedAt?: number
}

export interface FakePlexHistoryEntry {
  historyId: number
  ratingKey: string
  viewedAt: number
  accountId: number
  sectionId: number
}

export interface FakePlexState {
  token: string
  pinAuthToken: string | null
  user: { username: string, homeAdmin: boolean }
  resources: {
    name: string
    clientIdentifier: string
    provides: string
    owned: boolean
    accessToken: string
    connections: { uri: string, local: boolean, relay: boolean }[]
  }[]
  accounts: { id: number, name: string }[]
  sections: { id: number, type: string, title: string, agent: string }[]
  items: FakePlexItem[]
  history: FakePlexHistoryEntry[]
  ignoreAccountFilter?: boolean
  sessions: { sessionKey: string, ratingKey: string, userId?: number, userTitle?: string, state: string, viewOffset: number }[]
}

export interface FakePlex {
  url: string
  calls: { method: string, path: string }[]
  rawUrls: string[]
  websocketTokens: string[]
  push(notification: unknown): void
  stop(): Promise<void>
}

const ITEM_TYPE_BY_NUMBER: Record<string, FakePlexItem['type']> = { 1: 'movie', 2: 'show', 4: 'episode' }

export function createFakePlexState(overrides: Partial<FakePlexState> = {}): FakePlexState {
  return {
    token: 'fake-plex-token',
    pinAuthToken: null,
    user: { username: 'synthetic-owner', homeAdmin: true },
    resources: [],
    accounts: [{ id: 0, name: '' }, { id: 1, name: 'synthetic-owner' }, { id: 2, name: 'synthetic-guest' }],
    sections: [
      { id: 1, type: 'movie', title: 'Films', agent: 'tv.plex.agents.movie' },
      { id: 2, type: 'show', title: 'Series', agent: 'tv.plex.agents.series' }
    ],
    items: [],
    history: [],
    sessions: [],
    ...overrides
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function pagedContainer(request: IncomingMessage, entries: unknown[], extra: Record<string, unknown> = {}) {
  const start = Number(request.headers['x-plex-container-start'] ?? 0)
  const size = Number(request.headers['x-plex-container-size'] ?? entries.length)
  const page = entries.slice(start, start + size)
  return { MediaContainer: { size: page.length, totalSize: entries.length, offset: start, Metadata: page, ...extra } }
}

export async function startFakePlex(state: FakePlexState): Promise<FakePlex> {
  const calls: FakePlex['calls'] = []
  const rawUrls: string[] = []
  const websocketTokens: string[] = []
  const sockets = new Set<WebSocket>()
  const websocketServer = new WebSocketServer({ noServer: true })

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://fake')
    const method = request.method ?? 'GET'
    const path = url.pathname
    calls.push({ method, path })
    rawUrls.push(request.url ?? '')

    if (path === '/identity') return sendJson(response, 200, { MediaContainer: { machineIdentifier: 'fake-machine' } })
    if (method === 'POST' && path === '/api/v2/pins') return sendJson(response, 201, { id: 4242, code: 'ABCD', authToken: null })
    const pinMatch = path.match(/^\/api\/v2\/pins\/(\d+)$/)
    if (pinMatch) return sendJson(response, 200, { id: Number(pinMatch[1]), code: 'ABCD', authToken: state.pinAuthToken })

    if (request.headers['x-plex-token'] !== state.token) return sendJson(response, 401, { errors: [{ code: 1001, message: 'User could not be authenticated' }] })

    if (path === '/api/v2/user') return sendJson(response, 200, { username: state.user.username, home: true, homeAdmin: state.user.homeAdmin })
    if (path === '/api/v2/resources') {
      return sendJson(response, 200, state.resources.map(resource => ({ ...resource, connections: resource.connections.map(connection => ({ ...connection, protocol: 'http' })) })))
    }

    if (path === '/accounts') return sendJson(response, 200, { MediaContainer: { size: state.accounts.length, Account: state.accounts } })
    if (path === '/library/sections') {
      const directories = state.sections.map(section => ({ ...section, key: String(section.id) }))
      return sendJson(response, 200, { MediaContainer: { size: directories.length, Directory: directories } })
    }

    const listing = path.match(/^\/library\/sections\/(\d+)\/all$/)
    if (listing) {
      const wanted = ITEM_TYPE_BY_NUMBER[url.searchParams.get('type') ?? '']
      const items = state.items
        .filter(item => item.sectionId === Number(listing[1]) && (!wanted || item.type === wanted))
        .map(({ sectionId: _sectionId, guids, ...item }) => ({ ...item, Guid: guids.map(id => ({ id })) }))
      return sendJson(response, 200, pagedContainer(request, items))
    }

    if (path === '/status/sessions/history/all') {
      const accountId = url.searchParams.get('accountID')
      const sectionId = url.searchParams.get('librarySectionID')
      const viewedAfter = url.searchParams.get('viewedAt>')
      const entries = state.history
        .filter(entry => (accountId === null || state.ignoreAccountFilter || entry.accountId === Number(accountId))
          && (sectionId === null || entry.sectionId === Number(sectionId))
          && (viewedAfter === null || entry.viewedAt > Number(viewedAfter)))
        .toSorted((left, right) => left.viewedAt - right.viewedAt)
        .map(entry => ({
          historyKey: `/status/sessions/history/${entry.historyId}`,
          ratingKey: entry.ratingKey,
          viewedAt: entry.viewedAt,
          accountID: entry.accountId,
          deviceID: 1,
          librarySectionID: String(entry.sectionId)
        }))
      return sendJson(response, 200, pagedContainer(request, entries))
    }

    if (path === '/status/sessions') {
      const sessions = state.sessions.map(session => ({
        sessionKey: session.sessionKey,
        ratingKey: session.ratingKey,
        viewOffset: session.viewOffset,
        User: session.userId === undefined ? undefined : { id: String(session.userId), title: session.userTitle },
        Player: { state: session.state }
      }))
      return sendJson(response, 200, { MediaContainer: { size: sessions.length, Metadata: sessions } })
    }

    if (path === '/:/scrobble' || path === '/:/unscrobble') {
      const item = state.items.find(candidate => candidate.ratingKey === url.searchParams.get('key'))
      if (item && path === '/:/scrobble') Object.assign(item, { viewCount: 1, lastViewedAt: Math.floor(Date.now() / 1000) })
      if (item && path === '/:/unscrobble') {
        item.viewCount = undefined
        item.lastViewedAt = undefined
      }
      response.writeHead(200)
      return response.end()
    }

    const deletion = path.match(/^\/status\/sessions\/history\/(\d+)$/)
    if (method === 'DELETE' && deletion) {
      state.history = state.history.filter(entry => entry.historyId !== Number(deletion[1]))
      response.writeHead(200)
      return response.end()
    }

    sendJson(response, 404, {})
  }

  const server = createServer(handle)
  server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url ?? '/', 'http://fake').pathname !== '/:/websockets/notifications') return socket.destroy()
    if (request.headers['x-plex-token'] !== state.token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      return socket.destroy()
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketTokens.push(String(request.headers['x-plex-token']))
      sockets.add(websocket)
      websocket.on('close', () => sockets.delete(websocket))
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    rawUrls,
    websocketTokens,
    push(notification) {
      const message = JSON.stringify({ NotificationContainer: notification })
      for (const socket of sockets) socket.send(message)
    },
    async stop() {
      for (const socket of sockets) socket.terminate()
      websocketServer.close()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }
}
