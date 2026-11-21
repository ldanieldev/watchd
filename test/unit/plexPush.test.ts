import { NonRetriableError } from 'inngest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'
import type { PlexOutboundStore, PlexPushOp } from '~~/server/utils/plex/outbound'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send: vi.fn() } }))

let syncMode = 'on'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier: 'test-client-id' } }))

const { runPlexPush, abandonPlexPush } = await import('~~/server/utils/plex/outbound')
const { PlexServer, PlexError } = await import('~~/server/utils/plex/client')

const CONNECTION_ID = 3
const TOKEN = 'fake-plex-token'

const markEpisode: PlexPushOp = { op: 'mark', titleId: 5, season: 2, number: 7 }
const markMovie: PlexPushOp = { op: 'mark', titleId: 9, season: null, number: null }

function memoryStore(ratingKeysByTitle: Record<number, string>) {
  const pending = new Set<string>()
  const expected = new Map<string, number>()
  const store: PlexOutboundStore = {
    async ratingKeysFor(_connectionId, ops) {
      return ops.map(op => op.op !== 'delete-history' && ratingKeysByTitle[op.titleId] ? [ratingKeysByTitle[op.titleId]!] : [])
    },
    async setPending(_connectionId, ratingKeys, isPending) {
      for (const ratingKey of ratingKeys) {
        if (isPending) pending.add(ratingKey)
        else pending.delete(ratingKey)
      }
    },
    async clearExpectedViewCounts(_connectionId, ratingKeys) {
      for (const ratingKey of ratingKeys) expected.delete(ratingKey)
    },
    async flagTokenInvalid() {},
    async setExpectedViewCount(_connectionId, ratingKey, viewCount) {
      expected.set(ratingKey, viewCount)
    }
  }
  return { store, pending, expected }
}

describe('runPlexPush', () => {
  let state: FakePlexState
  let fake: FakePlex
  let server: InstanceType<typeof PlexServer>

  beforeEach(async () => {
    syncMode = 'on'
    vi.clearAllMocks()
    state = createFakePlexState({
      items: [
        { sectionId: 2, ratingKey: '900', type: 'episode', title: 'Ep', guids: [], viewCount: 0 },
        { sectionId: 1, ratingKey: '800', type: 'movie', title: 'Film', guids: [], viewCount: 1 }
      ],
      history: [{ historyId: 501, ratingKey: '900', viewedAt: 1, accountId: 1, sectionId: 2 }]
    })
    fake = await startFakePlex(state)
    server = new PlexServer({ url: fake.url, token: TOKEN })
  })

  afterEach(() => fake?.stop())

  it('scrobbles a marked episode, records the expected view count first and clears the pending flag', async () => {
    const { store, pending, expected } = memoryStore({ 5: '900' })
    await store.setPending(CONNECTION_ID, ['900'], true)

    await runPlexPush({ server, store, connectionId: CONNECTION_ID, ops: [markEpisode] })

    expect(state.items[0]!.viewCount).toBe(1)
    expect(expected.get('900')).toBe(1)
    expect(pending.size).toBe(0)
  })

  it('unscrobbles with an expected view count of 0', async () => {
    const { store, expected } = memoryStore({ 9: '800' })

    await runPlexPush({ server, store, connectionId: CONNECTION_ID, ops: [{ op: 'unmark', titleId: 9, season: null, number: null }] })

    expect(expected.get('800')).toBe(0)
    expect(state.items[1]!.viewCount).toBeUndefined()
  })

  it('deletes a history entry without touching view counts', async () => {
    const { store, expected } = memoryStore({})

    await runPlexPush({ server, store, connectionId: CONNECTION_ID, ops: [{ op: 'delete-history', historyId: 501 }] })

    expect(state.history).toEqual([])
    expect(expected.size).toBe(0)
    expect(fake.calls.some(call => call.path.includes('scrobble'))).toBe(false)
  })

  it('sends nothing for a title with no Plex mapping', async () => {
    const { store, pending } = memoryStore({})

    await runPlexPush({ server, store, connectionId: CONNECTION_ID, ops: [markMovie] })

    expect(fake.calls).toEqual([])
    expect(pending.size).toBe(0)
  })

  it('makes no Plex call in read-only mode, leaves the expected count alone and clears pending', async () => {
    syncMode = 'read-only'
    const { store, pending, expected } = memoryStore({ 5: '900' })
    await store.setPending(CONNECTION_ID, ['900'], true)

    await runPlexPush({ server, store, connectionId: CONNECTION_ID, ops: [markEpisode, { op: 'delete-history', historyId: 501 }] })

    expect(fake.calls.filter(call => call.path.includes('scrobble') || call.path.includes('history/'))).toEqual([])
    expect(expected.size).toBe(0)
    expect(pending.size).toBe(0)
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ action: 'scrobble', ratingKey: '900' }), 'plex write skipped (read-only)')
  })

  it('throws when Plex is unreachable and keeps the pending flag for the retry', async () => {
    const { store, pending } = memoryStore({ 5: '900' })
    await store.setPending(CONNECTION_ID, ['900'], true)
    await fake.stop()

    await expect(runPlexPush({ server, store, connectionId: CONNECTION_ID, ops: [markEpisode] })).rejects.toBeInstanceOf(PlexError)

    expect(pending.has('900')).toBe(true)
  })
})

describe('runPlexPush on a rejected token', () => {
  it('flags the connection token as invalid and stops retrying', async () => {
    syncMode = 'on'
    const fake = await startFakePlex(createFakePlexState({ items: [{ sectionId: 2, ratingKey: '900', type: 'episode', title: 'Ep', guids: [] }] }))
    const flagTokenInvalid = vi.fn()
    const { store } = memoryStore({ 5: '900' })

    try {
      await expect(runPlexPush({ server: new PlexServer({ url: fake.url, token: 'wrong' }), store: { ...store, flagTokenInvalid }, connectionId: CONNECTION_ID, ops: [markEpisode] }))
        .rejects.toBeInstanceOf(NonRetriableError)
    } finally {
      await fake.stop()
    }
    expect(flagTokenInvalid).toHaveBeenCalledWith(CONNECTION_ID)
  })
})

describe('abandonPlexPush', () => {
  it('clears the pending flag and stale expected count of every mapped key and logs the failure without a token', async () => {
    const { store, pending, expected } = memoryStore({ 5: '900', 9: '800' })
    await store.setPending(CONNECTION_ID, ['900', '800'], true)
    await store.setExpectedViewCount(CONNECTION_ID, '900', 0)

    await abandonPlexPush({ store, connectionId: CONNECTION_ID, userId: 7, ops: [markEpisode, markMovie], error: new PlexError('unreachable', 'GET /:/scrobble could not connect') })

    expect(pending.size).toBe(0)
    expect(expected.size).toBe(0)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(log.error.mock.calls)).toContain('could not connect')
  })
})
