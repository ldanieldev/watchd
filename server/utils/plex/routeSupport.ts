import type { H3Event } from 'h3'
import { PlexError } from './client'
import type { PlexServer } from './client'
import { plexClientIdentifier, plexSyncMode } from './config'
import { loadPlexConnection } from './connection'
import type { PlexConnectionRow } from './connection'
import type { PlexSection } from './types'
import { inngest } from '../inngest/client'
import { logger } from '../logger'

const VIDEO_SECTION_TYPES = ['movie', 'show']
const UNLINKED_AGENT = 'com.plexapp.agents.none'
const SIGN_IN_TTL_SECONDS = 30 * 60

export interface PlexSignInState {
  pinId: number
  code: string
}

export function assertPlexSyncEnabled() {
  if (plexSyncMode() === 'off') throw createError({ statusCode: 503, statusMessage: 'Plex sync is turned off on this server' })
}

export function assertPlexSignInAvailable() {
  assertPlexSyncEnabled()
  if (!plexClientIdentifier()) throw createError({ statusCode: 503, statusMessage: 'Plex sign-in is not configured on this server (missing client identifier)' })
}

export function plexUnreachableError(error: unknown) {
  logger.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'plex request from a route failed')
  return createError({ statusCode: 502, statusMessage: 'Plex could not be reached' })
}

export function plexServerUnreachableError() {
  return createError({ statusCode: 502, statusMessage: `Couldn't reach the Plex server from watchd — try the Server URL field` })
}

export async function rethrowAsRouteError<Result>(task: () => Promise<Result>): Promise<Result> {
  try {
    return await task()
  } catch (error) {
    if (error instanceof PlexError) throw plexUnreachableError(error)
    throw error
  }
}

export async function readPlexSignIn(event: H3Event): Promise<PlexSignInState | undefined> {
  const session = await getUserSession(event)
  return (session.secure as { plex?: PlexSignInState } | undefined)?.plex
}

// setUserSession deep-merges and so cannot drop a stale pin; replacing the whole session can.
export async function writePlexSignIn(event: H3Event, plex: PlexSignInState | null) {
  const { id: _sessionId, secure, ...rest } = await getUserSession(event)
  const { plex: _previous, ...otherSecure } = (secure ?? {}) as Record<string, unknown>
  await replaceUserSession(event, { ...rest, secure: plex ? { ...otherSecure, plex } : otherSecure })
}

export async function requirePlexConnection(userId: number): Promise<PlexConnectionRow> {
  const connection = await loadPlexConnection(userId)
  if (!connection) throw createError({ statusCode: 404, statusMessage: 'Plex is not connected' })
  return connection
}

export async function queuePlexEvent(name: string, data: object, what: string) {
  try {
    await inngest.send({ name, data })
  } catch (error) {
    logger.warn({ event: name, error: error instanceof Error ? error.message : 'unknown' }, 'plex event could not be queued')
    throw createError({ statusCode: 503, statusMessage: `Couldn't queue ${what}, try again in a moment` })
  }
}

export const videoSections = (sections: PlexSection[]) => sections.filter(section => VIDEO_SECTION_TYPES.includes(section.type))

export const defaultSectionIds = (sections: PlexSection[]) =>
  videoSections(sections).filter(section => section.agent !== UNLINKED_AGENT).map(section => String(section.id))

export const sectionsOf = (server: PlexServer) => rethrowAsRouteError(() => server.sections())

const signInTokenKey = (userId: number, pinId: number) => `plex-sign-in:${userId}:${pinId}`

interface StoredAccountToken { accountToken: string, expiresAt: number }

// The cache mount's TTL is honoured by Redis only; expiresAt covers the in-memory fallback.
export async function storeSignInAccountToken(userId: number, pinId: number, accountToken: string) {
  const value: StoredAccountToken = { accountToken, expiresAt: Date.now() + SIGN_IN_TTL_SECONDS * 1000 }
  await useStorage('cache').setItem(signInTokenKey(userId, pinId), value, { ttl: SIGN_IN_TTL_SECONDS })
}

export async function readSignInAccountToken(userId: number, pinId: number): Promise<string | null> {
  const stored = await useStorage('cache').getItem<StoredAccountToken>(signInTokenKey(userId, pinId))
  return stored && stored.expiresAt > Date.now() ? stored.accountToken : null
}

export async function deleteSignInAccountToken(userId: number, pinId: number) {
  await useStorage('cache').removeItem(signInTokenKey(userId, pinId))
}
