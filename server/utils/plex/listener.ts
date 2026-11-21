import { and, eq, inArray } from 'drizzle-orm'
import { plexItems, titles, userTitles } from '../../db/schema'
import { logger } from '../logger'
import { recordPlexListenerReconnect } from '../metrics'
import { PlexError } from './client'
import type { PlexServer } from './client'
import { plexClientIdentifier, plexSyncMode } from './config'
import { loadPlexConnection, plexServerFor } from './connection'
import type { PlexConnectionRow } from './connection'
import { pullHistory } from './inbound'
import { drizzlePlexOutboundStore } from './outbound'
import type { PlexSession } from './types'
import type { MediaType } from '../../../shared/utils/library/types'

const WEBSOCKET_PATH = '/:/websockets/notifications'
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 60_000
const DEBOUNCE_MS = 2000
const SAFETY_NET_INTERVAL_MS = 5 * 60_000

export interface ListenerSocket {
  onopen: (() => void) | null
  onmessage: ((message: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  close(): void
}

export interface ListenerDeps {
  connect(url: string, token: string): ListenerSocket
  onPlaybackChange(): void
  now(): number
}

export type ListenerStatus = { state: 'connected' | 'reconnecting' | 'error', since: number }

type ListenerConnection = Pick<PlexConnectionRow, 'userId' | 'serverUrl' | 'serverUrlOverride' | 'serverToken'>

interface PlaySessionStateNotification {
  sessionKey?: string | number
  state?: string
}

export function connectPlexWebSocket(url: string, token: string): ListenerSocket {
  // Bun's WebSocket takes request headers as a second argument; the DOM typings don't know it.
  const BunWebSocket = WebSocket as unknown as new (url: string, options: { headers: Record<string, string> }) => ListenerSocket
  return new BunWebSocket(url, {
    headers: { 'X-Plex-Token': token, 'X-Plex-Product': 'watchd', 'X-Plex-Client-Identifier': plexClientIdentifier() }
  })
}

function playingStatesIn(data: unknown): PlaySessionStateNotification[] {
  try {
    const container = JSON.parse(String(data))?.NotificationContainer
    if (container?.type !== 'playing' || !Array.isArray(container.PlaySessionStateNotification)) return []
    return container.PlaySessionStateNotification
  } catch {
    return []
  }
}

export class PlexListener {
  private socket: ListenerSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private stopped = true
  private currentStatus: ListenerStatus
  private readonly stateBySession = new Map<string, string>()
  private readonly url: string

  constructor(private readonly connection: ListenerConnection, private readonly deps: ListenerDeps) {
    this.url = `${(connection.serverUrlOverride ?? connection.serverUrl).replace(/\/+$/, '').replace(/^http/, 'ws')}${WEBSOCKET_PATH}`
    this.currentStatus = { state: 'reconnecting', since: deps.now() }
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.openSocket()
  }

  stop() {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.reconnectTimer = this.debounceTimer = null
    this.stateBySession.clear()
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
    }
  }

  status(): ListenerStatus {
    return { ...this.currentStatus }
  }

  private setStatus(state: ListenerStatus['state']) {
    if (this.currentStatus.state !== state) this.currentStatus = { state, since: this.deps.now() }
  }

  private openSocket() {
    let socket: ListenerSocket
    try {
      socket = this.deps.connect(this.url, this.connection.serverToken)
    } catch (error) {
      logger.warn({ userId: this.connection.userId, error: error instanceof Error ? error.message : 'unknown' }, 'plex listener could not connect')
      this.setStatus('reconnecting')
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.attempt = 0
      this.setStatus('connected')
      logger.warn({ userId: this.connection.userId }, 'plex listener connected')
      this.requestPlaybackChange()
    }
    socket.onmessage = message => this.handleMessage(message.data)
    socket.onerror = () => {
      if (this.socket === socket) this.setStatus('error')
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      logger.warn({ userId: this.connection.userId }, 'plex listener disconnected')
      if (this.currentStatus.state !== 'error') this.setStatus('reconnecting')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    const delayMs = Math.min(INITIAL_BACKOFF_MS * 2 ** this.attempt, MAX_BACKOFF_MS)
    this.attempt++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      recordPlexListenerReconnect()
      logger.warn({ userId: this.connection.userId, delayMs }, 'plex listener reconnecting')
      this.openSocket()
    }, delayMs)
  }

  private handleMessage(data: unknown) {
    let changed = false
    for (const { sessionKey, state } of playingStatesIn(data)) {
      if (sessionKey === undefined || typeof state !== 'string') continue
      const known = this.stateBySession.get(String(sessionKey))
      if (known === state || (state === 'stopped' && known === undefined)) continue
      if (state === 'stopped') this.stateBySession.delete(String(sessionKey))
      else this.stateBySession.set(String(sessionKey), state)
      changed = true
    }
    if (changed) this.requestPlaybackChange()
  }

  private requestPlaybackChange() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.deps.onPlaybackChange()
    }, DEBOUNCE_MS)
  }
}

export function createCoalescedRunner(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null
  let requestedAgain = false
  return () => {
    if (running) {
      requestedAgain = true
      return running
    }
    running = (async () => {
      try {
        do {
          requestedAgain = false
          await task()
        } while (requestedAgain)
      } finally {
        running = null
      }
    })()
    return running
  }
}

export interface NowPlayingItem {
  titleId: number
  type: MediaType
  name: string
  season?: number
  number?: number
}

interface ResolvedItem { titleId: number, type: MediaType, name: string, season: number | null, number: number | null }

export interface RegistryDeps {
  loadConnection(userId: number): Promise<PlexConnectionRow | null>
  connect(url: string, token: string): ListenerSocket
  pullHistory(connection: PlexConnectionRow, server: PlexServer): Promise<unknown>
  flagTokenInvalid(connectionId: number): Promise<void>
  sessions(connection: PlexConnectionRow): Promise<PlexSession[]>
  resolveItems(userId: number, connectionId: number, ratingKeys: string[]): Promise<Map<string, ResolvedItem>>
}

const drizzleResolveItems: RegistryDeps['resolveItems'] = async (userId, connectionId, ratingKeys) => {
  if (!ratingKeys.length) return new Map()
  const rows = await withQuerySpan('select-plex-now-playing-items', () => db
    .select({
      ratingKey: plexItems.ratingKey, titleId: titles.id, kind: titles.kind, isAnime: titles.isAnime, typeOverride: userTitles.typeOverride,
      name: titles.name, season: plexItems.season, number: plexItems.number
    })
    .from(plexItems)
    .innerJoin(titles, eq(titles.id, plexItems.titleId))
    .leftJoin(userTitles, and(eq(userTitles.titleId, plexItems.titleId), eq(userTitles.userId, userId)))
    .where(and(eq(plexItems.connectionId, connectionId), inArray(plexItems.ratingKey, ratingKeys))))
  return new Map(rows.map(({ ratingKey, kind, isAnime, typeOverride, ...item }) => [
    ratingKey,
    { ...item, type: kind === 'movie' ? 'movie' : typeOverride ?? (isAnime ? 'anime' : 'tv') }
  ]))
}

const defaultDeps: RegistryDeps = {
  loadConnection: loadPlexConnection,
  connect: connectPlexWebSocket,
  pullHistory,
  flagTokenInvalid: drizzlePlexOutboundStore.flagTokenInvalid,
  sessions: connection => plexServerFor(connection).sessions(),
  resolveItems: drizzleResolveItems
}

export function createListenerRegistry(overrides: Partial<RegistryDeps> = {}) {
  const deps: RegistryDeps = { ...defaultDeps, ...overrides }
  const active = new Map<number, { listener: PlexListener, safetyNet: ReturnType<typeof setInterval> }>()

  const generations = new Map<number, number>()
  const runners = new Map<number, () => Promise<void>>()

  const pullOnce = async (userId: number) => {
    const connection = await deps.loadConnection(userId)
    if (!connection || connection.tokenInvalid) return
    try {
      await deps.pullHistory(connection, plexServerFor(connection))
    } catch (error) {
      if (error instanceof PlexError && error.kind === 'unauthorized') {
        await deps.flagTokenInvalid(connection.id)
        logger.warn({ userId, error: error.message }, 'plex pull stopped: token rejected')
        return
      }
      if (error instanceof PlexError && error.kind === 'unreachable') {
        logger.warn({ userId, error: error.message }, 'plex pull skipped: server unreachable')
        return
      }
      logger.error({ userId, err: error }, 'plex pull failed')
    }
  }

  const runnerFor = (userId: number) => {
    let runner = runners.get(userId)
    if (!runner) {
      runner = createCoalescedRunner(() => pullOnce(userId).catch((error) => {
        logger.error({ userId, err: error }, 'plex pull failed')
      }))
      runners.set(userId, runner)
    }
    return runner
  }

  const stopFor = (userId: number) => {
    generations.set(userId, (generations.get(userId) ?? 0) + 1)
    const entry = active.get(userId)
    if (!entry) return
    entry.listener.stop()
    clearInterval(entry.safetyNet)
    active.delete(userId)
  }

  return {
    async startFor(userId: number) {
      stopFor(userId)
      const generation = generations.get(userId)
      if (plexSyncMode() === 'off') return
      const connection = await deps.loadConnection(userId)
      if (!connection || generations.get(userId) !== generation) return
      const pull = runnerFor(userId)
      const listener = new PlexListener(connection, { connect: deps.connect, onPlaybackChange: () => void pull(), now: Date.now })
      const safetyNet = setInterval(() => void pull(), SAFETY_NET_INTERVAL_MS)
      active.set(userId, { listener, safetyNet })
      listener.start()
    },

    stopFor,

    stopAll() {
      for (const userId of [...generations.keys()]) stopFor(userId)
    },

    statusFor(userId: number): ListenerStatus | null {
      return active.get(userId)?.listener.status() ?? null
    },

    async nowPlaying(userId: number): Promise<NowPlayingItem[]> {
      if (plexSyncMode() === 'off') return []
      try {
        const connection = await deps.loadConnection(userId)
        if (!connection) return []
        const sessions = (await deps.sessions(connection))
          .filter(session => session.userId === connection.ownerAccountId || session.userTitle === connection.plexUsername)
        const items = await deps.resolveItems(userId, connection.id, [...new Set(sessions.map(session => session.ratingKey))])
        return sessions.flatMap((session) => {
          const item = items.get(session.ratingKey)
          if (!item) return []
          return [{
            titleId: item.titleId,
            type: item.type,
            name: item.name,
            ...(item.season !== null && { season: item.season }),
            ...(item.number !== null && { number: item.number })
          }]
        })
      } catch (error) {
        logger.warn({ userId, error: error instanceof Error ? error.message : 'unknown' }, 'plex now playing unavailable')
        return []
      }
    }
  }
}

export const listenerRegistry = createListenerRegistry()
