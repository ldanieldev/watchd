import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))

const runtimePlex = { syncMode: 'on', clientIdentifier: 'test-client-id' }
vi.stubGlobal('useRuntimeConfig', () => ({ plex: runtimePlex }))

const { PlexError, PlexServer, createPin, checkPin, getPlexUser, listOwnedServers, pickConnection, setPlexTvBaseUrl } = await import('../../server/utils/plex/client')
const { plexSyncMode } = await import('../../server/utils/plex/config')

const TOKEN = 'secret-token-abc123'
let state: FakePlexState
let fake: FakePlex
let server: InstanceType<typeof PlexServer>

beforeEach(async () => {
  vi.clearAllMocks()
  runtimePlex.syncMode = 'on'
  state = createFakePlexState({ token: TOKEN })
  fake = await startFakePlex(state)
  server = new PlexServer({ url: fake.url, token: TOKEN })
  setPlexTvBaseUrl(fake.url)
})

afterEach(async () => {
  setPlexTvBaseUrl(undefined)
  await fake.stop()
})

function assertNoTokenLeak(error: unknown) {
  expect(error).toBeInstanceOf(PlexError)
  expect(JSON.stringify(error)).not.toContain(TOKEN)
  expect((error as Error).message).not.toContain(TOKEN)
  expect(String((error as Error).cause ?? '')).not.toContain(TOKEN)
  expect(JSON.stringify(log.info.mock.calls)).not.toContain(TOKEN)
  expect(JSON.stringify(log.warn.mock.calls)).not.toContain(TOKEN)
}

describe('plexSyncMode', () => {
  it('returns the configured mode and treats an invalid value as off, warning once per process', () => {
    runtimePlex.syncMode = 'read-only'
    expect(plexSyncMode()).toBe('read-only')
    runtimePlex.syncMode = 'bogus'
    expect(plexSyncMode()).toBe('off')
    expect(plexSyncMode()).toBe('off')
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('is always off under e2e, whatever is configured', () => {
    runtimePlex.syncMode = 'on'
    vi.stubEnv('NUXT_E2E', '1')
    try {
      expect(plexSyncMode()).toBe('off')
    } finally {
      vi.unstubAllEnvs()
    }
    expect(plexSyncMode()).toBe('on')
  })

  it('treats an empty value as off without warning', () => {
    runtimePlex.syncMode = ''
    expect(plexSyncMode()).toBe('off')
    expect(log.warn).not.toHaveBeenCalled()
  })
})

describe('plex.tv', () => {
  it('creates a pin and builds the auth url with encoded values', async () => {
    const pin = await createPin()
    expect(pin.id).toBe(4242)
    expect(pin.code).toBe('ABCD')
    const authUrl = pin.authUrl('http://watchd.test/settings/integrations?pin=4242')
    expect(authUrl).toBe(
      'https://app.plex.tv/auth#?clientID=test-client-id&code=ABCD&context[device][product]=watchd'
      + '&forwardUrl=http%3A%2F%2Fwatchd.test%2Fsettings%2Fintegrations%3Fpin%3D4242'
    )
    expect(fake.calls).toContainEqual({ method: 'POST', path: '/api/v2/pins' })
  })

  it('checkPin returns null until the user signs in, then the token', async () => {
    expect(await checkPin(4242, 'ABCD')).toBeNull()
    state.pinAuthToken = TOKEN
    expect(await checkPin(4242, 'ABCD')).toBe(TOKEN)
  })

  it('getPlexUser reads username and homeAdmin, and maps a bad token to unauthorized', async () => {
    expect(await getPlexUser(TOKEN)).toEqual({ username: 'synthetic-owner', homeAdmin: true })
    await expect(getPlexUser('wrong-token')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 })
  })

  it('listOwnedServers keeps only owned resources that provide a server', async () => {
    const connections = [{ uri: 'https://a.example:32400', local: true, relay: false }]
    state.resources = [
      { name: 'Mine', clientIdentifier: 'm1', provides: 'server,player', owned: true, accessToken: 'tok-m1', connections },
      { name: 'Shared', clientIdentifier: 'm2', provides: 'server', owned: false, accessToken: 'tok-m2', connections },
      { name: 'Phone', clientIdentifier: 'c1', provides: 'client,player', owned: true, accessToken: 'tok-c1', connections }
    ]
    expect(await listOwnedServers(TOKEN)).toEqual([{ machineId: 'm1', name: 'Mine', accessToken: 'tok-m1', connections }])
  })
})

describe('pickConnection', () => {
  const sockets: Server[] = []
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close()
  })

  async function listenHanging() {
    const hanging = createServer(() => {})
    await new Promise<void>(resolve => hanging.listen(0, '127.0.0.1', resolve))
    sockets.push(hanging)
    return `http://127.0.0.1:${(hanging.address() as AddressInfo).port}`
  }

  async function refusedUri() {
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const { port } = closed.address() as AddressInfo
    await new Promise<void>(resolve => closed.close(() => resolve()))
    return `http://127.0.0.1:${port}`
  }

  it('returns the one reachable uri out of a hanging, a refused and a reachable one', async () => {
    const resource = {
      machineId: 'm1',
      name: 'Mine',
      accessToken: TOKEN,
      connections: [
        { uri: await listenHanging(), local: true, relay: false },
        { uri: await refusedUri(), local: true, relay: false },
        { uri: fake.url, local: false, relay: true }
      ]
    }
    expect(await pickConnection(resource, undefined, 200)).toBe(fake.url)
  })

  it('prefers a local connection that answers over a faster relay', async () => {
    const slowLocal = createHttpServer((_request, response) => {
      setTimeout(() => response.writeHead(200, { 'content-type': 'application/json' }).end('{}'), 100)
    })
    await new Promise<void>(resolve => slowLocal.listen(0, '127.0.0.1', resolve))
    const slowLocalUri = `http://127.0.0.1:${(slowLocal.address() as AddressInfo).port}`
    const resource = {
      machineId: 'm1',
      name: 'Mine',
      accessToken: TOKEN,
      connections: [{ uri: fake.url, local: false, relay: true }, { uri: slowLocalUri, local: true, relay: false }]
    }
    try {
      expect(await pickConnection(resource, undefined, 1000)).toBe(slowLocalUri)
    } finally {
      slowLocal.close()
    }
  })

  it('sections() gives up after the given timeout instead of the 60 s default', async () => {
    const hanging = new PlexServer({ url: await listenHanging(), token: TOKEN })
    const startedAt = Date.now()
    await expect(hanging.sections({ timeoutMs: 200 })).rejects.toMatchObject({ kind: 'unreachable' })
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it('tries only the override when given, and throws unreachable when nothing answers', async () => {
    const resource = { machineId: 'm1', name: 'Mine', accessToken: TOKEN, connections: [{ uri: fake.url, local: true, relay: false }] }
    const dead = await refusedUri()
    await expect(pickConnection(resource, dead, 200)).rejects.toMatchObject({ kind: 'unreachable' })
    expect(fake.calls).toEqual([])
    expect(await pickConnection(resource, fake.url, 200)).toBe(fake.url)
  })
})

describe('PlexServer reads', () => {
  it('lists accounts and sections', async () => {
    expect(await server.accounts()).toEqual([{ id: 0, name: '' }, { id: 1, name: 'synthetic-owner' }, { id: 2, name: 'synthetic-guest' }])
    expect(await server.sections()).toEqual([
      { id: 1, type: 'movie', title: 'Films', agent: 'tv.plex.agents.movie' },
      { id: 2, type: 'show', title: 'Series', agent: 'tv.plex.agents.series' }
    ])
  })

  it('listItems parses guids, indexes and watched fields', async () => {
    state.items = [
      { sectionId: 1, ratingKey: '10', type: 'movie', title: 'Synthetic Film', guids: ['imdb://tt0000001', 'tmdb://111'], viewCount: 2, lastViewedAt: 1700000000 },
      { sectionId: 2, ratingKey: '20', type: 'show', title: 'Synthetic Show', guids: ['tmdb://222'] },
      { sectionId: 2, ratingKey: '21', type: 'episode', title: 'Pilot', guids: ['tmdb://333', 'tvdb://9'], parentRatingKey: '20x', grandparentRatingKey: '20', parentIndex: 1, index: 3, lastViewedAt: 1700000001 }
    ]
    expect(await server.listItems(1, 1)).toEqual([
      { ratingKey: '10', kind: 'movie', title: 'Synthetic Film', guids: ['imdb://tt0000001', 'tmdb://111'], viewCount: 2, lastViewedAt: 1700000000 }
    ])
    const episodes = await server.listItems(2, 4)
    expect(episodes).toEqual([
      { ratingKey: '21', kind: 'episode', title: 'Pilot', parentRatingKey: '20x', grandparentRatingKey: '20', guids: ['tmdb://333', 'tvdb://9'], parentIndex: 1, index: 3, viewCount: 0, lastViewedAt: 1700000001 }
    ])
    expect(episodes[0]!.guids.find(guid => guid.startsWith('tmdb://'))).toBe('tmdb://333')
  })

  it('history pages across 1,001 entries, filters by account and section, and honours viewedAfter', async () => {
    state.history = Array.from({ length: 1001 }, (_, index) => ({ historyId: index + 1, ratingKey: '10', viewedAt: 1_700_000_000 + index, accountId: 1, sectionId: 1 }))
    state.history.push({ historyId: 5000, ratingKey: '10', viewedAt: 1_700_000_500, accountId: 2, sectionId: 1 })
    state.history.push({ historyId: 5001, ratingKey: '20', viewedAt: 1_700_000_501, accountId: 1, sectionId: 2 })

    const owner = await server.history({ accountId: 1, sectionIds: [1] })
    expect(owner).toHaveLength(1001)
    expect(owner[0]).toEqual({ historyId: 1, ratingKey: '10', viewedAt: 1_700_000_000, accountId: 1, sectionId: 1 })
    expect(owner.at(-1)!.historyId).toBe(1001)
    expect(owner.every(entry => entry.accountId === 1 && entry.sectionId === 1)).toBe(true)
    expect(fake.calls.filter(call => call.path === '/status/sessions/history/all')).toHaveLength(2)

    expect((await server.history({ accountId: 1, sectionIds: [1], viewedAfter: 1_700_000_998 })).map(entry => entry.historyId)).toEqual([1000, 1001])

    const both = await server.history({ accountId: 1, sectionIds: [1, 2], viewedAfter: 1_700_000_500 })
    expect(both).toHaveLength(501)
    expect(both.some(entry => entry.historyId === 5001 && entry.sectionId === 2)).toBe(true)
    expect(both.map(entry => entry.viewedAt)).toEqual(both.map(entry => entry.viewedAt).toSorted((left, right) => left - right))
  })

  it('sends the viewedAt> key percent-encoded, as requests does for plexapi', async () => {
    await server.history({ accountId: 1, sectionIds: [1], viewedAfter: 1_700_000_000 })
    expect(fake.rawUrls[0]).toContain('viewedAt%3E=1700000000')
    expect(fake.rawUrls[0]).toContain('sort=viewedAt%3Aasc')
  })

  it('history drops entries of other accounts even when the server ignores the filter', async () => {
    state.ignoreAccountFilter = true
    state.history = [
      { historyId: 1, ratingKey: '10', viewedAt: 1, accountId: 1, sectionId: 1 },
      { historyId: 2, ratingKey: '10', viewedAt: 2, accountId: 2, sectionId: 1 }
    ]
    expect((await server.history({ accountId: 1, sectionIds: [1] })).map(entry => entry.historyId)).toEqual([1])
  })

  it('listItems and sessions skip entries without a key or with an unknown type', async () => {
    state.items = [
      { sectionId: 1, ratingKey: '10', type: 'movie', title: 'ok', guids: [] },
      { sectionId: 1, ratingKey: '11', type: 'clip' as never, title: 'odd', guids: [] },
      { sectionId: 1, ratingKey: undefined as never, type: 'movie', title: 'keyless', guids: [] }
    ]
    expect((await server.listItems(1, 1)).map(item => item.ratingKey)).toEqual(['10'])
    state.sessions = [
      { sessionKey: '1', ratingKey: '10', state: 'playing', viewOffset: 0 },
      { sessionKey: undefined as never, ratingKey: '10', state: 'playing', viewOffset: 0 }
    ]
    expect((await server.sessions()).map(session => session.sessionKey)).toEqual(['1'])
  })

  it('sessions returns the live play state', async () => {
    state.sessions = [{ sessionKey: '13', ratingKey: '10', userId: 1, userTitle: 'synthetic-owner', state: 'playing', viewOffset: 5000 }]
    expect(await server.sessions()).toEqual([{ sessionKey: '13', ratingKey: '10', userId: 1, userTitle: 'synthetic-owner', state: 'playing', viewOffset: 5000 }])
  })

  it('maps a 401 to unauthorized without leaking the token', async () => {
    const rejected = new PlexServer({ url: fake.url, token: TOKEN + '-wrong' })
    const error = await rejected.accounts().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ kind: 'unauthorized', status: 401 })
    expect(JSON.stringify(error)).not.toContain(TOKEN)
    expect((error as Error).message).toBe('GET /accounts returned 401')
  })

  it('maps a refused connection to unreachable without leaking the token', async () => {
    await fake.stop()
    const error = await server.accounts().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ kind: 'unreachable' })
    assertNoTokenLeak(error)
    fake = await startFakePlex(state)
  })
})

describe('PlexServer writes', () => {
  beforeEach(() => {
    state.items = [{ sectionId: 1, ratingKey: '10', type: 'movie', title: 'Synthetic Film', guids: [] }]
    state.history = [{ historyId: 7, ratingKey: '10', viewedAt: 1_700_000_000, accountId: 1, sectionId: 1 }]
  })

  it.each(['off', 'read-only'])('makes no request in %s mode', async (mode) => {
    runtimePlex.syncMode = mode
    await server.scrobble('10')
    await server.unscrobble('10')
    await server.deleteHistory(7)
    expect(fake.calls).toEqual([])
    expect(state.history).toHaveLength(1)
  })

  it('logs nothing on writes in off mode', async () => {
    runtimePlex.syncMode = 'off'
    await server.scrobble('10')
    await server.unscrobble('10')
    await server.deleteHistory(7)
    for (const level of [log.debug, log.info, log.warn, log.error]) expect(level).not.toHaveBeenCalled()
  })

  it('logs the skip line at info in read-only mode', async () => {
    runtimePlex.syncMode = 'read-only'
    await server.scrobble('10')
    await server.deleteHistory(7)
    expect(log.info).toHaveBeenCalledWith({ action: 'scrobble', ratingKey: '10' }, 'plex write skipped (read-only)')
    expect(log.info).toHaveBeenCalledWith({ action: 'deleteHistory', historyId: 7 }, 'plex write skipped (read-only)')
  })

  it('makes one request per write in on mode', async () => {
    await server.scrobble('10')
    expect(fake.calls).toEqual([{ method: 'GET', path: '/:/scrobble' }])
    expect(state.items[0]!.viewCount).toBe(1)
    await server.unscrobble('10')
    expect(fake.calls.at(-1)).toEqual({ method: 'GET', path: '/:/unscrobble' })
    expect(state.items[0]!.viewCount).toBeUndefined()
    await server.deleteHistory(7)
    expect(fake.calls.at(-1)).toEqual({ method: 'DELETE', path: '/status/sessions/history/7' })
    expect(state.history).toEqual([])
  })
})

describe('fake websocket', () => {
  it('pushes notifications to sockets and records the header token', async () => {
    const socket = new WebSocket(fake.url.replace('http', 'ws') + '/:/websockets/notifications', { headers: { 'X-Plex-Token': TOKEN } })
    const received = new Promise<unknown>(resolve => socket.once('message', data => resolve(JSON.parse(String(data)))))
    await new Promise(resolve => socket.once('open', resolve))
    fake.push({ type: 'playing', size: 1 })
    expect(await received).toEqual({ NotificationContainer: { type: 'playing', size: 1 } })
    expect(fake.websocketTokens).toEqual([TOKEN])
    socket.close()
  })
})
