import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const send = vi.hoisted(() => vi.fn())
const registry = vi.hoisted(() => ({ startFor: vi.fn(), stopFor: vi.fn(), statusFor: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send } }))
const storage = new Map<string, unknown>()
vi.stubGlobal('useStorage', () => ({
  setItem: async (key: string, value: unknown) => void storage.set(key, value),
  getItem: async (key: string) => storage.get(key) ?? null,
  removeItem: async (key: string) => void storage.delete(key)
}))
vi.mock('~~/server/utils/plex/listener', () => ({ listenerRegistry: registry }))
let syncMode = 'on'
let clientIdentifier = 'test-client-id'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier } }))

const harness = createServerHandlerHarness()
const { plexConnections } = await import('~~/server/db/schema')
const { PlexServer, setPlexTvBaseUrl } = await import('~~/server/utils/plex/client')

type Handler = (e: unknown) => Promise<unknown>
const pinPost = (await import('~~/server/api/plex/pin.post')).default as Handler
const pinGet = (await import('~~/server/api/plex/pin/[id].get')).default as Handler
const connectPost = (await import('~~/server/api/plex/connect.post')).default as Handler
const statusGet = (await import('~~/server/api/plex/status.get')).default as Handler
const librariesPut = (await import('~~/server/api/plex/libraries.put')).default as Handler
const scanPost = (await import('~~/server/api/plex/scan.post')).default as Handler
const reconcilePost = (await import('~~/server/api/plex/reconcile.post')).default as Handler
const connectionDelete = (await import('~~/server/api/plex/connection.delete')).default as Handler
const unmatchedGet = (await import('~~/server/api/plex/unmatched.get')).default as Handler

const USER = { id: 42, email: 'a@b.c', name: 'A' }
const ACCOUNT_TOKEN = 'account-token-secret'
const SERVER_TOKEN = 'server-token-secret'
const OVERRIDE_URL = 'http://override.invalid:32400'

let state: FakePlexState
let plex: FakePlex

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5, userId: USER.id, accountToken: ACCOUNT_TOKEN, serverToken: SERVER_TOKEN, serverMachineId: 'machine-1', serverName: 'Home',
    serverUrl: plex.url, serverUrlOverride: OVERRIDE_URL, ownerAccountId: 1, plexUsername: 'synthetic-owner', sectionIds: ['1'],
    historyCursor: null, lastScanAt: new Date('2026-01-02T03:04:05Z'), lastPlayAt: null, lastReport: null, tokenInvalid: false, ...overrides
  }
}

const signedInSession = (extra: Record<string, unknown> = {}) => ({
  user: USER,
  secure: { plex: { pinId: 4242, code: 'ABCD', ...extra } }
})

beforeEach(async () => {
  harness.reset()
  vi.clearAllMocks()
  storage.clear()
  syncMode = 'on'
  clientIdentifier = 'test-client-id'
  send.mockResolvedValue(undefined)
  registry.startFor.mockResolvedValue(undefined)
  registry.statusFor.mockReturnValue(undefined)
  state = createFakePlexState({
    token: ACCOUNT_TOKEN,
    pinAuthToken: ACCOUNT_TOKEN,
    sections: [
      { id: 1, type: 'movie', title: 'Films', agent: 'tv.plex.agents.movie' },
      { id: 2, type: 'show', title: 'Series', agent: 'tv.plex.agents.series' },
      { id: 3, type: 'movie', title: 'Home videos', agent: 'com.plexapp.agents.none' },
      { id: 4, type: 'artist', title: 'Music', agent: 'tv.plex.agents.music' }
    ]
  })
  plex = await startFakePlex(state)
  state.resources = [{
    name: 'Home', clientIdentifier: 'machine-1', provides: 'server', owned: true, accessToken: ACCOUNT_TOKEN,
    connections: [{ uri: plex.url, local: true, relay: false }]
  }]
  setPlexTvBaseUrl(plex.url)
})

afterEach(async () => {
  setPlexTvBaseUrl(undefined)
  await plex.stop()
})

const rejectsWith = async (promise: Promise<unknown>, statusCode: number, message?: string) => {
  const error = await promise.then(() => null, (thrown: unknown) => thrown as { statusCode: number, message: string })
  expect(error?.statusCode).toBe(statusCode)
  if (message) expect(error?.message).toBe(message)
}

describe('plex routes: session', () => {
  it.each([
    ['pin.post', () => pinPost(event())],
    ['pin/[id].get', () => pinGet(event({ params: { id: '1' } }))],
    ['connect.post', () => connectPost(event({ body: {} }))],
    ['status.get', () => statusGet(event())],
    ['libraries.put', () => librariesPut(event({ body: { sectionIds: [] } }))],
    ['scan.post', () => scanPost(event())],
    ['reconcile.post', () => reconcilePost(event())],
    ['connection.delete', () => connectionDelete(event())],
    ['unmatched.get', () => unmatchedGet(event())]
  ])('%s answers 401 without a session', async (_name, call) => {
    await rejectsWith(call(), 401)
  })
})

describe('plex routes: sign-in', () => {
  beforeEach(() => harness.setSession({ user: USER }))

  it('pin.post returns the pin id and an auth url that forwards to the integrations tab, keeping the code in the server-only session', async () => {
    const result = await pinPost(event()) as { pinId: number, authUrl: string }
    expect(result.pinId).toBe(4242)
    expect(decodeURIComponent(result.authUrl)).toContain('forwardUrl=https://watchd.test/settings/integrations?pin=4242')
    expect(harness.sessionNow().secure).toEqual({ plex: { pinId: 4242, code: 'ABCD' } })
  })

  it('pin.post and connect.post answer 503 when sync is off or the client id is missing', async () => {
    syncMode = 'off'
    await rejectsWith(pinPost(event()), 503)
    await rejectsWith(connectPost(event({ body: { pinId: 4242, machineId: 'machine-1' } })), 503)
    syncMode = 'on'
    clientIdentifier = ''
    await rejectsWith(pinPost(event()), 503)
    expect(plex.calls).toEqual([])
  })

  it('pin/:id answers waiting until plex.tv hands out a token', async () => {
    harness.setSession({ user: USER, secure: { plex: { pinId: 4242, code: 'ABCD' } } })
    state.pinAuthToken = null
    expect(await pinGet(event({ params: { id: '4242' } }))).toEqual({ state: 'waiting' })
    expect(harness.mocks.replaceUserSession).not.toHaveBeenCalled()
  })

  it('pin/:id answers signed-in with the owned servers and keeps the account token server-side', async () => {
    harness.setSession({ user: USER, secure: { plex: { pinId: 4242, code: 'ABCD' } } })
    const result = await pinGet(event({ params: { id: '4242' } }))
    expect(result).toEqual({ state: 'signed-in', servers: [{ machineId: 'machine-1', name: 'Home' }] })
    expect(JSON.stringify(result)).not.toContain(ACCOUNT_TOKEN)
    expect(harness.sessionNow().secure).toEqual({ plex: { pinId: 4242, code: 'ABCD' } })
    expect(JSON.stringify(harness.sessionNow())).not.toContain(ACCOUNT_TOKEN)
    expect(storage.get(`plex-sign-in:${USER.id}:4242`)).toMatchObject({ accountToken: ACCOUNT_TOKEN })
    expect(harness.sessionNow().user).toEqual(USER)
  })

  it('pin/:id rejects a pin this session did not start', async () => {
    harness.setSession({ user: USER, secure: { plex: { pinId: 1, code: 'X' } } })
    await rejectsWith(pinGet(event({ params: { id: '4242' } })), 400)
    harness.setSession({ user: USER })
    await rejectsWith(pinGet(event({ params: { id: '4242' } })), 400)
  })
})

describe('plex routes: connect', () => {
  const body = { pinId: 4242, machineId: 'machine-1' }
  const seedToken = (expiresAt = Date.now() + 60_000) => storage.set(`plex-sign-in:${USER.id}:4242`, { accountToken: ACCOUNT_TOKEN, expiresAt })
  beforeEach(() => seedToken())

  it('answers 400 "Sign-in expired" when the stored token is missing or past its expiry', async () => {
    harness.setSession(signedInSession())
    seedToken(Date.now() - 1)
    await rejectsWith(connectPost(event({ body })), 400, 'Sign-in expired, sign in with Plex again')
    storage.clear()
    await rejectsWith(connectPost(event({ body })), 400, 'Sign-in expired, sign in with Plex again')
  })

  it('rejects a body that is not a pin id and machine id', async () => {
    harness.setSession(signedInSession())
    await rejectsWith(connectPost(event({ body: { pinId: 'x' } })), 400)
    await rejectsWith(connectPost(event({ body: { ...body, serverUrlOverride: 'ftp://x' } })), 400)
  })

  it('rejects a connect that does not follow a sign-in', async () => {
    harness.setSession({ user: USER })
    await rejectsWith(connectPost(event({ body })), 400)
    harness.setSession(signedInSession({ pinId: 7 }))
    await rejectsWith(connectPost(event({ body })), 400)
  })

  it('answers 400 for a non-admin plex.tv user', async () => {
    harness.setSession(signedInSession())
    state.user = { username: 'synthetic-owner', homeAdmin: false }
    await rejectsWith(connectPost(event({ body })), 400, `This Plex account isn't the server owner`)
    expect(harness.mocks.insertValues).not.toHaveBeenCalled()
  })

  it('answers 400 when no /accounts entry carries the plex.tv username', async () => {
    harness.setSession(signedInSession())
    state.user = { username: 'someone-else', homeAdmin: true }
    await rejectsWith(connectPost(event({ body })), 400, `This Plex account isn't the server owner`)
  })

  it('answers 502 without leaking urls when no connection answers', async () => {
    harness.setSession(signedInSession())
    state.resources[0]!.connections = [{ uri: 'http://127.0.0.1:1', local: true, relay: false }]
    const error = await connectPost(event({ body })).then(() => null, (thrown: unknown) => thrown as Error)
    expect(error).toMatchObject({ statusCode: 502, message: `Couldn't reach the Plex server from watchd — try the Server URL field` })
    expect(error?.message).not.toContain('127.0.0.1')
  })

  it('stores the connection with default libraries that skip agents.none and non-video types, starts the listener and queues the link', async () => {
    harness.setSession(signedInSession())
    harness.givenDb({ select: [[], [{ latest: null }]], insert: [[{ id: 5 }]] })
    const result = await connectPost(event({ body: { ...body, serverUrlOverride: plex.url } }))
    expect(result).toEqual({ connected: true, serverName: 'Home' })
    expect(harness.mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER.id, accountToken: ACCOUNT_TOKEN, serverToken: ACCOUNT_TOKEN, serverMachineId: 'machine-1', serverName: 'Home',
      serverUrl: plex.url, serverUrlOverride: plex.url, ownerAccountId: 1, plexUsername: 'synthetic-owner', sectionIds: ['1', '2'], historyCursor: null
    }))
    expect(registry.startFor).toHaveBeenCalledWith(USER.id)
    expect(send).toHaveBeenCalledWith({ name: 'plex/link.requested', data: { userId: USER.id, rerun: false } })
    expect(harness.sessionNow().secure).toEqual({})
    expect(storage.size).toBe(0)
    expect(harness.sessionNow().user).toEqual(USER)
  })

  it('starts a new connection\'s history cursor at the newest imported play, so the first pull skips older Plex history', async () => {
    harness.setSession(signedInSession())
    harness.givenDb({ select: [[], [{ latest: new Date('2026-03-01T00:00:00Z') }]], insert: [[{ id: 5 }]] })
    await connectPost(event({ body }))
    expect(harness.mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ historyCursor: Date.UTC(2026, 2, 1) / 1000 }))
  })

  it('updates a re-sign-in to the same server in place, keeping its cursor, libraries, item map and unmarked plays', async () => {
    harness.setSession(signedInSession())
    harness.givenDb({ select: [[connectionRow({ tokenInvalid: true, historyCursor: 1_700_000_000, sectionIds: ['2'] })]] })
    expect(await connectPost(event({ body }))).toEqual({ connected: true, serverName: 'Home' })
    expect(harness.mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      accountToken: ACCOUNT_TOKEN, serverToken: ACCOUNT_TOKEN, serverName: 'Home', serverUrl: plex.url, serverUrlOverride: null,
      ownerAccountId: 1, plexUsername: 'synthetic-owner', tokenInvalid: false
    }))
    const update = (harness.mocks.updateSet.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(update).not.toHaveProperty('historyCursor')
    expect(update).not.toHaveProperty('sectionIds')
    expect(harness.mocks.deleteWhere).not.toHaveBeenCalled()
    expect(harness.mocks.insertValues).not.toHaveBeenCalled()
    expect(harness.mocks.updateSet.mock.invocationCallOrder[0]).toBeLessThan(registry.startFor.mock.invocationCallOrder[0]!)
    expect(send).toHaveBeenCalledWith({ name: 'plex/link.requested', data: { userId: USER.id, rerun: false } })
  })

  it('replaces a connection to another server: restores its unmarked plays, then delete-then-insert, restarting the listener only after it commits', async () => {
    harness.setSession(signedInSession())
    harness.givenDb({ select: [[connectionRow({ serverMachineId: 'machine-old' })], [{ latest: null }], []], insert: [[{ id: 6 }]] })
    await connectPost(event({ body }))
    expect(harness.mocks.updateSet).toHaveBeenCalledWith({ deletedAt: null })
    expect(harness.mocks.deleteWhere).toHaveBeenCalledTimes(1)
    expect(harness.mocks.updateSet.mock.invocationCallOrder[0]).toBeLessThan(harness.mocks.deleteWhere.mock.invocationCallOrder[0]!)
    expect(harness.mocks.deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(harness.mocks.insertValues.mock.invocationCallOrder[0]!)
    expect(harness.mocks.insertValues.mock.invocationCallOrder[0]).toBeLessThan(registry.startFor.mock.invocationCallOrder[0]!)
    expect(registry.stopFor).not.toHaveBeenCalled()
  })

  it('leaves the old listener running when the replace fails', async () => {
    harness.setSession(signedInSession())
    harness.givenDb({ select: [[connectionRow({ serverMachineId: 'machine-old' })], [{ latest: null }], []], insertError: new Error('db down') })
    await expect(connectPost(event({ body }))).rejects.toThrow('db down')
    expect(registry.stopFor).not.toHaveBeenCalled()
    expect(registry.startFor).not.toHaveBeenCalled()
  })

  it('answers 503 when the link event cannot be queued', async () => {
    harness.setSession(signedInSession())
    harness.givenDb({ select: [[], [{ latest: null }]], insert: [[{ id: 5 }]] })
    send.mockRejectedValue(new Error('inngest down'))
    await rejectsWith(connectPost(event({ body })), 503)
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('plex routes: status', () => {
  beforeEach(() => harness.setSession({ user: USER }))

  it('reports not connected together with the mode', async () => {
    harness.givenDb({ select: [[]] })
    expect(await statusGet(event())).toEqual({ connected: false, mode: 'on' })
    syncMode = 'off'
    harness.givenDb({ select: [[]] })
    expect(await statusGet(event())).toEqual({ connected: false, mode: 'off' })
  })

  it('reports the connection without any token or url', async () => {
    const report = { pulled: { added: 1, duplicates: 0, unresolved: 0 }, pushed: 0, unmatched: { noTmdbGuid: 0, episodeNotInTmdb: 0 }, errors: 0, finishedAt: '2026-01-01T00:00:00.000Z' }
    state.token = SERVER_TOKEN
    harness.givenDb({ select: [[connectionRow({ lastReport: report, serverUrlOverride: plex.url })]] })
    registry.statusFor.mockReturnValue({ state: 'connected', since: 123 })
    const result = await statusGet(event())
    expect(result).toEqual({
      connected: true,
      serverName: 'Home',
      mode: 'on',
      listener: { state: 'connected', since: 123 },
      lastPlayAt: null,
      lastScanAt: '2026-01-02T03:04:05.000Z',
      tokenInvalid: false,
      sectionsAvailable: true,
      sections: [
        { id: '1', title: 'Films', type: 'movie', checked: true },
        { id: '2', title: 'Series', type: 'show', checked: false },
        { id: '3', title: 'Home videos', type: 'movie', checked: false }
      ],
      report
    })
    const text = JSON.stringify(result)
    for (const secret of [ACCOUNT_TOKEN, SERVER_TOKEN, plex.url, OVERRIDE_URL]) expect(text).not.toContain(secret)
  })

  it('status and unmatched read the libraries with a short display timeout', async () => {
    const sectionsSpy = vi.spyOn(PlexServer.prototype, 'sections')
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url })]] })
    await statusGet(event())
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url })], [], [{ count: 0 }]] })
    await unmatchedGet(event())
    expect(sectionsSpy.mock.calls).toEqual([[{ timeoutMs: 4000 }], [{ timeoutMs: 4000 }]])
    sectionsSpy.mockRestore()
  })

  it('reports listener null and still answers when the server is unreachable', async () => {
    harness.givenDb({ select: [[connectionRow({ serverUrl: 'http://127.0.0.1:1', serverUrlOverride: 'http://127.0.0.1:1' })]] })
    const result = await statusGet(event()) as { listener: unknown, sections: unknown[], sectionsAvailable: boolean }
    expect(result.listener).toBeNull()
    expect(result.sections).toEqual([])
    expect(result.sectionsAvailable).toBe(false)
  })
})

describe('plex routes: management', () => {
  beforeEach(() => harness.setSession({ user: USER }))

  it('libraries.put rejects an unknown or non-video section id with 400', async () => {
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN })]] })
    await rejectsWith(librariesPut(event({ body: { sectionIds: ['1', '99'] } })), 400)
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN })]] })
    await rejectsWith(librariesPut(event({ body: { sectionIds: ['4'] } })), 400)
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN })]] })
    await rejectsWith(librariesPut(event({ body: { sectionIds: 'x' } })), 400)
    expect(harness.mocks.updateSet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('libraries.put with no new section stores the choice, restarts the listener and queues a scan', async () => {
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN, sectionIds: ['1', '2'] })]] })
    await librariesPut(event({ body: { sectionIds: ['2'] } }))
    expect(harness.mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ sectionIds: ['2'] }))
    expect(registry.startFor).toHaveBeenCalledWith(USER.id)
    expect(send).toHaveBeenCalledWith({ name: 'plex/scan.requested', data: { userId: USER.id } })
  })

  it('libraries.put with an added section queues a link run instead', async () => {
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN, sectionIds: ['1'] })]] })
    await librariesPut(event({ body: { sectionIds: ['1', '2'] } }))
    expect(send).toHaveBeenCalledWith({ name: 'plex/link.requested', data: { userId: USER.id, rerun: false } })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('libraries.put answers 503 when nothing can be queued', async () => {
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN })]] })
    send.mockRejectedValue(new Error('down'))
    await rejectsWith(librariesPut(event({ body: { sectionIds: ['1'] } })), 503)
  })

  it('scan.post queues a scan and reconcile.post a re-run link', async () => {
    harness.givenDb({ select: [[connectionRow()]] })
    await scanPost(event())
    expect(send).toHaveBeenLastCalledWith({ name: 'plex/scan.requested', data: { userId: USER.id } })
    harness.givenDb({ select: [[connectionRow()]] })
    await reconcilePost(event())
    expect(send).toHaveBeenLastCalledWith({ name: 'plex/link.requested', data: { userId: USER.id, rerun: true } })
  })

  it('scan, reconcile and libraries answer 503 and queue nothing when sync is off', async () => {
    syncMode = 'off'
    harness.givenDb({ select: [[connectionRow()]] })
    await rejectsWith(scanPost(event()), 503, 'Plex sync is turned off on this server')
    harness.givenDb({ select: [[connectionRow()]] })
    await rejectsWith(reconcilePost(event()), 503, 'Plex sync is turned off on this server')
    harness.givenDb({ select: [[connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN })]] })
    await rejectsWith(librariesPut(event({ body: { sectionIds: ['1'] } })), 503, 'Plex sync is turned off on this server')
    expect(send).not.toHaveBeenCalled()
    expect(harness.mocks.updateSet).not.toHaveBeenCalled()
  })

  it('scan, reconcile and libraries answer 404 without a connection and 503 when the queue is down', async () => {
    harness.givenDb({ select: [[]] })
    await rejectsWith(scanPost(event()), 404)
    harness.givenDb({ select: [[]] })
    await rejectsWith(reconcilePost(event()), 404)
    harness.givenDb({ select: [[connectionRow()]] })
    send.mockRejectedValue(new Error('down'))
    await rejectsWith(scanPost(event()), 503)
  })

  it('connection.delete stops the listener, restores the plays it soft-deleted for Plex unmarks, then deletes only the connection row', async () => {
    harness.givenDb({ select: [[connectionRow()], []], delete: [{ id: 5 }] })
    expect(await connectionDelete(event())).toEqual({ success: true })
    expect(registry.stopFor).toHaveBeenCalledWith(USER.id)
    expect(harness.mocks.updateSet).toHaveBeenCalledTimes(1)
    expect(harness.mocks.updateSet).toHaveBeenCalledWith({ deletedAt: null })
    expect(harness.mocks.deleteFrom).toHaveBeenCalledWith(plexConnections)
    expect(harness.mocks.deleteWhere).toHaveBeenCalledTimes(1)
    expect(harness.mocks.updateSet.mock.invocationCallOrder[0]).toBeLessThan(harness.mocks.deleteWhere.mock.invocationCallOrder[0]!)
    expect(send).not.toHaveBeenCalled()
  })

  it('connection.delete without a connection changes nothing', async () => {
    harness.givenDb({ select: [[]] })
    expect(await connectionDelete(event())).toEqual({ success: true })
    expect(harness.mocks.updateSet).not.toHaveBeenCalled()
    expect(harness.mocks.deleteWhere).not.toHaveBeenCalled()
  })

  it('unmatched.get lists unmatched items with their library and the unresolved history count', async () => {
    harness.givenDb({
      select: [
        [connectionRow({ serverUrlOverride: plex.url, serverToken: ACCOUNT_TOKEN })],
        [
          { ratingKey: '10', kind: 'movie', name: 'Some Film', showName: null, sectionId: '1', reason: 'no-tmdb-guid' },
          { ratingKey: '11', kind: 'show', name: null, showName: null, sectionId: '2', reason: 'no-tmdb-guid' },
          { ratingKey: '12', kind: 'episode', name: 'Pilot', showName: 'Some Show', sectionId: '2', reason: 'episode-not-in-tmdb' },
          { ratingKey: '13', kind: 'episode', name: 'Orphan', showName: null, sectionId: '2', reason: 'episode-not-in-tmdb' }
        ],
        [{ count: 3 }]
      ]
    })
    expect(await unmatchedGet(event())).toEqual({
      items: [
        { name: 'Some Film', library: 'Films', reason: 'no-tmdb-guid' },
        { name: 'Plex item 11', library: 'Series', reason: 'no-tmdb-guid' },
        { name: 'Some Show — Pilot', library: 'Series', reason: 'episode-not-in-tmdb' },
        { name: 'Orphan', library: 'Series', reason: 'episode-not-in-tmdb' }
      ],
      unresolvedHistory: 3
    })
  })

  it('unmatched.get answers empty without a connection', async () => {
    harness.givenDb({ select: [[]] })
    expect(await unmatchedGet(event())).toEqual({ items: [], unresolvedHistory: 0 })
  })
})
