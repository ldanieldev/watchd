import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { createFakePlexState, startFakePlex } from '../fixtures/plex/fakePlex'
import type { FakePlex, FakePlexState } from '../fixtures/plex/fakePlex'
import { createServerHandlerHarness, event } from './serverHandlerHarness'
import type { ItemMapStore, PlexItemMapping } from '~~/server/utils/plex/itemMap'
import type { InboundStore, UnresolvedHistoryEntry } from '~~/server/utils/plex/inbound'
import type { PlexScanItemState, PlexScanStore } from '~~/server/utils/plex/scan'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
const send = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logger', () => ({ logger: log }))
vi.mock('~~/server/utils/inngest/client', () => ({ inngest: { send } }))
let syncMode = 'on'
vi.stubGlobal('useRuntimeConfig', () => ({ plex: { syncMode, clientIdentifier: 'test-client-id' } }))

const harness = createServerHandlerHarness()

const { runPlexScan } = await import('~~/server/utils/plex/scan')
const { PlexServer, PlexError } = await import('~~/server/utils/plex/client')
type Handler = (e: unknown) => Promise<unknown>
const listUnmarked = (await import('~~/server/api/plex/unmarked/index.get')).default as Handler
const restoreUnmarked = (await import('~~/server/api/plex/unmarked/[id]/restore.post')).default as Handler

const TOKEN = 'scan-token'
const OWNER = 1
const USER_ID = 42
const MOVIE_TITLE_ID = 100
const SHOW_TITLE_ID = 7

interface MemoryPlay { titleId: number, season: number | null, number: number | null, watchedAt: Date, plexHistoryId: number | null, source: string, deletedAt: Date | null, plexServerMachineId?: string | null }
interface MemoryUnmarked { ratingKey: string, titleId: number, season: number | null, number: number | null, unmarkedAt: Date }

const keyOf = (play: { titleId: number, season: number | null, number: number | null }) => `${play.titleId}:${play.season}:${play.number}`

function memoryWorld(initialItems: PlexScanItemState[], initialPlays: MemoryPlay[] = []) {
  const items = new Map(initialItems.map(item => [item.ratingKey, { ...item }]))
  const plays = initialPlays.map(play => ({ ...play }))
  const unmarked = new Map<string, MemoryUnmarked>()
  const unresolved = new Map<number, UnresolvedHistoryEntry>()
  const finished: Date[] = []
  const flagTokenInvalid = vi.fn(async () => {})
  const hooks: { afterListing?: () => void } = {}

  const itemMapStore: ItemMapStore = {
    async ensureTitles() {
      hooks.afterListing?.()
      return { titleIdsByKey: new Map([['movie-111', MOVIE_TITLE_ID], ['tv-222', SHOW_TITLE_ID]]), createdCount: 0 }
    },
    async episodesOfTitles() {
      return new Map([[SHOW_TITLE_ID, [{ season: 1, number: 1, tmdbEpisodeId: null }]]])
    },
    async existingItems() {
      return [...items.values()]
    },
    async upsertItems(_connectionId, mappings: PlexItemMapping[]) {
      for (const mapping of mappings) {
        const existing = items.get(mapping.ratingKey)
        items.set(mapping.ratingKey, existing
          ? { ...existing, ...mapping, viewCount: existing.viewCount, lastViewedAt: existing.lastViewedAt }
          : { ...mapping, expectedViewCount: null, outboundPending: false })
      }
    },
    async deleteItems(_connectionId, ratingKeys) {
      for (const ratingKey of ratingKeys) items.delete(ratingKey)
    }
  }

  const inboundStore: InboundStore = {
    async mappedItems(_connectionId, ratingKeys) {
      return new Map(ratingKeys.flatMap(ratingKey => items.has(ratingKey) ? [[ratingKey, items.get(ratingKey)!]] : []))
    },
    async unresolvedEntries() {
      return [...unresolved.values()]
    },
    async storedHistoryIds(_userId, _serverMachineId, historyIds) {
      return new Set(plays.flatMap(play => play.plexHistoryId !== null && historyIds.includes(play.plexHistoryId) ? [play.plexHistoryId] : []))
    },
    async existingPlays(_userId, titleIds) {
      return plays.filter(play => titleIds.includes(play.titleId))
    },
    async insertPlays(_userId, _serverMachineId, rows) {
      plays.push(...rows.map(row => ({ ...row, source: 'plex', deletedAt: null })))
      return rows.map(row => row.plexHistoryId)
    },
    async saveUnresolved(_connectionId, entries) {
      for (const entry of entries) unresolved.set(entry.historyId, entry)
    },
    async removeUnresolved(_connectionId, historyIds) {
      for (const historyId of historyIds) unresolved.delete(historyId)
    },
    async saveProgress() {}
  }

  const scanStore: PlexScanStore = {
    async itemStates() {
      return [...items.values()].map(item => ({ ...item }))
    },
    async softDeletedKeys(_userId, keys) {
      const wanted = new Set(keys.map(keyOf))
      return new Set(plays.filter(play => play.deletedAt && wanted.has(keyOf(play))).map(keyOf))
    },
    async softDeletePlays(_userId, _connectionId, item, at) {
      const live = plays.filter(play => !play.deletedAt && keyOf(play) === keyOf(item))
      for (const play of live) play.deletedAt = at
      if (live.length) unmarked.set(item.ratingKey, { ...item, unmarkedAt: at })
      return live.length
    },
    async restorePlays(_userId, _connectionId, item) {
      const deleted = plays.filter(play => play.deletedAt && keyOf(play) === keyOf(item))
      for (const play of deleted) play.deletedAt = null
      unmarked.delete(item.ratingKey)
      return deleted.length
    },
    async keysWithPlexPlaysSince(_userId, serverMachineId, keys, since) {
      const wanted = new Set(keys.map(keyOf))
      return new Set(plays.filter(play => !play.deletedAt && play.source === 'plex' && play.plexServerMachineId === serverMachineId && play.watchedAt > since && wanted.has(keyOf(play))).map(keyOf))
    },
    existingPlays: inboundStore.existingPlays,
    async insertMarkedPlays(_userId, rows) {
      plays.push(...rows.map(row => ({ ...row, plexHistoryId: null, source: 'plex', deletedAt: null })))
      return rows.length
    },
    async saveWatchedStates(_connectionId, states) {
      for (const state of states) Object.assign(items.get(state.ratingKey)!, state)
    },
    async clearExpectedViewCounts(_connectionId, expectations) {
      for (const { ratingKey, expectedViewCount } of expectations) {
        const item = items.get(ratingKey)
        if (item && item.expectedViewCount === expectedViewCount) item.expectedViewCount = null
      }
    },
    async finishScan(_connectionId, scannedAt) {
      finished.push(scannedAt)
    },
    flagTokenInvalid
  }

  return { items, plays, unmarked, finished, flagTokenInvalid, hooks, stores: { itemMapStore, inboundStore, scanStore } }
}

const movieRow = (overrides: Partial<PlexScanItemState> = {}): PlexScanItemState => ({
  ratingKey: '10', kind: 'movie', sectionId: '1', parentRatingKey: null, titleId: MOVIE_TITLE_ID, season: null, number: null, unmatchedReason: null,
  viewCount: 1, lastViewedAt: 1_700_000_000, expectedViewCount: null, outboundPending: false, ...overrides
})
const moviePlay = (overrides: Partial<MemoryPlay> = {}): MemoryPlay => ({
  titleId: MOVIE_TITLE_ID, season: null, number: null, watchedAt: new Date(1_700_000_000_000), plexHistoryId: null, source: 'floppy', deletedAt: null, ...overrides
})

describe('runPlexScan', () => {
  let state: FakePlexState
  let fake: FakePlex
  let server: InstanceType<typeof PlexServer>
  const connection = { id: 3, userId: USER_ID, ownerAccountId: OWNER, serverMachineId: 'server-a', sectionIds: ['1', '2'], historyCursor: null, lastPlayAt: null, lastScanAt: null as Date | null }

  const plexMovie = (viewCount: number, lastViewedAt?: number) => ({ sectionId: 1, ratingKey: '10', type: 'movie' as const, title: 'Synthetic Film', guids: ['tmdb://111'], viewCount, lastViewedAt })

  beforeEach(async () => {
    syncMode = 'on'
    vi.clearAllMocks()
    state = createFakePlexState({ token: TOKEN })
    fake = await startFakePlex(state)
    server = new PlexServer({ url: fake.url, token: TOKEN })
  })

  afterEach(async () => {
    await fake.stop()
  })

  it('soft-deletes on a Plex unmark and restores on the re-mark without a new play or any Plex write (misclick round trip)', async () => {
    const world = memoryWorld([movieRow()], [moviePlay()])
    state.items = [plexMovie(0)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays[0]!.deletedAt).toBeInstanceOf(Date)
    expect(world.unmarked.get('10')).toMatchObject({ titleId: MOVIE_TITLE_ID, season: null, number: null })
    expect(world.items.get('10')!.viewCount).toBe(0)

    state.items = [plexMovie(1, 1_800_000_000)]
    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays).toEqual([moviePlay()])
    expect(world.unmarked.size).toBe(0)
    expect(world.items.get('10')).toMatchObject({ viewCount: 1, lastViewedAt: 1_800_000_000 })
    expect(fake.calls.filter(call => call.path.includes('scrobble') || call.method === 'DELETE')).toEqual([])
  })

  it('keeps the plays when one of two Plex copies of the same movie is unmarked while the other stays watched', async () => {
    const world = memoryWorld([movieRow(), movieRow({ ratingKey: '15' })], [moviePlay()])
    state.items = [plexMovie(0), { ...plexMovie(1), ratingKey: '15', title: 'Synthetic Film (4K)' }]

    const summary = await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays[0]!.deletedAt).toBeNull()
    expect(world.unmarked.size).toBe(0)
    expect(summary).toMatchObject({ softDeletedPlays: 0 })
    expect(world.items.get('10')!.viewCount).toBe(0)
  })

  it('soft-deletes once every Plex copy of the movie is unmarked', async () => {
    const world = memoryWorld([movieRow(), movieRow({ ratingKey: '15' })], [moviePlay()])
    state.items = [plexMovie(0), { ...plexMovie(0), ratingKey: '15', title: 'Synthetic Film (4K)' }]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays[0]!.deletedAt).toBeInstanceOf(Date)
  })

  it('keeps the soft-deleted play when the listener imported a new Plex play of the item since the last scan', async () => {
    const lastScanAt = new Date('2026-11-21T19:50:00Z')
    const listenerPlayAt = new Date('2026-11-21T19:56:41Z')
    const softDeletedPlay = moviePlay({ deletedAt: new Date('2026-11-21T19:45:00Z') })
    const listenerPlay = moviePlay({ watchedAt: listenerPlayAt, plexHistoryId: 77, source: 'plex', plexServerMachineId: 'server-a' })
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null })], [softDeletedPlay, listenerPlay])
    world.unmarked.set('10', { ratingKey: '10', titleId: MOVIE_TITLE_ID, season: null, number: null, unmarkedAt: softDeletedPlay.deletedAt! })
    state.items = [plexMovie(1, listenerPlayAt.getTime() / 1000)]
    state.history = [{ historyId: 77, ratingKey: '10', viewedAt: listenerPlayAt.getTime() / 1000, accountId: OWNER, sectionId: 1 }]

    await runPlexScan({ connection: { ...connection, historyCursor: listenerPlayAt.getTime() / 1000, lastScanAt }, server, ...world.stores })

    expect(world.plays).toEqual([softDeletedPlay, listenerPlay])
    expect(world.unmarked.has('10')).toBe(true)
    expect(world.items.get('10')!.viewCount).toBe(1)
  })

  it('keeps the soft-deleted play when the listener play was watched just before the last scan but committed after its lookup', async () => {
    const lastScanAt = new Date('2026-11-21T19:50:00Z')
    const listenerPlayAt = new Date('2026-11-21T19:48:00Z')
    const softDeletedPlay = moviePlay({ deletedAt: new Date('2026-11-21T19:45:00Z') })
    const listenerPlay = moviePlay({ watchedAt: listenerPlayAt, plexHistoryId: 78, source: 'plex', plexServerMachineId: 'server-a' })
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null })], [softDeletedPlay, listenerPlay])
    state.items = [plexMovie(1, listenerPlayAt.getTime() / 1000)]
    state.history = [{ historyId: 78, ratingKey: '10', viewedAt: listenerPlayAt.getTime() / 1000, accountId: OWNER, sectionId: 1 }]

    await runPlexScan({ connection: { ...connection, historyCursor: listenerPlayAt.getTime() / 1000, lastScanAt }, server, ...world.stores })

    expect(world.plays).toEqual([softDeletedPlay, listenerPlay])
  })

  it('still restores on a re-mark when the item\'s only Plex play predates the last scan', async () => {
    const lastScanAt = new Date('2026-11-21T19:50:00Z')
    const softDeletedPlay = moviePlay({ watchedAt: new Date('2026-11-20T10:00:00Z'), source: 'plex', plexHistoryId: 70, plexServerMachineId: 'server-a', deletedAt: new Date('2026-11-21T19:45:00Z') })
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null })], [softDeletedPlay])
    state.items = [plexMovie(1, 1_800_000_000)]

    await runPlexScan({ connection: { ...connection, lastScanAt }, server, ...world.stores })

    expect(world.plays).toEqual([{ ...softDeletedPlay, deletedAt: null }])
  })

  it('creates a Plex play at lastViewedAt for a Plex "Mark as Played" with no history entry', async () => {
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null })])
    state.items = [plexMovie(1, 1_800_000_123)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays).toEqual([{ titleId: MOVIE_TITLE_ID, season: null, number: null, watchedAt: new Date(1_800_000_123_000), plexHistoryId: null, source: 'plex', deletedAt: null }])
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, titleId: MOVIE_TITLE_ID }), 'plex play imported')
  })

  it('leaves a play with a new history entry to the history pull instead of creating a second one', async () => {
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null })])
    state.items = [plexMovie(1, 1_800_000_000)]
    state.history = [{ historyId: 9, ratingKey: '10', viewedAt: 1_799_000_000, accountId: OWNER, sectionId: 1 }]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays).toEqual([expect.objectContaining({ plexHistoryId: 9, watchedAt: new Date(1_799_000_000_000) })])
  })

  it('skips an item with an outbound call pending: no action, expectation kept, stored view count not advanced', async () => {
    const world = memoryWorld([movieRow({ outboundPending: true, expectedViewCount: 1 })], [moviePlay()])
    state.items = [plexMovie(0)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays[0]!.deletedAt).toBeNull()
    expect(world.items.get('10')).toMatchObject({ viewCount: 1, expectedViewCount: 1 })
  })

  it('treats watchd\'s own unscrobble as no change and clears the expectation', async () => {
    const world = memoryWorld([movieRow({ expectedViewCount: 0 })])
    state.items = [plexMovie(0)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.unmarked.size).toBe(0)
    expect(world.items.get('10')).toMatchObject({ viewCount: 0, expectedViewCount: null })
  })

  it('clears a stale expectation from a call that never landed without acting', async () => {
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null, expectedViewCount: 1 })])
    state.items = [plexMovie(0)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays).toEqual([])
    expect(world.items.get('10')!.expectedViewCount).toBeNull()
  })

  it('skips an item whose push landed while Plex was being read, so its change is judged on the next poll', async () => {
    const world = memoryWorld([movieRow({ viewCount: 0, lastViewedAt: null })])
    state.items = [plexMovie(0)]
    world.hooks.afterListing = () => {
      world.items.get('10')!.expectedViewCount = 1
    }

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.items.get('10')).toMatchObject({ viewCount: 0, expectedViewCount: 1 })
  })

  it('acts on episodes by their TMDB season and number', async () => {
    const episodeRow: PlexScanItemState = { ...movieRow(), ratingKey: '21', kind: 'episode', sectionId: '2', parentRatingKey: '20', titleId: SHOW_TITLE_ID, season: 1, number: 1 }
    const world = memoryWorld([episodeRow], [moviePlay({ titleId: SHOW_TITLE_ID, season: 1, number: 1 }), moviePlay({ titleId: SHOW_TITLE_ID, season: 1, number: 2 })])
    state.items = [
      { sectionId: 2, ratingKey: '20', type: 'show', title: 'Synthetic Show', guids: ['tmdb://222'] },
      { sectionId: 2, ratingKey: '21', type: 'episode', title: 'Pilot', guids: [], grandparentRatingKey: '20', parentIndex: 1, index: 1, viewCount: 0 }
    ]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays.map(play => play.deletedAt === null)).toEqual([false, true])
  })

  it('records the scan time, clears tokenInvalid and logs one info summary with counts', async () => {
    const world = memoryWorld([movieRow()], [moviePlay()])
    state.items = [plexMovie(0)]

    const summary = await runPlexScan({ connection, server, ...world.stores })

    expect(world.finished).toHaveLength(1)
    expect(summary).toMatchObject({ softDeletedPlays: 1, restoredPlays: 0, createdPlays: 0, skippedPending: 0, errors: 0 })
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, outcome: 'ok', softDeletedPlays: 1, pulled: { added: 0, duplicates: 0, unresolved: 0 } }), 'plex scan finished')
  })

  it('also applies transitions in read-only mode', async () => {
    syncMode = 'read-only'
    const world = memoryWorld([movieRow()], [moviePlay()])
    state.items = [plexMovie(0)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays[0]!.deletedAt).toBeInstanceOf(Date)
  })

  it('flags the token invalid and ends the run without throwing when Plex rejects the token', async () => {
    const world = memoryWorld([movieRow()], [moviePlay()])

    await expect(runPlexScan({ connection, server: new PlexServer({ url: fake.url, token: 'rejected-token' }), ...world.stores })).resolves.toEqual({ tokenInvalid: true })

    expect(world.flagTokenInvalid).toHaveBeenCalledWith(connection.id)
    expect(world.finished).toEqual([])
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('rejected-token')
    expect(log.info).toHaveBeenCalledWith({ userId: USER_ID, connectionId: connection.id, outcome: 'token-rejected' }, 'plex scan finished')
  })

  it('throws when Plex is unreachable so the run is retried', async () => {
    const world = memoryWorld([movieRow()])
    await fake.stop()

    await expect(runPlexScan({ connection, server, ...world.stores })).rejects.toBeInstanceOf(PlexError)
    expect(world.flagTokenInvalid).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith({ userId: USER_ID, connectionId: connection.id, outcome: 'unreachable' }, 'plex scan finished')
  })

  it('does not soft-delete when a history delete drops Plex to 0 while its follow-up mark is pending', async () => {
    const world = memoryWorld([movieRow({ outboundPending: true, expectedViewCount: 1 })], [moviePlay()])
    state.items = [plexMovie(0)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays[0]!.deletedAt).toBeNull()
    expect(world.unmarked.size).toBe(0)
    expect(world.items.get('10')).toMatchObject({ viewCount: 1, expectedViewCount: 1 })
  })

  it('treats the settled delete-then-mark push as watchd\'s own and clears its expectation', async () => {
    const world = memoryWorld([movieRow({ expectedViewCount: 1 })], [moviePlay()])
    state.items = [plexMovie(1, 1_800_000_000)]

    await runPlexScan({ connection, server, ...world.stores })

    expect(world.plays).toEqual([moviePlay()])
    expect(world.items.get('10')).toMatchObject({ viewCount: 1, expectedViewCount: null })
  })
})

describe('Plex unmarked routes', () => {
  const plexConnection = { id: 3, userId: USER_ID, serverMachineId: 'server-a', serverUrl: 'http://plex.invalid:32400', serverUrlOverride: null, serverToken: 'secret-token' }
  const unmarkedRow = { id: 11, connectionId: 3, ratingKey: '21', titleId: SHOW_TITLE_ID, season: 2, number: 7, unmarkedAt: new Date() }

  beforeEach(() => {
    syncMode = 'on'
    send.mockReset().mockResolvedValue(undefined)
    harness.reset()
    harness.setSession({ user: { id: USER_ID } })
  })

  it('restores the plays, sends one plex/push mark and deletes the row', async () => {
    harness.givenDb({
      select: [[plexConnection], [unmarkedRow], [plexConnection], [{ ratingKey: '21', kind: 'episode', titleId: SHOW_TITLE_ID, season: 2, number: 7 }]],
      update: [{ id: 1 }, { id: 2 }],
      delete: [{ id: 11 }]
    })

    await expect(restoreUnmarked(event({ params: { id: '11' } }))).resolves.toEqual({ restored: 2 })

    expect(harness.mocks.updateSet).toHaveBeenCalledWith({ deletedAt: null })
    expect(harness.mocks.deleteWhere).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ name: 'plex/push', data: { userId: USER_ID, ops: [{ op: 'mark', titleId: SHOW_TITLE_ID, season: 2, number: 7 }] } })
  })

  it('returns 404 for a row of another user\'s connection and changes nothing', async () => {
    harness.givenDb({ select: [[plexConnection], []] })

    await expect(restoreUnmarked(event({ params: { id: '99' } }))).rejects.toMatchObject({ statusCode: 404 })

    const unmarkedWhere = new PgDialect().sqlToQuery(harness.mocks.selectWhere.mock.calls[1]![0] as SQL)
    expect(unmarkedWhere.sql).toContain('"plex_unmarked"."id" = $1')
    expect(unmarkedWhere.sql).toContain('"plex_unmarked"."connection_id" = $2')
    expect(unmarkedWhere.params).toEqual([99, plexConnection.id])

    expect(harness.mocks.updateSet).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('returns 404 when the user has no Plex connection', async () => {
    harness.givenDb({ select: [[]] })

    await expect(restoreUnmarked(event({ params: { id: '11' } }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a non-numeric id with 400', async () => {
    await expect(restoreUnmarked(event({ params: { id: 'abc' } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('lists unmarked items with title, episode code, play count and days left', async () => {
    const day = 24 * 60 * 60 * 1000
    harness.givenDb({
      select: [[plexConnection], [
        { id: 11, titleName: 'Synthetic Show', isAnime: false, typeOverride: null, season: 2, number: 7, plays: 3, unmarkedAt: new Date(Date.now() - 4.5 * day) },
        { id: 12, titleName: 'Synthetic Anime', isAnime: true, typeOverride: null, season: 1, number: 12, plays: 1, unmarkedAt: new Date(Date.now() - 40 * day) },
        { id: 13, titleName: 'Synthetic Film', isAnime: false, typeOverride: null, season: null, number: null, plays: 1, unmarkedAt: new Date(Date.now() - day / 2) }
      ]]
    })

    const { items } = await listUnmarked(event()) as { items: Record<string, unknown>[] }

    expect(items).toEqual([
      { id: 11, titleName: 'Synthetic Show', episodeCode: 'S2E7', plays: 3, unmarkedAt: expect.any(String), daysLeft: 26 },
      { id: 12, titleName: 'Synthetic Anime', episodeCode: 'E12', plays: 1, unmarkedAt: expect.any(String), daysLeft: 0 },
      { id: 13, titleName: 'Synthetic Film', plays: 1, unmarkedAt: expect.any(String), daysLeft: 30 }
    ])
  })

  it('lists nothing for a user without a Plex connection', async () => {
    harness.givenDb({ select: [[]] })

    await expect(listUnmarked(event())).resolves.toEqual({ items: [] })
  })
})
