import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex } from '../fixtures/plex/fakePlex'
import { createServerHandlerHarness, event } from './serverHandlerHarness'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const reconnectCounter = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('../../server/utils/metrics', () => ({ recordPlexListenerReconnect: reconnectCounter }))
let syncMode = 'read-only'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier: 'test-client-id' } }))

const harness = createServerHandlerHarness()

const { PlexListener, connectPlexWebSocket, createCoalescedRunner, createListenerRegistry } = await import('~~/server/utils/plex/listener')
const { PlexError } = await import('~~/server/utils/plex/client')
type ListenerSocket = import('~~/server/utils/plex/listener').ListenerSocket
type PlexConnectionRow = import('~~/server/utils/plex/connection').PlexConnectionRow

class FakeSocket implements ListenerSocket {
  onopen: (() => void) | null = null
  onmessage: ((message: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  close() { this.closed = true }
  open() { this.onopen?.() }
  drop() { this.onclose?.() }
  notify(...states: { sessionKey: string, state: string }[]) {
    this.onmessage?.({ data: JSON.stringify({ NotificationContainer: { type: 'playing', size: states.length, PlaySessionStateNotification: states.map(entry => ({ ratingKey: '1', viewOffset: 0, ...entry })) } }) })
  }
}

const CONNECTION = { userId: 42, serverUrl: 'http://plex.local:32400', serverUrlOverride: null, serverToken: 'secret-token-value' }

function setup() {
  const sockets: FakeSocket[] = []
  const connect = vi.fn((_url: string, _token: string) => {
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  })
  const onPlaybackChange = vi.fn()
  const listener = new PlexListener(CONNECTION, { connect, onPlaybackChange, now: () => Date.now() })
  return { sockets, connect, onPlaybackChange, listener }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  Object.values(log).forEach(spy => spy.mockClear())
  reconnectCounter.mockClear()
  syncMode = 'read-only'
})
afterEach(() => vi.useRealTimers())

describe('PlexListener reconnect', () => {
  it('connects to the websocket path with the token as a separate argument, never in the URL', () => {
    const { listener, connect } = setup()
    listener.start()
    expect(connect).toHaveBeenCalledWith('ws://plex.local:32400/:/websockets/notifications', 'secret-token-value')
    expect(connect.mock.calls[0]![0]).not.toContain('secret-token-value')
  })

  it('reports reconnecting until the socket opens, then connected', () => {
    const { listener, sockets } = setup()
    listener.start()
    expect(listener.status().state).toBe('reconnecting')
    sockets[0]!.open()
    expect(listener.status()).toEqual({ state: 'connected', since: Date.now() })
  })

  it('reconnects after 1, 2, 4 s and caps at 60 s', async () => {
    const { listener, sockets, connect } = setup()
    listener.start()
    const delays: number[] = []
    for (let attempt = 0; attempt < 9; attempt++) {
      const before = connect.mock.calls.length
      sockets.at(-1)!.drop()
      let waited = 0
      while (connect.mock.calls.length === before) {
        await vi.advanceTimersByTimeAsync(500)
        waited += 500
      }
      delays.push(waited)
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000])
  })

  it('resets the backoff after a successful open', async () => {
    const { listener, sockets, connect } = setup()
    listener.start()
    sockets[0]!.drop()
    await vi.advanceTimersByTimeAsync(1000)
    sockets[1]!.drop()
    await vi.advanceTimersByTimeAsync(2000)
    sockets[2]!.open()
    sockets[2]!.drop()
    await vi.advanceTimersByTimeAsync(999)
    expect(connect).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(connect).toHaveBeenCalledTimes(4)
  })

  it('logs a warn and counts each reconnect without the token', async () => {
    const { listener, sockets } = setup()
    listener.start()
    sockets[0]!.drop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(reconnectCounter).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalled()
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('secret-token-value')
  })

  it('stop() cancels a pending reconnect and closes the socket', async () => {
    const { listener, sockets, connect } = setup()
    listener.start()
    sockets[0]!.drop()
    listener.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(connect).toHaveBeenCalledTimes(1)

    const second = setup()
    second.listener.start()
    second.listener.stop()
    expect(second.sockets[0]!.closed).toBe(true)
  })

  it('keeps scheduling when connect throws and stays reconnecting', async () => {
    const connect = vi.fn(() => {
      throw new Error('boom')
    })
    const listener = new PlexListener(CONNECTION, { connect, onPlaybackChange: vi.fn(), now: () => Date.now() })
    listener.start()
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000)
    expect(connect).toHaveBeenCalledTimes(4)
    expect(listener.status().state).toBe('reconnecting')
    listener.stop()
  })

  it('does not reconnect twice when a socket errors and then closes', async () => {
    const { listener, sockets, connect } = setup()
    listener.start()
    sockets[0]!.onerror?.()
    sockets[0]!.drop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(connect).toHaveBeenCalledTimes(2)
  })
})

describe('PlexListener playing notifications', () => {
  it('fires one debounced change per settled change across state changes', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    onPlaybackChange.mockClear()

    sockets[0]!.notify({ sessionKey: '9', state: 'playing' })
    await vi.advanceTimersByTimeAsync(1000)
    sockets[0]!.notify({ sessionKey: '9', state: 'paused' })
    await vi.advanceTimersByTimeAsync(1999)
    expect(onPlaybackChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onPlaybackChange).toHaveBeenCalledTimes(1)

    sockets[0]!.notify({ sessionKey: '9', state: 'stopped' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(onPlaybackChange).toHaveBeenCalledTimes(2)
  })

  it('ignores a notification whose state is unchanged for its session', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    sockets[0]!.notify({ sessionKey: '9', state: 'playing' })
    await vi.advanceTimersByTimeAsync(2000)
    onPlaybackChange.mockClear()
    sockets[0]!.notify({ sessionKey: '9', state: 'playing' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(onPlaybackChange).not.toHaveBeenCalled()
  })

  it('tracks state per session key', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    sockets[0]!.notify({ sessionKey: '1', state: 'playing' })
    await vi.advanceTimersByTimeAsync(2000)
    onPlaybackChange.mockClear()
    sockets[0]!.notify({ sessionKey: '2', state: 'playing' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(onPlaybackChange).toHaveBeenCalledTimes(1)
  })

  it('treats a repeated stopped as unchanged and a new playing on the same key as a change', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    sockets[0]!.notify({ sessionKey: '9', state: 'playing' })
    sockets[0]!.notify({ sessionKey: '9', state: 'stopped' })
    await vi.advanceTimersByTimeAsync(2000)
    onPlaybackChange.mockClear()
    sockets[0]!.notify({ sessionKey: '9', state: 'stopped' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(onPlaybackChange).not.toHaveBeenCalled()
    sockets[0]!.notify({ sessionKey: '9', state: 'playing' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(onPlaybackChange).toHaveBeenCalledTimes(1)
  })

  it('ignores other notification types and malformed messages', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    onPlaybackChange.mockClear()
    sockets[0]!.onmessage?.({ data: JSON.stringify({ NotificationContainer: { type: 'activity', ActivityNotification: [] } }) })
    sockets[0]!.onmessage?.({ data: 'not json' })
    sockets[0]!.onmessage?.({ data: JSON.stringify({ NotificationContainer: { type: 'playing' } }) })
    await vi.advanceTimersByTimeAsync(5000)
    expect(onPlaybackChange).not.toHaveBeenCalled()
  })

  it('requests a pull when the socket opens, to catch up after a gap', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    expect(onPlaybackChange).toHaveBeenCalledTimes(1)
  })

  it('stop() drops a pending debounced change', async () => {
    const { listener, sockets, onPlaybackChange } = setup()
    listener.start()
    sockets[0]!.notify({ sessionKey: '9', state: 'playing' })
    listener.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(onPlaybackChange).not.toHaveBeenCalled()
  })
})

describe('createCoalescedRunner', () => {
  it('never overlaps and runs once more when requested during a run', async () => {
    let active = 0
    let maxActive = 0
    const releases: (() => void)[] = []
    const task = vi.fn(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise<void>(resolve => releases.push(resolve))
      active--
    })
    const run = createCoalescedRunner(task)
    const first = run()
    const second = run()
    const third = run()
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(1)
    releases[0]!()
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(2)
    releases[1]!()
    await Promise.all([first, second, third])
    expect(task).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })

  it('keeps running after a task throws', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('first')).mockResolvedValue(undefined)
    const run = createCoalescedRunner(task)
    await expect(run()).rejects.toThrow('first')
    await run()
    expect(task).toHaveBeenCalledTimes(2)
  })
})

const REGISTRY_CONNECTION = { ...CONNECTION, id: 5, ownerAccountId: 1, plexUsername: 'synthetic-owner', tokenInvalid: false } as unknown as PlexConnectionRow

function registryHarness(overrides: Partial<Parameters<typeof createListenerRegistry>[0]> = {}) {
  const sockets: FakeSocket[] = []
  const pull = vi.fn(async (..._args: unknown[]) => {})
  const queueSearchReindex = vi.fn(async (_userId: number) => {})
  const sessions = vi.fn(async () => [] as { sessionKey: string, ratingKey: string, userId?: number, userTitle?: string, state: string, viewOffset: number }[])
  const registry = createListenerRegistry({
    loadConnection: async () => REGISTRY_CONNECTION,
    connect: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    pullHistory: pull,
    flagTokenInvalid: async () => {},
    queueSearchReindex,
    sessions,
    resolveItems: async (_userId, _connectionId, ratingKeys) => new Map(ratingKeys.filter(key => key !== '999').map(key => [key, { titleId: Number(key), type: 'tv' as const, name: `Title ${key}`, season: null, number: null }])),
    ...overrides
  })
  return { registry, sockets, pull, sessions, queueSearchReindex }
}

describe('listenerRegistry', () => {
  it('startFor opens a listener and pulls on the 5 minute safety net until stopFor', async () => {
    const { registry, pull, sockets } = registryHarness()
    await registry.startFor(42)
    expect(sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(pull).toHaveBeenCalled()
    expect(registry.statusFor(42)?.state).toBe('reconnecting')
    pull.mockClear()
    registry.stopFor(42)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(pull).not.toHaveBeenCalled()
    expect(registry.statusFor(42)).toBeNull()
  })

  it('sends search/library.changed for the user after a successful pull, not after a failed one', async () => {
    const pull = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'))
    const { registry, queueSearchReindex } = registryHarness({ pullHistory: pull })
    await registry.startFor(42)

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(queueSearchReindex).toHaveBeenCalledExactlyOnceWith(42)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(pull).toHaveBeenCalledTimes(2)
    expect(queueSearchReindex).toHaveBeenCalledTimes(1)
    registry.stopAll()
  })

  it('startFor replaces an existing listener for the same user', async () => {
    const { registry, sockets } = registryHarness()
    await registry.startFor(42)
    await registry.startFor(42)
    expect(sockets).toHaveLength(2)
    expect(sockets[0]!.closed).toBe(true)
  })

  it('startFor does nothing when sync is off or there is no connection', async () => {
    syncMode = 'off'
    const off = registryHarness()
    await off.registry.startFor(42)
    expect(off.sockets).toHaveLength(0)
    syncMode = 'read-only'
    const none = registryHarness({ loadConnection: async () => null })
    await none.registry.startFor(42)
    expect(none.sockets).toHaveLength(0)
  })

  it('a settled playback change pulls through the per-user runner without overlap', async () => {
    let release: () => void = () => {}
    const pull = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const { registry, sockets } = registryHarness({ pullHistory: pull })
    await registry.startFor(42)
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    sockets[0]!.notify({ sessionKey: '1', state: 'playing' })
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(pull).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(2)
    release()
    registry.stopAll()
  })

  it('overlapping startFor calls leave one listener and stopAll stops it', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { registry, sockets } = registryHarness({ loadConnection: async () => {
      await gate
      return REGISTRY_CONNECTION
    } })
    const first = registry.startFor(42)
    const second = registry.startFor(42)
    release()
    await Promise.all([first, second])
    expect(sockets).toHaveLength(1)
    registry.stopAll()
    expect(sockets[0]!.closed).toBe(true)
    expect(registry.statusFor(42)).toBeNull()
  })

  it('a stopFor during a pending startFor prevents the listener from starting', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { registry, sockets } = registryHarness({ loadConnection: async () => {
      await gate
      return REGISTRY_CONNECTION
    } })
    const starting = registry.startFor(42)
    registry.stopFor(42)
    release()
    await starting
    expect(sockets).toHaveLength(0)
    expect(registry.statusFor(42)).toBeNull()
  })

  it('a stopAll during a pending startFor prevents the listener from starting', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { registry, sockets } = registryHarness({ loadConnection: async () => {
      await gate
      return REGISTRY_CONNECTION
    } })
    const starting = registry.startFor(42)
    registry.stopAll()
    release()
    await starting
    expect(sockets).toHaveLength(0)
    expect(registry.statusFor(42)).toBeNull()
  })

  it('replacing a listener mid-pull does not overlap pulls for the user', async () => {
    const releases: (() => void)[] = []
    let active = 0
    let maxActive = 0
    const pull = vi.fn(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise<void>(resolve => releases.push(resolve))
      active--
    })
    const { registry, sockets } = registryHarness({ pullHistory: pull })
    await registry.startFor(42)
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    await registry.startFor(42)
    sockets[1]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    expect(pull).toHaveBeenCalledTimes(1)
    releases[0]!()
    await vi.advanceTimersByTimeAsync(0)
    releases[1]!()
    await vi.advanceTimersByTimeAsync(0)
    expect(maxActive).toBe(1)
    registry.stopAll()
  })

  it('nowPlaying keeps the owner sessions by account id or username and omits unmapped items', async () => {
    const { registry } = registryHarness({
      sessions: async () => [
        { sessionKey: 'a', ratingKey: '11', userId: 1, state: 'playing', viewOffset: 0 },
        { sessionKey: 'b', ratingKey: '12', userTitle: 'synthetic-owner', state: 'paused', viewOffset: 0 },
        { sessionKey: 'c', ratingKey: '13', userId: 2, userTitle: 'synthetic-guest', state: 'playing', viewOffset: 0 },
        { sessionKey: 'd', ratingKey: '999', userId: 1, state: 'playing', viewOffset: 0 }
      ]
    })
    expect(await registry.nowPlaying(42)).toEqual([
      { titleId: 11, type: 'tv', name: 'Title 11' },
      { titleId: 12, type: 'tv', name: 'Title 12' }
    ])
  })

  it('nowPlaying resolves items for the calling user and connection', async () => {
    const resolveItems = vi.fn(async () => new Map())
    const { registry } = registryHarness({
      sessions: async () => [{ sessionKey: 'a', ratingKey: '11', userId: 1, state: 'playing', viewOffset: 0 }],
      resolveItems
    })
    await registry.nowPlaying(42)
    expect(resolveItems).toHaveBeenCalledWith(42, expect.any(Number), ['11'])
  })

  it('nowPlaying includes season and number for episodes', async () => {
    const { registry } = registryHarness({
      sessions: async () => [{ sessionKey: 'a', ratingKey: '11', userId: 1, state: 'playing', viewOffset: 0 }],
      resolveItems: async () => new Map([['11', { titleId: 11, type: 'anime' as const, name: 'Show', season: 1, number: 4 }]])
    })
    expect(await registry.nowPlaying(42)).toEqual([{ titleId: 11, type: 'anime', name: 'Show', season: 1, number: 4 }])
  })

  it('nowPlaying is empty when loading the connection throws', async () => {
    const broken = registryHarness({ loadConnection: async () => {
      throw new Error('db down')
    } })
    expect(await broken.registry.nowPlaying(42)).toEqual([])
  })

  it('nowPlaying is empty when not connected, when sync is off, and when Plex is unreachable', async () => {
    const none = registryHarness({ loadConnection: async () => null })
    expect(await none.registry.nowPlaying(42)).toEqual([])
    syncMode = 'off'
    expect(await registryHarness().registry.nowPlaying(42)).toEqual([])
    syncMode = 'read-only'
    const unreachable = registryHarness({ sessions: async () => {
      throw new PlexError('unreachable', 'GET /status/sessions could not connect')
    } })
    expect(await unreachable.registry.nowPlaying(42)).toEqual([])
    expect(log.warn).toHaveBeenCalled()
  })
})

describe('pull errors', () => {
  it('logs a pull failure and flags the token on unauthorized, never throwing out of the listener', async () => {
    const flagTokenInvalid = vi.fn(async () => {})
    const failing = vi.fn(async () => {
      throw new PlexError('unauthorized', 'GET /status/sessions/history/all returned 401', 401)
    })
    const { registry, sockets } = registryHarness({ pullHistory: failing, flagTokenInvalid })
    await registry.startFor(42)
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    expect(failing).toHaveBeenCalledTimes(1)
    expect(flagTokenInvalid).toHaveBeenCalledWith(5)
    expect(log.warn).toHaveBeenCalled()
    registry.stopAll()
  })

  it('logs other pull failures at error', async () => {
    const failing = vi.fn(async () => {
      throw new Error('db down')
    })
    const { registry, sockets } = registryHarness({ pullHistory: failing })
    await registry.startFor(42)
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(2000)
    expect(log.error).toHaveBeenCalled()
    registry.stopAll()
  })
})

describe('now-playing route', () => {
  it('returns the registry items for the session user', async () => {
    harness.setSession({ user: { id: 42 } })
    vi.resetModules()
    const nowPlaying = vi.fn(async () => [{ titleId: 1, type: 'tv', name: 'X' }])
    vi.doMock('~~/server/utils/plex/listener', () => ({ listenerRegistry: { nowPlaying } }))
    const handler = (await import('~~/server/api/plex/now-playing.get')).default as (e: unknown) => Promise<unknown>
    expect(await handler(event({}))).toEqual({ items: [{ titleId: 1, type: 'tv', name: 'X' }] })
    expect(nowPlaying).toHaveBeenCalledWith(42)
    vi.doUnmock('~~/server/utils/plex/listener')
  })
})

describe('connectPlexWebSocket against the fake Plex', () => {
  let fake: FakePlex

  beforeEach(async () => {
    vi.useRealTimers()
    fake = await startFakePlex(createFakePlexState())
  })
  afterEach(() => fake.stop())

  it('the pull a new listener runs on open reads Plex history only from the connection\'s history cursor', async () => {
    const { pullHistory } = await import('~~/server/utils/plex/inbound')
    const inboundStore = {
      mappedItems: async () => new Map(), unresolvedEntries: async () => [], storedHistoryIds: async () => new Set<number>(), existingPlays: async () => [],
      insertPlays: async () => [], saveUnresolved: async () => {}, removeUnresolved: async () => {}, saveProgress: async () => {}
    }
    const pull = vi.fn((connection: PlexConnectionRow, server: InstanceType<typeof import('~~/server/utils/plex/client').PlexServer>) => pullHistory(connection, server, {}, inboundStore))
    const sockets: FakeSocket[] = []
    const registry = createListenerRegistry({
      loadConnection: async () => ({ ...REGISTRY_CONNECTION, serverUrl: fake.url, serverToken: 'fake-plex-token', sectionIds: ['1'], historyCursor: 1_750_000_000, lastPlayAt: null }),
      connect: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
      pullHistory: pull
    })
    await registry.startFor(42)
    sockets[0]!.open()
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1), { timeout: 4000 })
    await pull.mock.results[0]!.value
    registry.stopAll()
    const historyRequests = fake.rawUrls.filter(url => url.includes('/status/sessions/history/all'))
    expect(historyRequests).toHaveLength(1)
    expect(new URL(historyRequests[0]!, fake.url).searchParams.get('viewedAt>')).toBe('1749999999')
  })

  it('authenticates by X-Plex-Token header and delivers pushed notifications', async () => {
    const received: unknown[] = []
    const opened = new Promise<void>((resolve) => {
      const socket = connectPlexWebSocket(`${fake.url.replace('http', 'ws')}/:/websockets/notifications`, 'fake-plex-token')
      socket.onmessage = message => received.push(message.data)
      socket.onopen = () => resolve()
    })
    await opened
    fake.push({ type: 'playing', PlaySessionStateNotification: [{ sessionKey: '1', state: 'playing', ratingKey: '2', viewOffset: 0 }] })
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(fake.websocketTokens).toEqual(['fake-plex-token'])
    expect(fake.rawUrls.join()).not.toContain('fake-plex-token')
  })
})
